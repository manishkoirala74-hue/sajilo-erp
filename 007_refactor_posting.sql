-- ==============================================================================
-- ATOMIC GL POSTING ARCHITECTURE MIGRATION (SERVER-SIDE)
-- ==============================================================================

-- 1. SCHEMA CHANGES
-- ------------------------------------------------------------------------------
ALTER TABLE "GeneralLedgerLine"
ADD COLUMN IF NOT EXISTS "entity_type" TEXT,
ADD COLUMN IF NOT EXISTS "entity_id" UUID,
ADD COLUMN IF NOT EXISTS "due_date" DATE;

ALTER TABLE "Item"
DROP COLUMN IF EXISTS "total_asset_value";

ALTER TABLE "Item"
ADD COLUMN "total_asset_value" NUMERIC GENERATED ALWAYS AS (quantity_on_hand * COALESCE(weighted_average_cost, purchase_price, 0)) STORED;

-- 2. INDEXING
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "idx_gljournal_company_status_date" ON "GeneralLedgerJournal" ("company_id", "status", "entry_date");
CREATE INDEX IF NOT EXISTS "idx_glline_account_entity_due" ON "GeneralLedgerLine" ("account_id", "entity_type", "entity_id", "due_date");
CREATE INDEX IF NOT EXISTS "idx_coa_company_ledger_type" ON "ChartOfAccount" ("company_id", "ledger_type", "account_type");

-- 3. TRIGGERS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_no_group_posting()
RETURNS TRIGGER AS $$
DECLARE
    v_ledger_type TEXT;
    v_account_name TEXT;
    v_company_id UUID;
BEGIN
    SELECT ledger_type, account_name, company_id INTO v_ledger_type, v_account_name, v_company_id 
    FROM "ChartOfAccount" WHERE id::TEXT = NEW.account_id::TEXT;
    
    IF v_ledger_type = 'Group Ledger' THEN
        RAISE EXCEPTION 'ERR_GROUP_LEDGER_POSTING: Cannot post to Group Ledger "%"', v_account_name
        USING ERRCODE = 'P0001';
    END IF;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Account ID % is missing or invalid.', NEW.account_id
        USING ERRCODE = 'P0002';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_gl_line ON "GeneralLedgerLine";
CREATE TRIGGER trg_validate_gl_line
BEFORE INSERT OR UPDATE ON "GeneralLedgerLine"
FOR EACH ROW EXECUTE FUNCTION check_no_group_posting();

CREATE OR REPLACE FUNCTION update_account_balances()
RETURNS TRIGGER AS $$
DECLARE
    v_normal_balance TEXT;
BEGIN
    SELECT normal_balance INTO v_normal_balance
    FROM "ChartOfAccount" WHERE id::TEXT = NEW.account_id::TEXT;

    UPDATE "ChartOfAccount"
    SET current_balance = current_balance + 
        CASE 
            WHEN v_normal_balance = 'Debit' THEN (NEW.debit_amount - NEW.credit_amount)
            WHEN v_normal_balance = 'Credit' THEN (NEW.credit_amount - NEW.debit_amount)
            ELSE (NEW.debit_amount - NEW.credit_amount) -- Fallback
        END
    WHERE id::TEXT = NEW.account_id::TEXT;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_account_balances ON "GeneralLedgerLine";
CREATE TRIGGER trg_update_account_balances
AFTER INSERT ON "GeneralLedgerLine"
FOR EACH ROW EXECUTE FUNCTION update_account_balances();


