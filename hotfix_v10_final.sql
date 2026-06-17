BEGIN;

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
        RETURN jsonb_build_object('status', 'duplicate');
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
    SET status = 'Posted', idempotency_key = p_idempotency_key 
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
        RETURN jsonb_build_object('status', 'duplicate');
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
    SET status = 'Posted', idempotency_key = p_idempotency_key 
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;

COMMIT;
