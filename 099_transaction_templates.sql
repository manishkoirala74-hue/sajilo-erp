-- 1. Create the Transaction Template Validator
CREATE OR REPLACE FUNCTION rpc_validate_journal_template(p_source_type TEXT, p_gl_lines JSONB, p_source_id UUID)
RETURNS VOID AS $$
DECLARE
    v_has_ar BOOLEAN := false;
    v_has_revenue BOOLEAN := false;
    v_has_cogs BOOLEAN := false;
    v_has_inventory BOOLEAN := false;
    v_physical_items_count INT := 0;
    v_line JSONB;
    v_acc_type TEXT;
    v_acc_cat TEXT;
BEGIN
    IF p_source_type = 'SalesInvoice' THEN
        -- Check if invoice contains physical items
        SELECT COUNT(*) INTO v_physical_items_count
        FROM "SalesInvoice" si
        CROSS JOIN jsonb_array_elements(si.line_items) AS li
        JOIN "Item" i ON i.id = NULLIF(TRIM(li->>'item_id'), '')::UUID
        WHERE si.id = p_source_id AND i.is_physical = true;

        -- Loop through GL lines
        FOR v_line IN SELECT * FROM jsonb_array_elements(p_gl_lines)
        LOOP
            v_acc_cat := v_line->>'account_category';
            SELECT account_type INTO v_acc_type FROM "ChartOfAccount" WHERE id = (v_line->>'account_id')::UUID;
            
            -- Detect AR / Cash (Debit side of Sale)
            IF v_acc_cat ILIKE '%receivable%' OR v_acc_type ILIKE '%receivable%' OR v_acc_type ILIKE '%cash%' OR v_acc_type ILIKE '%bank%' THEN
                v_has_ar := true;
            END IF;
            
            -- Detect Revenue (Credit side of Sale)
            IF v_acc_cat ILIKE '%sales%' OR v_acc_type ILIKE '%revenue%' OR v_acc_type ILIKE '%income%' THEN
                v_has_revenue := true;
            END IF;
            
            -- Detect COGS (Debit side of Cost)
            IF v_acc_cat ILIKE '%cogs%' OR v_acc_type ILIKE '%cogs%' OR v_acc_type ILIKE '%expense%' THEN
                v_has_cogs := true;
            END IF;
            
            -- Detect Inventory (Credit side of Cost)
            IF v_acc_cat ILIKE '%inventory%' OR v_acc_type ILIKE '%asset%' THEN
                v_has_inventory := true;
            END IF;
        END LOOP;

        IF NOT v_has_ar THEN
            RAISE EXCEPTION 'ERR_INCOMPLETE_JOURNAL: Missing Accounts Receivable (or Cash) leg for SalesInvoice.';
        END IF;

        IF NOT v_has_revenue THEN
            RAISE EXCEPTION 'ERR_INCOMPLETE_JOURNAL: Missing Sales Revenue leg for SalesInvoice.';
        END IF;

        IF v_physical_items_count > 0 THEN
            IF NOT v_has_cogs THEN
                RAISE EXCEPTION 'ERR_INCOMPLETE_JOURNAL: Missing COGS leg for physical sale.';
            END IF;
            IF NOT v_has_inventory THEN
                RAISE EXCEPTION 'ERR_INCOMPLETE_JOURNAL: Missing Inventory leg for physical sale.';
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. Upgrade the Core Ledger Hub to use the Template Validator and Rounding Tolerance
CREATE OR REPLACE FUNCTION rpc_commit_journal_entry_internal(
    p_company_id UUID,
    p_date DATE,
    p_description TEXT,
    p_module TEXT,
    p_source_id UUID,
    p_source_type TEXT,
    p_voucher_no TEXT,
    p_lines JSONB
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_line JSONB;
BEGIN
    -- [PHASE 1] Execute Template Validation Guardrail
    PERFORM rpc_validate_journal_template(p_source_type, p_lines, p_source_id);

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_total_debit := v_total_debit + COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_total_credit := v_total_credit + COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
    END LOOP;

    IF v_total_debit = 0 AND v_total_credit = 0 THEN
        RETURN NULL; 
    END IF;

    -- [PHASE 1] Floating-Point Safety Net: Allow 0.01 tolerance for standard VAT fractional anomalies
    IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
        RAISE EXCEPTION 'ERR_UNBALANCED_JOURNAL: Total Debit (%) does not equal Total Credit (%)', v_total_debit, v_total_credit;
    END IF;

    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced, voucher_no
    ) VALUES (
        p_company_id, p_date, p_description, p_module, 
        p_source_id, p_source_type, 'Posted', v_total_debit, v_total_credit, true, p_voucher_no
    ) RETURNING id INTO v_journal_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        IF COALESCE((v_line->>'debit_amount')::NUMERIC, 0) > 0 OR COALESCE((v_line->>'credit_amount')::NUMERIC, 0) > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                company_id, journal_id, account_id, description, debit_amount, credit_amount, entity_type, entity_id, due_date
            ) VALUES (
                p_company_id,
                v_journal_id,
                NULLIF(TRIM(v_line->>'account_id'), '')::UUID,
                v_line->>'description',
                COALESCE((v_line->>'debit_amount')::NUMERIC, 0),
                COALESCE((v_line->>'credit_amount')::NUMERIC, 0),
                v_line->>'entity_type',
                NULLIF(TRIM(v_line->>'entity_id'), '')::UUID,
                (v_line->>'due_date')::DATE
            );
        END IF;
    END LOOP;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;
