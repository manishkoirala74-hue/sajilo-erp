-- 064_godown_ledger_posting.sql
-- Phase 3: Ledger Posting Logic with Zero-Failure Architecture

-- 1. Schema Alterations
ALTER TABLE public."InventoryLedger" ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE public."InventoryLedger" ADD COLUMN IF NOT EXISTS reference_type TEXT;
ALTER TABLE public."InventoryLedger" ADD COLUMN IF NOT EXISTS ledger_status VARCHAR(20) DEFAULT 'Active';

CREATE INDEX IF NOT EXISTS idx_invledger_reference ON public."InventoryLedger" (reference_id, reference_type);
CREATE INDEX IF NOT EXISTS idx_invledger_status ON public."InventoryLedger" (ledger_status);

-- 2. Modify rpc_post_sales_invoice
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
    v_cost_at_sale NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_final_gl_lines JSONB := '[]'::JSONB;
    v_user_gl_line JSONB;
    v_is_physical BOOLEAN;
    v_existing RECORD;
BEGIN
    -- Idempotency Check
    IF EXISTS (SELECT 1 FROM "InventoryLedger" WHERE reference_id = p_invoice_id AND ledger_status = 'Active') AND NOT p_is_reversal THEN 
        RETURN jsonb_build_object('status', 'duplicate'); 
    END IF;

    SELECT * INTO v_existing FROM "SalesInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN 
        SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
        RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_invoice.gl_journal_id); 
    END IF;

    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    
    IF p_is_reversal THEN 
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'SalesInvoice'); 
        
        -- Revert Stock (Immutability Mandate)
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
        LOOP
            v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
            v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
            
            IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
                SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id FOR UPDATE;
                IF v_is_physical THEN
                    UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_quantity WHERE id = v_item_id;
                    
                    -- Offset entry
                    INSERT INTO "InventoryLedger" (
                        company_id, item_id, transaction_type, godown_id, quantity_out, transaction_date, reference_id, reference_type, ledger_status
                    ) VALUES (
                        p_company_id, v_item_id, 'SalesInvoice', v_invoice.godown_id, -v_quantity, v_invoice.invoice_date, p_invoice_id, 'SalesInvoice', 'Active'
                    );
                END IF;
            END IF;
        END LOOP;
        
        -- Mark original entries as Reversed
        UPDATE "InventoryLedger" SET ledger_status = 'Reversed' 
        WHERE reference_id = p_invoice_id AND reference_type = 'SalesInvoice' AND ledger_status = 'Active' AND quantity_out > 0;
        
        DELETE FROM "InventoryHistory" WHERE reference_id = p_invoice_id AND reference_type = 'SalesInvoice';
        
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
    END IF;

    FOR v_user_gl_line IN SELECT * FROM jsonb_array_elements(p_gl_lines) LOOP
        v_final_gl_lines := v_final_gl_lines || v_user_gl_line;
    END LOOP;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0)
            INTO v_is_physical, v_cost_at_sale 
            FROM "Item" 
            WHERE id = v_item_id 
            FOR UPDATE;

            IF v_is_physical THEN
                -- Server-Side Concurrency Safeguard
                IF (SELECT current_qty FROM "CurrentStock" WHERE item_id = v_item_id AND godown_id = v_invoice.godown_id) < v_quantity THEN
                    RAISE EXCEPTION 'Insufficient stock in this Godown for item %', v_item_id;
                END IF;

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

                INSERT INTO "InventoryLedger" (
                    company_id, item_id, transaction_type, godown_id, quantity_out, transaction_date, reference_id, reference_type
                ) VALUES (
                    p_company_id, v_item_id, 'SalesInvoice', v_invoice.godown_id, v_quantity, v_invoice.invoice_date, p_invoice_id, 'SalesInvoice'
                );
            END IF;
        END IF;
    END LOOP;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, v_invoice.invoice_date::DATE, 
        COALESCE(v_invoice.notes, 'Sales Invoice ' || v_invoice.invoice_number),
        'SalesInvoice', p_invoice_id, 'SalesInvoice', v_invoice.invoice_number, v_final_gl_lines
    );

    UPDATE "SalesInvoice" SET status = 'Posted', idempotency_key = p_idempotency_key WHERE id = p_invoice_id;
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;


-- 3. Modify rpc_post_purchase_invoice
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
    v_is_physical BOOLEAN;
    v_existing RECORD;
