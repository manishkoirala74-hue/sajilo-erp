-- Hotfix: Restore Stock updates & COGS generation on Sales/Purchase postings
-- This script merges the GL Reversal fixes with the stock updates and COGS calculation.

-- 1. Redefine rpc_post_sales_invoice
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
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_item_type TEXT;
    v_cost_at_sale NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_final_gl_lines JSONB := '[]'::JSONB;
    v_user_gl_line JSONB;
BEGIN
    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF v_invoice.id IS NOT NULL THEN RETURN jsonb_build_object('status', 'duplicate', 'journal_id', NULL); END IF;

    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    
    IF p_is_reversal THEN 
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'SalesInvoice'); 
        
        -- Revert Stock
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
        LOOP
            v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
            v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
            
            IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
                SELECT item_type INTO v_item_type FROM "Item" WHERE id = v_item_id FOR UPDATE;
                IF v_item_type = 'Product' THEN
                    UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_quantity WHERE id = v_item_id;
                END IF;
            END IF;
        END LOOP;
        
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
    END IF;

    -- Load user lines (AR, VAT, Sales Revenue)
    FOR v_user_gl_line IN SELECT * FROM jsonb_array_elements(p_gl_lines) LOOP
        v_final_gl_lines := v_final_gl_lines || v_user_gl_line;
    END LOOP;

    -- Calculate COGS, subtract stock, and append COGS journal lines
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            -- Row-level concurrency lock on Item
            SELECT item_type, COALESCE(current_unit_cost, weighted_average_cost, 0)
            INTO v_item_type, v_cost_at_sale 
            FROM "Item" 
            WHERE id = v_item_id 
            FOR UPDATE;

            IF v_item_type = 'Product' THEN
                IF v_cost_at_sale > 0 THEN
                    v_cogs_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'cogs');
                    v_inv_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'inventory');
                    
                    IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL THEN
                        v_final_gl_lines := v_final_gl_lines || jsonb_build_object(
                            'account_id', v_cogs_acc, 'debit_amount', v_quantity * v_cost_at_sale, 'credit_amount', 0,
                            'description', 'COGS for ' || v_invoice.invoice_number
                        );
                        v_final_gl_lines := v_final_gl_lines || jsonb_build_object(
                            'account_id', v_inv_acc, 'debit_amount', 0, 'credit_amount', v_quantity * v_cost_at_sale,
                            'description', 'Inventory Out for ' || v_invoice.invoice_number
                        );
                    END IF;
                END IF;

                UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_quantity WHERE id = v_item_id;
            END IF;
        END IF;
    END LOOP;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, 
        v_invoice.invoice_date::DATE, 
        COALESCE(v_invoice.notes, 'Sales Invoice ' || v_invoice.invoice_number),
        'Sales', 
        p_invoice_id, 
        'SalesInvoice', 
        v_invoice.invoice_number, 
        v_final_gl_lines
    );

    UPDATE "SalesInvoice" SET status = 'Posted', idempotency_key = p_idempotency_key WHERE id = p_invoice_id;
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;


-- 2. Redefine rpc_post_purchase_invoice
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
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_item_type TEXT;
BEGIN
    SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF v_invoice.id IS NOT NULL THEN RETURN jsonb_build_object('status', 'duplicate', 'journal_id', NULL); END IF;

    SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    
    IF p_is_reversal THEN 
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'PurchaseInvoice'); 
        
        -- Revert Stock
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
        LOOP
            v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
            v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
            
            IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
                SELECT item_type INTO v_item_type FROM "Item" WHERE id = v_item_id FOR UPDATE;
                IF v_item_type = 'Product' THEN
                    UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_quantity WHERE id = v_item_id;
                END IF;
            END IF;
        END LOOP;
        
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
    END IF;

    -- Add Stock
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT item_type INTO v_item_type FROM "Item" WHERE id = v_item_id FOR UPDATE;
            IF v_item_type = 'Product' THEN
                UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_quantity WHERE id = v_item_id;
            END IF;
        END IF;
    END LOOP;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, 
        v_invoice.invoice_date::DATE, 
        COALESCE(v_invoice.notes, 'Purchase Invoice ' || v_invoice.invoice_number),
        'Purchases', 
        p_invoice_id, 
        'PurchaseInvoice', 
        v_invoice.invoice_number, 
        p_gl_lines
    );

    UPDATE "PurchaseInvoice" SET status = 'Posted', idempotency_key = p_idempotency_key WHERE id = p_invoice_id;
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;


-- 3. Recalculate and sync stock quantities for all items from transaction history
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Reset all Product item stock to 0
    UPDATE "Item" SET quantity_on_hand = 0 WHERE item_type = 'Product';

    -- Add Posted Purchase Invoices
    FOR r IN 
        SELECT (line->>'item_id')::UUID as item_id, SUM(COALESCE((line->>'quantity')::NUMERIC, 0)) as total_qty
        FROM "PurchaseInvoice" pi,
             jsonb_array_elements(pi.line_items) as line
        WHERE pi.status = 'Posted' AND line->>'item_id' IS NOT NULL AND line->>'item_id' != ''
        GROUP BY (line->>'item_id')
    LOOP
        UPDATE "Item" SET quantity_on_hand = quantity_on_hand + r.total_qty WHERE id = r.item_id;
    END LOOP;

    -- Subtract Posted Sales Invoices
    FOR r IN 
        SELECT (line->>'item_id')::UUID as item_id, SUM(COALESCE((line->>'quantity')::NUMERIC, 0)) as total_qty
        FROM "SalesInvoice" si,
             jsonb_array_elements(si.line_items) as line
        WHERE si.status = 'Posted' AND line->>'item_id' IS NOT NULL AND line->>'item_id' != ''
        GROUP BY (line->>'item_id')
    LOOP
        UPDATE "Item" SET quantity_on_hand = quantity_on_hand - r.total_qty WHERE id = r.item_id;
    END LOOP;

    -- Apply Stock Adjustments
    FOR r IN 
        SELECT (line->>'item_id')::UUID as item_id, SUM(COALESCE((line->>'difference_qty')::NUMERIC, 0)) as total_qty
        FROM "StockAdjustment" sa,
             jsonb_array_elements(sa.line_items) as line
        WHERE sa.status = 'Posted' AND line->>'item_id' IS NOT NULL AND line->>'item_id' != ''
        GROUP BY (line->>'item_id')
    LOOP
        UPDATE "Item" SET quantity_on_hand = quantity_on_hand + r.total_qty WHERE id = r.item_id;
    END LOOP;
END $$;
