-- 1. Redefine rpc_checkout_sales_invoice to inject COGS and Inventory GL lines even for zero cost items
CREATE OR REPLACE FUNCTION rpc_checkout_sales_invoice(p_payload JSONB, p_idempotency_key UUID, p_gl_lines JSONB)
RETURNS JSONB AS $$
DECLARE
    v_invoice_id UUID;
    v_journal_id UUID;
    v_company_id UUID;
    v_invoice_date DATE;
    v_invoice_number VARCHAR;
    v_notes VARCHAR;
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_cost_at_sale NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_is_physical BOOLEAN;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public."TransactionLocks" (idempotency_key) VALUES (p_idempotency_key);
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_invoice_date := (p_payload->>'invoice_date')::DATE;
    v_invoice_number := p_payload->>'invoice_number';
    v_notes := COALESCE(p_payload->>'notes', 'Sales Invoice ' || v_invoice_number);

    -- Calculate COGS and Inventory lines for each physical item sold
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0)
            INTO v_is_physical, v_cost_at_sale 
            FROM "Item" 
            WHERE id = v_item_id;

            IF v_is_physical THEN
                v_cogs_acc := resolve_item_gl_account_rpc(v_company_id, v_item_id, 'cogs');
                v_inv_acc := resolve_item_gl_account_rpc(v_company_id, v_item_id, 'inventory');
                
                IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL THEN
                    p_gl_lines := p_gl_lines || jsonb_build_object(
                        'account_id', v_cogs_acc, 
                        'account_category', 'cogs', 
                        'debit_amount', v_quantity * COALESCE(v_cost_at_sale, 0), 
                        'credit_amount', 0,
                        'description', 'COGS for ' || v_invoice_number
                    );
                    p_gl_lines := p_gl_lines || jsonb_build_object(
                        'account_id', v_inv_acc, 
                        'account_category', 'inventory', 
                        'debit_amount', 0, 
                        'credit_amount', v_quantity * COALESCE(v_cost_at_sale, 0),
                        'description', 'Inventory Out for ' || v_invoice_number
                    );
                END IF;
            END IF;
        END IF;
    END LOOP;

    v_invoice_id := rpc_internal_save_sales_invoice(p_payload);
    PERFORM rpc_internal_deduct_stock(v_company_id, v_invoice_id);
    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id, v_invoice_date, v_notes,
        'SalesInvoice', v_invoice_id, 'SalesInvoice', v_invoice_number, p_gl_lines
    );

    RETURN jsonb_build_object('status', 'success', 'invoice_id', v_invoice_id, 'journal_id', v_journal_id);
EXCEPTION 
    WHEN unique_violation THEN
        RAISE EXCEPTION 'ERR_IDEMPOTENCY: This transaction has already been processed.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- 2. Modify rpc_commit_journal_entry_internal to allow 0 value lines for cogs and inventory
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
        IF COALESCE((v_line->>'debit_amount')::NUMERIC, 0) > 0 
           OR COALESCE((v_line->>'credit_amount')::NUMERIC, 0) > 0 
           OR v_line->>'account_category' IN ('cogs', 'inventory') THEN
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
