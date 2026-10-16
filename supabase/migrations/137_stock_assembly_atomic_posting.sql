-- ============================================================================
-- 137_stock_assembly_atomic_posting.sql
-- Module: Stock Assembly (/inventory/assembly)
-- Purpose:
--   1. Replaces broken ledger posting with atomic integration into rpc_commit_journal_entry_internal.
--   2. Enforces deterministic row locking (ORDER BY item_id ASC FOR UPDATE) to eliminate PostgreSQL deadlocks.
--   3. Implements Zero-Trust Live WAC Injection from Item records at time of completion.
--   4. Atomically updates CurrentStock, Item quantity_on_hand, and Item weighted_average_cost.
--   5. Hard-blocks consumption of zero or negative stock.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_assembly RECORD;
    v_line RECORD;
    v_cur_stock RECORD;
    v_godown_id UUID;
    v_total_consumed NUMERIC := 0;
    v_total_scrap_recovery NUMERIC := 0;
    v_total_abnormal_loss NUMERIC := 0;
    v_produced_qty NUMERIC := 0;
    v_produced_item_id UUID;
    v_produced_item_name TEXT;
    v_produced_unit_cost NUMERIC := 0;
    v_total_production_cost NUMERIC := 0;
    v_overhead NUMERIC := 0;
    v_live_wac NUMERIC := 0;
    v_gl_lines JSONB := '[]'::JSONB;
    v_journal_id UUID;
    v_fg_acc_id UUID;
    v_overhead_acc_id UUID;
    v_company_inventory_acc UUID;