-- 4. RPCS
-- ------------------------------------------------------------------------------

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
        RAISE EXCEPTION 'ERR_STRICT_ACCOUNT_MAPPING: Missing % account mapping for item %', p_account_category, p_item_id;
    END IF;

    RETURN v_account_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION rpc_post_gl_transaction(
    p_company_id UUID,
    p_date DATE,
    p_description TEXT,
    p_module TEXT,
    p_source_id UUID,
    p_source_type TEXT,
    p_lines JSONB,
    p_is_reversal BOOLEAN DEFAULT false,
    p_lock_cogs BOOLEAN DEFAULT false
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_cost_at_sale NUMERIC;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_dr NUMERIC;
    v_cr NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_qty NUMERIC;
    v_entity_type TEXT;
    v_entity_id UUID;
    v_due_date DATE;
    v_updated_line_items JSONB := '[]'::JSONB;
    v_original_line_items JSONB;
BEGIN
    -- 1. Create the Journal Header
    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced
    ) VALUES (
        p_company_id, p_date, p_description, p_module, 
        p_source_id::TEXT, p_source_type, 'Posted', 0, 0, false
    ) RETURNING id INTO v_journal_id;

    -- Fetch original line items if source document exists
    IF p_source_type = 'SalesInvoice' THEN
        SELECT line_items INTO v_original_line_items FROM "SalesInvoice" WHERE id = p_source_id;
    ELSIF p_source_type = 'POSSale' THEN
        SELECT line_items INTO v_original_line_items FROM "POSSale" WHERE id = p_source_id;
    ELSIF p_source_type = 'SalesReturn' THEN
        SELECT line_items INTO v_original_line_items FROM "SalesReturn" WHERE id = p_source_id;
    END IF;

    -- 2. Process all lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_dr := COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_cr := COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
        v_entity_type := v_line->>'entity_type';
        
        -- Safe UUID cast handling
        BEGIN
            v_entity_id := (v_line->>'entity_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_entity_id := NULL;
        END;
        
        BEGIN
            v_due_date := (v_line->>'due_date')::DATE;
        EXCEPTION WHEN OTHERS THEN
            v_due_date := p_date;
        END;

        -- Insert normal line
        IF v_dr > 0 OR v_cr > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                company_id, journal_id, account_id, account_code, account_name, account_type,
                debit_amount, credit_amount, description, entity_type, entity_id, due_date
            ) VALUES (
                p_company_id, v_journal_id::TEXT, 
                COALESCE((v_line->>'account_id'), resolve_item_gl_account_rpc(p_company_id, (v_line->>'item_id')::UUID, (v_line->>'account_category'))::TEXT),
                v_line->>'account_code', 
                v_line->>'account_name', 
                v_line->>'account_type',
                v_dr, v_cr, 
                COALESCE(v_line->>'description', p_description),
                v_entity_type, v_entity_id, COALESCE(v_due_date, p_date)
            );
            v_total_debit := v_total_debit + v_dr;
            v_total_credit := v_total_credit + v_cr;
        END IF;

        -- 3. Lock COGS and auto-generate COGS/Inventory Lines if requested
        IF p_lock_cogs = true AND (v_line->>'item_id') IS NOT NULL AND (v_line->>'is_physical')::BOOLEAN = true THEN
            v_item_id := (v_line->>'item_id')::UUID;
            v_qty := (v_line->>'quantity')::NUMERIC;
            
            IF p_is_reversal THEN
                v_cost_at_sale := COALESCE((v_line->>'cost_at_sale')::NUMERIC, 0);
            ELSE
                -- Lock row to prevent race condition during cost reading
                SELECT COALESCE(current_unit_cost, weighted_average_cost, 0) 
                INTO v_cost_at_sale 
                FROM "Item" WHERE id = v_item_id FOR SHARE;
            END IF;

            -- Update JSON array to record frozen cost
            v_line := jsonb_set(v_line, '{cost_at_sale}', to_jsonb(v_cost_at_sale));

            v_cogs_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'cogs');
            v_inv_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'inventory');

            IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL AND v_cost_at_sale > 0 THEN
                IF p_is_reversal THEN
                    -- Reverse: DR Inventory, CR COGS
                    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (p_company_id, v_journal_id::TEXT, v_inv_acc::TEXT, (v_qty * v_cost_at_sale), 0, 'Return in: ' || (v_line->>'item_name'));
                    
                    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (p_company_id, v_journal_id::TEXT, v_cogs_acc::TEXT, 0, (v_qty * v_cost_at_sale), 'COGS reversal: ' || (v_line->>'item_name'));
                ELSE
                    -- Normal: DR COGS, CR Inventory
                    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (p_company_id, v_journal_id::TEXT, v_cogs_acc::TEXT, (v_qty * v_cost_at_sale), 0, 'COGS: ' || (v_line->>'item_name'));
                    
                    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (p_company_id, v_journal_id::TEXT, v_inv_acc::TEXT, 0, (v_qty * v_cost_at_sale), 'Inventory out: ' || (v_line->>'item_name'));
                END IF;

                v_total_debit := v_total_debit + (v_qty * v_cost_at_sale);
                v_total_credit := v_total_credit + (v_qty * v_cost_at_sale);
            END IF;
        END IF;

        v_updated_line_items := v_updated_line_items || v_line;
    END LOOP;

    -- Update Source Documents if this is an origin creation
    IF p_lock_cogs = true AND v_original_line_items IS NOT NULL THEN
        IF p_source_type = 'SalesInvoice' THEN
            UPDATE "SalesInvoice" SET line_items = v_updated_line_items WHERE id = p_source_id;
        ELSIF p_source_type = 'POSSale' THEN
            UPDATE "POSSale" SET line_items = v_updated_line_items WHERE id = p_source_id;
        ELSIF p_source_type = 'SalesReturn' THEN
            UPDATE "SalesReturn" SET line_items = v_updated_line_items WHERE id = p_source_id;
        END IF;
    END IF;

    UPDATE "GeneralLedgerJournal"
    SET total_debit = v_total_debit,
        total_credit = v_total_credit,
        is_balanced = (ABS(v_total_debit - v_total_credit) < 0.01)
    WHERE id = v_journal_id;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION rpc_reverse_gl_transaction(
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

    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced
    ) VALUES (
        p_company_id, p_reversal_date, 'Reversal: ' || v_original.description || ' (' || p_reason || ')', v_original.reference_module, 
        v_original.source_document_id, v_original.source_document_type, 'Cancelled', v_original.total_credit, v_original.total_debit, v_original.is_balanced
    ) RETURNING id INTO v_new_journal_id;

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

    UPDATE "GeneralLedgerJournal" SET status = 'Cancelled', notes = 'Reversed on ' || p_reversal_date::TEXT WHERE id = p_original_journal_id;

    RETURN v_new_journal_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION rpc_post_stock_adjustment(
    p_company_id UUID,
    p_adjustment_id UUID,
    p_adjustment_date DATE,
    p_reason TEXT,
    p_lines JSONB
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_diff_qty NUMERIC;
    v_current_cost NUMERIC;
    v_cost_impact NUMERIC;
    v_inv_acc UUID;
    v_var_acc UUID;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
BEGIN
    SELECT gl_stock_variance_account_id::UUID INTO v_var_acc FROM "CompanySettings" WHERE company_id = p_company_id LIMIT 1;
    IF v_var_acc IS NULL THEN
        RAISE EXCEPTION 'ERR_STRICT_ACCOUNT_MAPPING: Missing Stock Variance Account in Company Settings';
    END IF;

    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced
    ) VALUES (
        p_company_id, p_adjustment_date, 'Stock Adjustment — ' || p_reason, 'Stock', 
        p_adjustment_id::TEXT, 'StockAdjustment', 'Posted', 0, 0, false
    ) RETURNING id INTO v_journal_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_diff_qty := (v_line->>'difference_qty')::NUMERIC;
        IF v_diff_qty = 0 THEN CONTINUE; END IF;

        -- Strict Row Lock on Item
        SELECT COALESCE(weighted_average_cost, current_unit_cost, 0) INTO v_current_cost
        FROM "Item" WHERE id = v_item_id FOR UPDATE;

        v_cost_impact := ABS(v_diff_qty) * v_current_cost;
        IF v_cost_impact = 0 THEN CONTINUE; END IF;

        v_inv_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'inventory');

        -- Update Item Stock
        UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_diff_qty WHERE id = v_item_id;

        IF v_diff_qty > 0 THEN
            INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
            VALUES (p_company_id, v_journal_id::TEXT, v_inv_acc::TEXT, v_cost_impact, 0, 'Stock up: ' || (v_line->>'item_name'));
            INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
            VALUES (p_company_id, v_journal_id::TEXT, v_var_acc::TEXT, 0, v_cost_impact, 'Stock up: ' || (v_line->>'item_name'));
        ELSE
            INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
            VALUES (p_company_id, v_journal_id::TEXT, v_var_acc::TEXT, v_cost_impact, 0, 'Stock down: ' || (v_line->>'item_name'));
            INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, debit_amount, credit_amount, description) 
            VALUES (p_company_id, v_journal_id::TEXT, v_inv_acc::TEXT, 0, v_cost_impact, 'Stock down: ' || (v_line->>'item_name'));
        END IF;

        v_total_debit := v_total_debit + v_cost_impact;
        v_total_credit := v_total_credit + v_cost_impact;
    END LOOP;

    UPDATE "GeneralLedgerJournal"
    SET total_debit = v_total_debit, total_credit = v_total_credit, is_balanced = (ABS(v_total_debit - v_total_credit) < 0.01)
    WHERE id = v_journal_id;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION get_periodic_inventory_balances_rpc(
    p_company_id UUID,
    p_from_date DATE,
    p_to_date DATE
) RETURNS TABLE (
    opening_stock NUMERIC,
    closing_stock NUMERIC,
    net_purchases NUMERIC
) AS $$
DECLARE
    v_inv_accounts UUID[];
    v_cogs_accounts UUID[];
    v_opening NUMERIC := 0;
    v_closing NUMERIC := 0;
    v_net_purchases NUMERIC := 0;
    v_cogs_total NUMERIC := 0;
