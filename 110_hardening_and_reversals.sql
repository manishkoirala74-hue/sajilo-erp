-- 110_hardening_and_reversals.sql

BEGIN;

-- 1. Add new columns to GeneralLedgerJournal
ALTER TABLE "GeneralLedgerJournal" 
ADD COLUMN IF NOT EXISTS reversed_journal_id UUID,
ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN DEFAULT false;

-- 2. Add is_system_account column to ChartOfAccount
ALTER TABLE "ChartOfAccount"
ADD COLUMN IF NOT EXISTS is_system_account BOOLEAN DEFAULT false;

-- 3. Update resolve_item_gl_account_rpc to guarantee HARD FAILS
CREATE OR REPLACE FUNCTION resolve_item_gl_account_rpc(
    p_company_id UUID,
    p_item_id UUID,
    p_account_category TEXT -- 'inventory', 'sales', 'purchase', 'cogs'
) RETURNS UUID AS $$
DECLARE
    v_account_id UUID;
    v_category_id UUID;
    v_settings RECORD;
BEGIN
    -- Tier 1: Item explicit
    IF p_account_category = 'inventory' THEN
        SELECT inventory_account_id::UUID, category_id::UUID INTO v_account_id, v_category_id FROM "Item" WHERE id = p_item_id;
    ELSIF p_account_category = 'sales' THEN
        SELECT sales_account_id::UUID, category_id::UUID INTO v_account_id, v_category_id FROM "Item" WHERE id = p_item_id;
    ELSIF p_account_category = 'purchase' OR p_account_category = 'cogs' THEN
        SELECT purchase_account_id::UUID, category_id::UUID INTO v_account_id, v_category_id FROM "Item" WHERE id = p_item_id;
    END IF;

    IF v_account_id IS NOT NULL THEN RETURN v_account_id; END IF;

    -- Tier 2: Category explicit
    IF v_category_id IS NOT NULL THEN
        IF p_account_category = 'sales' THEN
            SELECT sales_account_id::UUID INTO v_account_id FROM "ItemCategory" WHERE id::UUID = v_category_id;
        ELSIF p_account_category = 'purchase' OR p_account_category = 'cogs' THEN
            SELECT purchase_account_id::UUID INTO v_account_id FROM "ItemCategory" WHERE id::UUID = v_category_id;
        END IF;
        IF v_account_id IS NOT NULL THEN RETURN v_account_id; END IF;
    END IF;

    -- Tier 3: Company Settings fallback
    SELECT * INTO v_settings FROM "CompanySettings" WHERE company_id = p_company_id LIMIT 1;
    IF p_account_category = 'inventory' THEN
        v_account_id := v_settings.gl_default_inventory_account_id::UUID;
    ELSIF p_account_category = 'sales' THEN
        v_account_id := v_settings.gl_default_sales_account_id::UUID;
    ELSIF p_account_category = 'cogs' OR p_account_category = 'purchase' THEN
        v_account_id := v_settings.gl_default_cogs_account_id::UUID;
    END IF;

    IF v_account_id IS NULL THEN
        RAISE EXCEPTION 'GL Mapping Error: Item % is missing % account mappings.', p_item_id, p_account_category;
    END IF;

    RETURN v_account_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Update rpc_reverse_gl_journal to be append-only
CREATE OR REPLACE FUNCTION rpc_reverse_gl_journal(
    p_company_id UUID,
    p_original_journal_id UUID,
    p_reversal_date DATE,
    p_reason TEXT
) RETURNS UUID AS $$
DECLARE
    v_original "GeneralLedgerJournal"%ROWTYPE;
    v_line "GeneralLedgerLine"%ROWTYPE;
    v_new_journal_id UUID;
BEGIN
    SELECT * INTO v_original FROM "GeneralLedgerJournal" WHERE id = p_original_journal_id AND company_id = p_company_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original journal not found.';
    END IF;

    -- Create contra-entry with status = 'Posted'
    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced,
        reversed_journal_id
    ) VALUES (
        p_company_id, p_reversal_date, 'Reversal: ' || v_original.description || ' (' || p_reason || ')', v_original.reference_module, 
        v_original.source_document_id, v_original.source_document_type, 'Posted', v_original.total_credit, v_original.total_debit, v_original.is_balanced,
        p_original_journal_id
    ) RETURNING id INTO v_new_journal_id;

    -- Flip debits and credits for lines
    FOR v_line IN SELECT * FROM "GeneralLedgerLine" WHERE journal_id = p_original_journal_id::TEXT
    LOOP
        INSERT INTO "GeneralLedgerLine" (
            company_id, journal_id, account_id, account_code, account_name, account_type,
            debit_amount, credit_amount, description, entity_type, entity_id, due_date
        ) VALUES (
            p_company_id, v_new_journal_id::TEXT, v_line.account_id, v_line.account_code, v_line.account_name, v_line.account_type,
            v_line.credit_amount, v_line.debit_amount, 'Reversal: ' || v_line.description, v_line.entity_type, v_line.entity_id, v_line.due_date
        );
    END LOOP;

    -- Mark original as reversed but keep status as Posted
    UPDATE "GeneralLedgerJournal" 
    SET is_reversed = true, notes = COALESCE(notes, '') || ' [Reversed on ' || p_reversal_date::TEXT || ']' 
    WHERE id = p_original_journal_id;

    RETURN v_new_journal_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Anti-Tamper Trigger on GeneralLedgerJournal
CREATE OR REPLACE FUNCTION trg_gl_journal_anti_tamper()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'Posted' THEN
        RAISE EXCEPTION 'Append-Only Ledger Violation: Cannot delete a Posted journal entry.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gl_journal_anti_tamper_del ON "GeneralLedgerJournal";
CREATE TRIGGER trg_gl_journal_anti_tamper_del
BEFORE DELETE ON "GeneralLedgerJournal"
FOR EACH ROW
EXECUTE FUNCTION trg_gl_journal_anti_tamper();

-- 6. Kernel-Level Governance Trigger on ChartOfAccount
CREATE OR REPLACE FUNCTION trg_chart_of_account_governance()
RETURNS TRIGGER AS $$
DECLARE
    v_maintenance_mode TEXT;
BEGIN
    -- Check for maintenance backdoor
    BEGIN
        v_maintenance_mode := current_setting('sajilo.maintenance_mode', true);
    EXCEPTION WHEN OTHERS THEN
        v_maintenance_mode := 'false';
    END;

    IF v_maintenance_mode = 'true' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    -- If deleting a system account
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_system_account THEN
            RAISE EXCEPTION 'Kernel Governance Violation: Cannot delete a system account.';
        END IF;
        RETURN OLD;
    END IF;

    -- If updating a system account, block changes to core structural fields
    IF TG_OP = 'UPDATE' THEN
        IF OLD.is_system_account THEN
            IF NEW.statement_group IS DISTINCT FROM OLD.statement_group OR
               NEW.account_type IS DISTINCT FROM OLD.account_type OR
               NEW.account_subtype IS DISTINCT FROM OLD.account_subtype THEN
                RAISE EXCEPTION 'Kernel Governance Violation: Cannot modify structural fields (statement_group, account_type, account_subtype) of a system account.';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chart_of_account_gov ON "ChartOfAccount";
CREATE TRIGGER trg_chart_of_account_gov
BEFORE UPDATE OR DELETE ON "ChartOfAccount"
FOR EACH ROW
EXECUTE FUNCTION trg_chart_of_account_governance();

COMMIT;
