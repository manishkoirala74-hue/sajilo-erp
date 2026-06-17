BEGIN;

DROP FUNCTION IF EXISTS rpc_commit_journal_entry_internal(uuid, date, text, text, uuid, text, text, jsonb);

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
    v_dr NUMERIC;
    v_cr NUMERIC;
    v_entity_type TEXT;
    v_entity_id UUID;
    v_due_date DATE;
    v_account_id UUID;
BEGIN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_total_debit := v_total_debit + COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_total_credit := v_total_credit + COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
    END LOOP;

    IF ABS(v_total_debit - v_total_credit) >= 0.01 THEN
        RAISE EXCEPTION 'ERR_UNBALANCED_JOURNAL: Debits (%) do not equal Credits (%).', v_total_debit, v_total_credit;
    END IF;

    IF v_total_debit = 0 AND v_total_credit = 0 THEN
        RETURN NULL; 
    END IF;

    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced, voucher_no
    ) VALUES (
        p_company_id, p_date, p_description, p_module, 
        p_source_id, p_source_type, 'Posted', v_total_debit, v_total_credit, true, p_voucher_no
    ) RETURNING id INTO v_journal_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_dr := COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_cr := COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
        v_entity_type := v_line->>'entity_type';
        v_entity_id := NULLIF(TRIM(v_line->>'entity_id'), '')::UUID;
        
        BEGIN v_due_date := (v_line->>'due_date')::DATE; EXCEPTION WHEN OTHERS THEN v_due_date := p_date; END;

        IF (v_line->>'account_id') IS NOT NULL AND TRIM(v_line->>'account_id') != '' THEN
            v_account_id := NULLIF(TRIM(v_line->>'account_id'), '')::UUID;
        ELSIF (v_line->>'account_category') IS NOT NULL AND (v_line->>'item_id') IS NOT NULL AND TRIM(v_line->>'item_id') != '' THEN
            v_account_id := resolve_item_gl_account_rpc(p_company_id, NULLIF(TRIM(v_line->>'item_id'), '')::UUID, (v_line->>'account_category'));
        ELSE
            RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Cannot post GL line without an account_id.';
        END IF;

        IF v_dr > 0 OR v_cr > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                journal_id, company_id, account_id, account_code, account_name, account_type,
                debit_amount, credit_amount, description, entity_type, entity_id, due_date
            ) VALUES (
                v_journal_id, p_company_id, v_account_id, 
                v_line->>'account_code', v_line->>'account_name', v_line->>'account_type',
                v_dr, v_cr, COALESCE(v_line->>'description', p_description),
                v_entity_type, v_entity_id, COALESCE(v_due_date, p_date)
            );
        END IF;
    END LOOP;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rpc_post_sales_invoice(
    p_company_id UUID,
    p_invoice_id UUID,
    p_idempotency_key UUID,
    p_gl_lines JSONB,
    p_is_reversal BOOLEAN DEFAULT false
) RETURNS JSONB AS $$
DECLARE
    v_journal_id UUID;
    v_invoice RECORD;
    v_item RECORD;
    v_cost_at_sale NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_final_gl_lines JSONB := '[]'::JSONB;
    v_user_gl_line JSONB;
