-- 106_stock_ledger_statement_rpc.sql

BEGIN;

CREATE OR REPLACE FUNCTION get_stock_ledger_statement_rpc(
    p_company_id UUID,
    p_item_id UUID,
    p_from_date DATE,
    p_to_date DATE
) RETURNS TABLE (
    id UUID,
    entry_date DATE,
    transaction_type TEXT,
    voucher_no TEXT,
    description TEXT,
    quantity_in NUMERIC,
    total_amount_in NUMERIC,
    quantity_out NUMERIC,
    total_amount_out NUMERIC,
    quantity_balance NUMERIC,
    value_balance NUMERIC,
    is_opening BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_ob_qty NUMERIC := 0;
    v_ob_wac NUMERIC := 0;
    v_ob_val NUMERIC := 0;
BEGIN
    -- 1. Calculate Opening Quantity
    SELECT 
        COALESCE(SUM(il.quantity_in - il.quantity_out), 0)
    INTO v_ob_qty
    FROM "InventoryLedger" il
    WHERE il.item_id = p_item_id
      AND il.company_id = p_company_id
      AND il.transaction_date::DATE < p_from_date;

    IF v_ob_qty != 0 THEN
        -- Get the WAC from the very last transaction prior to from_date
        SELECT COALESCE(il.wac_at_post, 0)
        INTO v_ob_wac
        FROM "InventoryLedger" il
        WHERE il.item_id = p_item_id
          AND il.company_id = p_company_id
          AND il.transaction_date::DATE < p_from_date
        ORDER BY il.transaction_date DESC, il.created_at DESC, il.id DESC
        LIMIT 1;
        
        v_ob_val := v_ob_qty * v_ob_wac;
    END IF;

    -- 2. Return Opening Balance Row
    IF v_ob_qty != 0 THEN
        RETURN QUERY SELECT 
            NULL::UUID,
            (p_from_date - INTERVAL '1 day')::DATE,
            'Opening Balance'::TEXT,
            'OB'::TEXT,
            'Opening Balance'::TEXT,
            0::NUMERIC,
            0::NUMERIC,
            0::NUMERIC,
            0::NUMERIC,
            v_ob_qty,
            v_ob_val,
            TRUE;
    END IF;

    -- 3. Return Transactions with Running Balances using Window Functions
    RETURN QUERY
    WITH txns AS (
        SELECT 
            il.id,
            il.transaction_date::DATE as entry_date,
            COALESCE(il.transaction_type, 'Unknown')::TEXT as transaction_type,
            COALESCE(il.voucher_no, '')::TEXT as voucher_no,
            COALESCE(il.description, '')::TEXT as description,
            COALESCE(il.quantity_in, 0::NUMERIC) as quantity_in,
            (CASE WHEN COALESCE(il.quantity_in, 0) > 0 THEN COALESCE(il.total_amount, 0::NUMERIC) ELSE 0::NUMERIC END)::NUMERIC as total_amount_in,
            COALESCE(il.quantity_out, 0::NUMERIC) as quantity_out,
            (CASE WHEN COALESCE(il.quantity_out, 0) > 0 THEN COALESCE(il.total_amount, 0::NUMERIC) ELSE 0::NUMERIC END)::NUMERIC as total_amount_out,
            COALESCE(il.wac_at_post, 0::NUMERIC) as current_wac,
            il.transaction_date,
            il.created_at,
            SUM(COALESCE(il.quantity_in, 0::NUMERIC) - COALESCE(il.quantity_out, 0::NUMERIC)) OVER (
                ORDER BY il.transaction_date ASC, il.created_at ASC, il.id ASC
            ) as rolling_qty_change
        FROM "InventoryLedger" il
        WHERE il.item_id = p_item_id
          AND il.company_id = p_company_id
          AND il.transaction_date::DATE >= p_from_date
          AND il.transaction_date::DATE <= p_to_date
    )
    SELECT 
        t.id::UUID,
        t.entry_date::DATE,
        t.transaction_type::TEXT,
        t.voucher_no::TEXT,
        t.description::TEXT,
        t.quantity_in::NUMERIC,
        t.total_amount_in::NUMERIC,
        t.quantity_out::NUMERIC,
        t.total_amount_out::NUMERIC,
        (v_ob_qty + t.rolling_qty_change)::NUMERIC as quantity_balance,
        ((v_ob_qty + t.rolling_qty_change) * t.current_wac)::NUMERIC as value_balance,
        FALSE::BOOLEAN
    FROM txns t
    ORDER BY t.transaction_date ASC, t.created_at ASC, t.id ASC;

END;
$$;

-- Grant EXECUTE to authenticated users since it's SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION get_stock_ledger_statement_rpc FROM public, anon;
GRANT EXECUTE ON FUNCTION get_stock_ledger_statement_rpc TO authenticated, service_role;

COMMIT;
