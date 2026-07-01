CREATE OR REPLACE FUNCTION public.rpc_recalculate_item_wac(
    p_company_id UUID,
    p_item_id UUID
)
RETURNS NUMERIC(15, 4)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_value NUMERIC(15, 4) := 0.0000;
    v_total_qty NUMERIC(15, 4) := 0.0000;
    v_new_wac NUMERIC(15, 4) := 0.0000;
    v_fallback_price NUMERIC(15, 4);
BEGIN
    -- 1. Resolve the provisional fallback price entered during initialization
    SELECT purchase_price INTO v_fallback_price 
    FROM public."Item" 
    WHERE id = p_item_id AND company_id = p_company_id;

    -- 2. Aggregate actual active, posted rows from the immutable Inventory History Ledger
    -- Note: quantity_change is already signed natively (+ for In, - for Out)
    SELECT 
        COALESCE(SUM(quantity_change * unit_cost), 0.0000),
        COALESCE(SUM(quantity_change), 0.0000)
    INTO v_total_value, v_total_qty
    FROM public."InventoryHistory"
    WHERE item_id = p_item_id 
      AND company_id = p_company_id;

    -- 3. Evaluate new WAC with absolute safety thresholds to avoid division by zero
    IF v_total_qty > 0 AND v_total_value > 0 THEN
        v_new_wac := ROUND((v_total_value / v_total_qty)::numeric, 4);
    ELSE
        -- If stock drops to zero or goes negative, gracefully snap back to the initial provisional purchase price
        v_new_wac := COALESCE(v_fallback_price, 0.0000);
    END IF;

    -- 4. Mutate the core Item row directly to update the active cost standard system-wide
    UPDATE public."Item"
    SET weighted_average_cost = v_new_wac
    WHERE id = p_item_id AND company_id = p_company_id;

    RETURN v_new_wac;
END;
$$;