BEGIN
    SELECT array_agg(id) INTO v_inv_accounts FROM "ChartOfAccount" 
    WHERE company_id = p_company_id AND (account_type = 'Asset' AND (account_name ILIKE '%inventory%' OR account_name ILIKE '%stock%'));
    
    SELECT array_agg(id) INTO v_cogs_accounts FROM "ChartOfAccount" 
    WHERE company_id = p_company_id AND account_type IN ('COGS', 'Cost of Goods Sold');

    SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_opening
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON j.id::TEXT = l.journal_id
    WHERE l.account_id::UUID = ANY(v_inv_accounts) AND j.company_id = p_company_id AND j.status = 'Posted' AND j.entry_date < p_from_date;

    SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_closing
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON j.id::TEXT = l.journal_id
    WHERE l.account_id::UUID = ANY(v_inv_accounts) AND j.company_id = p_company_id AND j.status = 'Posted' AND j.entry_date <= p_to_date;

    SELECT COALESCE(SUM(debit_amount - credit_amount), 0) INTO v_cogs_total
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON j.id::TEXT = l.journal_id
    WHERE l.account_id::UUID = ANY(v_cogs_accounts) AND j.company_id = p_company_id AND j.status = 'Posted' AND j.entry_date >= p_from_date AND j.entry_date <= p_to_date;

    v_net_purchases := v_closing - v_opening + v_cogs_total;

    RETURN QUERY SELECT v_opening, v_closing, v_net_purchases;
END;
$$ LANGUAGE plpgsql;