BEGIN
    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF v_invoice.id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_invoice.gl_journal_id);
    END IF;

    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

    IF p_is_reversal THEN
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'SalesInvoice');
        
        FOR v_item IN SELECT * FROM "SalesInvoiceLine" WHERE invoice_id = p_invoice_id LOOP
            IF v_item.item_id IS NOT NULL AND v_item.item_id != '' THEN
                UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_item.quantity WHERE id = v_item.item_id::UUID AND item_type = 'Product';
            END IF;
        END LOOP;
    END IF;

    FOR v_user_gl_line IN SELECT * FROM jsonb_array_elements(p_gl_lines) LOOP
        v_final_gl_lines := v_final_gl_lines || v_user_gl_line;
    END LOOP;

    FOR v_item IN 
        SELECT sil.*, i.item_type, COALESCE(i.current_unit_cost, i.weighted_average_cost, 0) as current_cost
        FROM "SalesInvoiceLine" sil
        JOIN "Item" i ON sil.item_id::UUID = i.id
        WHERE sil.invoice_id = p_invoice_id
    LOOP
        IF v_item.item_type = 'Product' THEN
            SELECT COALESCE(current_unit_cost, weighted_average_cost, 0) 
            INTO v_cost_at_sale 
            FROM "Item" 
            WHERE id = v_item.item_id::UUID 
            FOR UPDATE;

            IF v_cost_at_sale > 0 THEN
                v_cogs_acc := resolve_item_gl_account_rpc(p_company_id, v_item.item_id::UUID, 'cogs');
                v_inv_acc := resolve_item_gl_account_rpc(p_company_id, v_item.item_id::UUID, 'inventory');
                
                IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL THEN
                    v_final_gl_lines := v_final_gl_lines || jsonb_build_object(
                        'account_id', v_cogs_acc, 'debit_amount', v_item.quantity * v_cost_at_sale, 'credit_amount', 0,
                        'description', 'COGS for ' || v_invoice.invoice_number
                    );
                    v_final_gl_lines := v_final_gl_lines || jsonb_build_object(
                        'account_id', v_inv_acc, 'debit_amount', 0, 'credit_amount', v_item.quantity * v_cost_at_sale,
                        'description', 'Inventory Out for ' || v_invoice.invoice_number
                    );
                END IF;
            END IF;

            UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_item.quantity WHERE id = v_item.item_id::UUID;
        END IF;
    END LOOP;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, 
        v_invoice.invoice_date::DATE, 
        'Sales Invoice ' || v_invoice.invoice_number,
        'Sales', 
        p_invoice_id, 
        'SalesInvoice', 
        v_invoice.invoice_number, 
        v_final_gl_lines
    );

    UPDATE "SalesInvoice" 
    SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rpc_post_purchase_invoice(
    p_company_id UUID,
    p_invoice_id UUID,
    p_idempotency_key UUID,
    p_gl_lines JSONB,
    p_is_reversal BOOLEAN DEFAULT false
) RETURNS JSONB AS $$
DECLARE
    v_journal_id UUID;
    v_invoice RECORD;
    v_item RECORD;
    v_final_gl_lines JSONB := '[]'::JSONB;
    v_user_gl_line JSONB;
BEGIN
    SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF v_invoice.id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_invoice.gl_journal_id);
    END IF;

    SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

    IF p_is_reversal THEN
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'PurchaseInvoice');
        
        FOR v_item IN SELECT * FROM "PurchaseInvoiceLine" WHERE invoice_id = p_invoice_id LOOP
            IF v_item.item_id IS NOT NULL AND v_item.item_id != '' THEN
                UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_item.quantity WHERE id = v_item.item_id::UUID AND item_type = 'Product';
            END IF;
        END LOOP;
    END IF;

    FOR v_user_gl_line IN SELECT * FROM jsonb_array_elements(p_gl_lines) LOOP
        v_final_gl_lines := v_final_gl_lines || v_user_gl_line;
    END LOOP;

    FOR v_item IN 
        SELECT pil.*, i.item_type
        FROM "PurchaseInvoiceLine" pil
        JOIN "Item" i ON pil.item_id::UUID = i.id
        WHERE pil.invoice_id = p_invoice_id
    LOOP
        IF v_item.item_type = 'Product' THEN
            UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_item.quantity WHERE id = v_item.item_id::UUID;
        END IF;
    END LOOP;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, 
        v_invoice.invoice_date::DATE, 
        'Purchase Invoice ' || v_invoice.invoice_number,
        'Purchases', 
        p_invoice_id, 
        'PurchaseInvoice', 
        v_invoice.invoice_number, 
        v_final_gl_lines
    );

    UPDATE "PurchaseInvoice" 
    SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;

COMMIT;