BEGIN
    -- Idempotency Check
    IF EXISTS (SELECT 1 FROM "InventoryLedger" WHERE reference_id = p_invoice_id AND ledger_status = 'Active') AND NOT p_is_reversal THEN 
        RETURN jsonb_build_object('status', 'duplicate'); 
    END IF;

    SELECT * INTO v_existing FROM "PurchaseInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN 
        SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE id = p_invoice_id;
        RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_invoice.gl_journal_id); 
    END IF;

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
                SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id FOR UPDATE;
                IF v_is_physical THEN
                    UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_quantity WHERE id = v_item_id;
                    
                    -- Offset entry
                    INSERT INTO "InventoryLedger" (
                        company_id, item_id, transaction_type, godown_id, quantity_in, transaction_date, reference_id, reference_type, ledger_status
                    ) VALUES (
                        p_company_id, v_item_id, 'PurchaseInvoice', v_invoice.godown_id, -v_quantity, v_invoice.invoice_date, p_invoice_id, 'PurchaseInvoice', 'Active'
                    );
                END IF;
            END IF;
        END LOOP;
        
        -- Mark original entries as Reversed
        UPDATE "InventoryLedger" SET ledger_status = 'Reversed' 
        WHERE reference_id = p_invoice_id AND reference_type = 'PurchaseInvoice' AND ledger_status = 'Active' AND quantity_in > 0;
        
        DELETE FROM "InventoryHistory" WHERE reference_id = p_invoice_id AND reference_type = 'PurchaseInvoice';
        
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id FOR UPDATE;
            IF v_is_physical THEN
                UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_quantity WHERE id = v_item_id;

                INSERT INTO "InventoryLedger" (
                    company_id, item_id, transaction_type, godown_id, quantity_in, transaction_date, reference_id, reference_type
                ) VALUES (
                    p_company_id, v_item_id, 'PurchaseInvoice', v_invoice.godown_id, v_quantity, v_invoice.invoice_date, p_invoice_id, 'PurchaseInvoice'
                );
            END IF;
        END IF;
    END LOOP;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, v_invoice.invoice_date::DATE, 
        COALESCE(v_invoice.notes, 'Purchase Invoice ' || v_invoice.invoice_number),
        'Purchases', p_invoice_id, 'PurchaseInvoice', v_invoice.invoice_number, p_gl_lines
    );

    UPDATE "PurchaseInvoice" SET status = 'Posted', idempotency_key = p_idempotency_key WHERE id = p_invoice_id;
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;


-- 4. Atomic Stock Transfer RPC
CREATE OR REPLACE FUNCTION rpc_post_stock_transfer(
    p_company_id UUID,
    p_transfer_id UUID,
    p_idempotency_key UUID,
    p_source_godown_id UUID,
    p_dest_godown_id UUID,
    p_items JSONB,
    p_transfer_date TIMESTAMP WITH TIME ZONE
) RETURNS JSONB AS $$
DECLARE
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_existing RECORD;
BEGIN
    -- Idempotency Check
    IF EXISTS (SELECT 1 FROM "InventoryLedger" WHERE reference_id = p_transfer_id AND ledger_status = 'Active') THEN 
        RETURN jsonb_build_object('status', 'duplicate'); 
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            
            -- Server-Side Concurrency Safeguard for Source Godown
            IF (SELECT current_qty FROM "CurrentStock" WHERE item_id = v_item_id AND godown_id = p_source_godown_id) < v_quantity THEN
                RAISE EXCEPTION 'Insufficient stock in Source Godown for item %', v_item_id;
            END IF;

            -- 1. Outward from Source
            INSERT INTO "InventoryLedger" (
                company_id, item_id, transaction_type, godown_id, quantity_out, transaction_date, reference_id, reference_type
            ) VALUES (
                p_company_id, v_item_id, 'StockTransfer', p_source_godown_id, v_quantity, p_transfer_date, p_transfer_id, 'StockTransfer'
            );

            -- 2. Inward to Destination
            INSERT INTO "InventoryLedger" (
                company_id, item_id, transaction_type, godown_id, quantity_in, transaction_date, reference_id, reference_type
            ) VALUES (
                p_company_id, v_item_id, 'StockTransfer', p_dest_godown_id, v_quantity, p_transfer_date, p_transfer_id, 'StockTransfer'
            );
            
        END IF;
    END LOOP;

    RETURN jsonb_build_object('status', 'success');
END;
$$ LANGUAGE plpgsql;
