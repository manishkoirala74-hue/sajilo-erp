-- 088_fix_wac_calculation_rpc.sql
-- Fix WAC (Weighted Average Cost) calculation during Purchase Invoice posting

CREATE OR REPLACE FUNCTION rpc_internal_add_stock(p_company_id UUID, p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
    v_invoice RECORD;
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_unit_price NUMERIC;
    v_is_physical BOOLEAN;
    v_old_qty NUMERIC;
    v_old_wac NUMERIC;
    v_new_wac NUMERIC;
BEGIN
    SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE id = p_invoice_id;
    
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id;
            
            IF v_is_physical THEN
                -- CONCURRENCY ROW LOCK
                SELECT COALESCE(quantity_on_hand, 0), COALESCE(weighted_average_cost, 0)
                INTO v_old_qty, v_old_wac
                FROM "Item" 
                WHERE id = v_item_id FOR UPDATE;

                IF v_old_qty <= 0 THEN
                    v_new_wac := v_unit_price;
                ELSE
                    v_new_wac := ((v_old_qty * v_old_wac) + (v_quantity * v_unit_price)) / (v_old_qty + v_quantity);
                END IF;

                UPDATE "Item" SET 
                    quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_quantity,
                    weighted_average_cost = v_new_wac,
                    current_unit_cost = v_new_wac
                WHERE id = v_item_id;

                INSERT INTO "InventoryLedger" (
                    company_id, item_id, transaction_type, godown_id, quantity_in, transaction_date, reference_id, reference_type
                ) VALUES (
                    p_company_id, v_item_id, 'PurchaseInvoice', v_invoice.godown_id, v_quantity, v_invoice.invoice_date, p_invoice_id, 'PurchaseInvoice'
                );
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
