-- 104_restore_purchase_wac_logic.sql
-- Restores proper InventoryHistory insertion and WAC recalculation during Purchase Invoice checkouts.
-- Also syncs current_unit_cost with the calculated WAC to prevent 0-cost COGS failures.

BEGIN;

CREATE OR REPLACE FUNCTION rpc_internal_add_stock(p_company_id UUID, p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
    v_invoice RECORD;
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_unit_price NUMERIC;
    v_is_physical BOOLEAN;
    v_new_wac NUMERIC;
BEGIN
    SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE id = p_invoice_id;
    
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, COALESCE((v_item->>'rate')::NUMERIC, 0));
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id FOR UPDATE;
            
            IF v_is_physical THEN
                -- 1. Update stock quantity
                UPDATE "Item" 
                SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_quantity 
                WHERE id = v_item_id;

                -- 2. Insert into Legacy InventoryLedger
                INSERT INTO "InventoryLedger" (
                    company_id, item_id, transaction_type, godown_id, quantity_in, transaction_date, reference_id, reference_type
                ) VALUES (
                    p_company_id, v_item_id, 'PurchaseInvoice', v_invoice.godown_id, v_quantity, v_invoice.invoice_date, p_invoice_id, 'PurchaseInvoice'
                );

                -- 3. Insert into the modern InventoryHistory table for accurate costing
                INSERT INTO "InventoryHistory" (
                    item_id, company_id, transaction_date, reference_id, reference_type, reference_no,
                    quantity_change, unit_cost, notes
                ) VALUES (
                    v_item_id, p_company_id, v_invoice.invoice_date, p_invoice_id, 'PurchaseInvoice', v_invoice.invoice_number,
                    v_quantity, v_unit_price, 'Purchase Receipt via Checkout'
                );

                -- 4. Automatically recalculate and apply the new WAC for the item
                v_new_wac := public.rpc_recalculate_item_wac(p_company_id, v_item_id);

                -- 5. Sync current_unit_cost because COALESCE relies on it!
                UPDATE "Item"
                SET current_unit_cost = v_new_wac
                WHERE id = v_item_id;
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;