BEGIN
    -- 1. Fetch & Lock Assembly Header
    SELECT * INTO v_assembly 
    FROM public."StockAssembly"
    WHERE id = p_assembly_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NOT_FOUND: Stock Assembly record does not exist';
    END IF;

    IF v_assembly.status != 'Draft' THEN
        RAISE EXCEPTION 'ERR_ALREADY_POSTED: Assembly is already % and locked.', v_assembly.status;
    END IF;

    v_godown_id := v_assembly.godown_id;
    v_overhead  := COALESCE(v_assembly.overhead_cost, 0);

    -- 2. Resolve default accounts from ChartOfAccount
    SELECT id INTO v_company_inventory_acc 
    FROM public."ChartOfAccount"
    WHERE company_id = p_company_id AND (account_code = '1140' OR (account_type = 'Asset' AND account_name ILIKE '%Inventory%'))
    ORDER BY account_code ASC LIMIT 1;

    SELECT id INTO v_overhead_acc_id 
    FROM public."ChartOfAccount"
    WHERE company_id = p_company_id AND (account_code = '5300' OR account_name ILIKE '%Manufacturing Overhead%')
    ORDER BY account_code ASC LIMIT 1;

    -- 3. CRITICAL: Deterministic Lock on Consumed & Wastage Items to prevent Deadlocks
    PERFORM 1
    FROM public."CurrentStock"
    WHERE company_id = p_company_id 
      AND godown_id = v_godown_id
      AND item_id IN (
          SELECT item_id FROM public."StockAssemblyItem" 
          WHERE assembly_id = p_assembly_id AND line_type IN ('Consumed', 'Wastage', 'Wastage (Recovery)')
      )
    ORDER BY item_id ASC
    FOR UPDATE;

    -- Also lock Item records deterministically for live WAC and on-hand updates
    PERFORM 1
    FROM public."Item"
    WHERE id IN (SELECT item_id FROM public."StockAssemblyItem" WHERE assembly_id = p_assembly_id)
    ORDER BY id ASC
    FOR UPDATE;

    -- 4. Process Raw Materials & Scrap
    FOR v_line IN (
        SELECT sai.*, i.item_name, i.inventory_account_id, i.weighted_average_cost, i.current_unit_cost
        FROM public."StockAssemblyItem" sai
        JOIN public."Item" i ON i.id = sai.item_id
        WHERE sai.assembly_id = p_assembly_id
        ORDER BY sai.id ASC
    ) LOOP
        IF v_line.line_type = 'Consumed' THEN
            -- Check real-time physical stock
            SELECT current_qty INTO v_cur_stock
            FROM public."CurrentStock"
            WHERE company_id = p_company_id AND godown_id = v_godown_id AND item_id = v_line.item_id;

            IF v_cur_stock IS NULL OR v_cur_stock.current_qty < v_line.quantity OR v_cur_stock.current_qty <= 0 THEN
                RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: Item "%" has % available in this Godown (required %)',
                    v_line.item_name, COALESCE(v_cur_stock.current_qty, 0), v_line.quantity;
            END IF;

            -- ZERO-TRUST LIVE WAC INJECTION:
            v_live_wac := COALESCE(NULLIF(v_line.weighted_average_cost, 0), v_line.current_unit_cost, 0);

            -- Update line item to reflect exact posted valuation
            UPDATE public."StockAssemblyItem"
            SET unit_cost = v_live_wac
            WHERE id = v_line.id;

            v_total_consumed := v_total_consumed + (v_line.quantity * v_live_wac);

            -- Deduct stock atomically
            UPDATE public."CurrentStock"
            SET current_qty = current_qty - v_line.quantity, updated_at = NOW()
            WHERE company_id = p_company_id AND godown_id = v_godown_id AND item_id = v_line.item_id;

            UPDATE public."Item"
            SET quantity_on_hand = quantity_on_hand - v_line.quantity, updated_at = NOW()
            WHERE id = v_line.item_id;

            -- InventoryLedger audit
            INSERT INTO public."InventoryLedger" (
                company_id, item_id, godown_id, transaction_type,
                quantity_in, quantity_out, transaction_date, reference_id, reference_type, ledger_status
            ) VALUES (
                p_company_id, v_line.item_id, v_godown_id, 'StockAssembly',
                0, v_line.quantity, v_assembly.assembly_date, p_assembly_id, 'StockAssembly', 'Active'
            );

            -- GL Credit for Consumed Raw Material
            v_gl_lines := v_gl_lines || jsonb_build_object(
                'account_id', COALESCE(v_line.inventory_account_id, v_company_inventory_acc),
                'description', 'Raw Material Consumed: ' || v_line.item_name,
                'debit_amount', 0,
                'credit_amount', (v_line.quantity * v_live_wac)
            );

        ELSIF v_line.line_type IN ('Wastage', 'Wastage (Recovery)') THEN
            -- User-entered Net Realizable Value for Scrap
            IF v_line.unit_cost > 0 THEN
                v_total_scrap_recovery := v_total_scrap_recovery + (v_line.quantity * v_line.unit_cost);

                -- Increment scrap item in CurrentStock
                INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
                VALUES (p_company_id, v_godown_id, v_line.item_id, v_line.quantity)
                ON CONFLICT (company_id, godown_id, item_id)
                DO UPDATE SET current_qty = public."CurrentStock".current_qty + EXCLUDED.current_qty;

                UPDATE public."Item"
                SET quantity_on_hand = quantity_on_hand + v_line.quantity, updated_at = NOW()
                WHERE id = v_line.item_id;

                -- GL Debit for Scrap Inventory Asset
                v_gl_lines := v_gl_lines || jsonb_build_object(
                    'account_id', COALESCE(v_line.inventory_account_id, v_company_inventory_acc),
                    'description', 'Scrap Recovery: ' || v_line.item_name,
                    'debit_amount', (v_line.quantity * v_line.unit_cost),
                    'credit_amount', 0
                );
            END IF;

        ELSIF v_line.line_type = 'Produced' THEN
            v_produced_qty := v_produced_qty + v_line.quantity;
            v_produced_item_id := v_line.item_id;
            v_produced_item_name := v_line.item_name;
            v_fg_acc_id := COALESCE(v_line.inventory_account_id, v_company_inventory_acc);
        END IF;
    END LOOP;

    IF v_produced_qty <= 0 THEN
        RAISE EXCEPTION 'ERR_INVALID_ASSEMBLY: An assembly must have at least one Produced item with quantity > 0';
    END IF;

    -- 5. Calculate Final Production Cost using Master Formula
    v_total_production_cost := v_total_consumed + v_overhead - v_total_scrap_recovery - v_total_abnormal_loss;
    IF v_total_production_cost < 0 THEN
        v_total_production_cost := 0;
    END IF;
    v_produced_unit_cost := v_total_production_cost / v_produced_qty;

    -- Update unit cost on produced line item
    UPDATE public."StockAssemblyItem" 
    SET unit_cost = v_produced_unit_cost 
    WHERE assembly_id = p_assembly_id AND line_type = 'Produced';

    -- 6. Increment Finished Good Stock & Recalculate WAC
    INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
    VALUES (p_company_id, v_godown_id, v_produced_item_id, v_produced_qty)
    ON CONFLICT (company_id, godown_id, item_id)
    DO UPDATE SET current_qty = public."CurrentStock".current_qty + EXCLUDED.current_qty;

    UPDATE public."Item"
    SET weighted_average_cost = CASE 
            WHEN (quantity_on_hand + v_produced_qty) > 0 
            THEN ((quantity_on_hand * COALESCE(weighted_average_cost, 0)) + (v_produced_qty * v_produced_unit_cost)) / (quantity_on_hand + v_produced_qty)
            ELSE v_produced_unit_cost 
        END,
        quantity_on_hand = quantity_on_hand + v_produced_qty,
        updated_at = NOW()
    WHERE id = v_produced_item_id;

    INSERT INTO public."InventoryLedger" (
        company_id, item_id, godown_id, transaction_type,
        quantity_in, quantity_out, transaction_date, reference_id, reference_type, ledger_status
    ) VALUES (
        p_company_id, v_produced_item_id, v_godown_id, 'StockAssembly',
        v_produced_qty, 0, v_assembly.assembly_date, p_assembly_id, 'StockAssembly', 'Active'
    );

    -- 7. Add GL Lines for Finished Goods Debit and Overhead Credit
    v_gl_lines := v_gl_lines || jsonb_build_object(
        'account_id', v_fg_acc_id,
        'description', 'Finished Goods Produced: ' || v_produced_item_name,
        'debit_amount', v_total_production_cost,
        'credit_amount', 0
    );

    IF v_overhead > 0 AND v_overhead_acc_id IS NOT NULL THEN
        v_gl_lines := v_gl_lines || jsonb_build_object(
            'account_id', v_overhead_acc_id,
            'description', 'Assembly Overhead Absorbed (' || v_assembly.assembly_no || ')',
            'debit_amount', 0,
            'credit_amount', v_overhead
        );
    END IF;

    -- 8. Commit to Centralized General Ledger
    v_journal_id := public.rpc_commit_journal_entry_internal(
        p_company_id  := p_company_id,
        p_date        := v_assembly.assembly_date,
        p_description := 'Stock Assembly Production: ' || v_produced_item_name || ' (' || v_assembly.assembly_no || ')',
        p_module      := 'Inventory',
        p_source_id   := p_assembly_id,
        p_source_type := 'StockAssembly',
        p_voucher_no  := v_assembly.assembly_no,
        p_lines       := v_gl_lines
    );

    -- 9. Complete Assembly
    UPDATE public."StockAssembly"
    SET status = 'Completed', 
        total_cost = v_total_production_cost, 
        updated_at = NOW()
    WHERE id = p_assembly_id;

    RETURN jsonb_build_object(
        'success', true,
        'assembly_id', p_assembly_id,
        'journal_id', v_journal_id,
        'produced_unit_cost', v_produced_unit_cost,
        'total_production_cost', v_total_production_cost
    );
END;
$$;

-- Also provide rpc_complete_stock_assembly as an alias
CREATE OR REPLACE FUNCTION public.rpc_complete_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.complete_stock_assembly(p_assembly_id, p_company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_stock_assembly(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_complete_stock_assembly(UUID, UUID) TO authenticated;

COMMIT;
