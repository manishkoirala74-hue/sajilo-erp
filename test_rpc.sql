CREATE OR REPLACE FUNCTION rpc_test_wac_math(p_invoice_id UUID)
RETURNS JSONB AS $$
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
    v_log JSONB := '[]'::JSONB;
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
                SELECT COALESCE(quantity_on_hand, 0), COALESCE(weighted_average_cost, 0)
                INTO v_old_qty, v_old_wac
                FROM "Item" 
                WHERE id = v_item_id FOR UPDATE;

                IF v_old_qty <= 0 THEN
                    v_new_wac := v_unit_price;
                ELSE
                    v_new_wac := ((v_old_qty * v_old_wac) + (v_quantity * v_unit_price)) / (v_old_qty + v_quantity);
                END IF;

                v_log := v_log || jsonb_build_object(
                    'item_id', v_item_id,
                    'quantity', v_quantity,
                    'unit_price', v_unit_price,
                    'old_qty', v_old_qty,
                    'old_wac', v_old_wac,
                    'new_wac', v_new_wac,
                    'raw_item', v_item
                );
            END IF;
        END IF;
    END LOOP;
    RETURN v_log;
END;
$$ LANGUAGE plpgsql;
