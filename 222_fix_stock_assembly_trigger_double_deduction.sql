-- ============================================================================
-- 222_fix_stock_assembly_trigger_double_deduction.sql
-- Module: Stock Assembly & Inventory Control
-- Purpose:
--   1. Eliminates double stock deduction & double increment in complete_stock_assembly
--      and cancel_stock_assembly. InventoryLedger has an active AFTER trigger
--      (trg_update_current_stock) that automatically synchronizes CurrentStock.
--      The RPC must not execute manual UPDATE/INSERT on CurrentStock.
--   2. Purges orphaned test InventoryLedger (30 rows) and GeneralLedgerJournal (13 rows)
--      entries where reference StockAssembly records no longer exist.
--   3. Reconciles CurrentStock and Item quantity_on_hand to match active ledger totals.
-- ============================================================================

BEGIN;

-- ── 1. DROP OBSOLETE SIGNATURES ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.complete_stock_assembly(UUID, UUID);
DROP FUNCTION IF EXISTS public.cancel_stock_assembly(UUID, UUID, TEXT, UUID);

-- ── 2. PATCHED COMPLETE STOCK ASSEMBLY (SINGLE LEDGER MUTATION) ─────────────
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
    v_cur_qty NUMERIC := 0;
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

    IF v_company_inventory_acc IS NULL THEN
        SELECT id INTO v_company_inventory_acc 
        FROM public."ChartOfAccount"
        WHERE company_id = p_company_id AND account_type = 'Asset'
        ORDER BY account_code ASC LIMIT 1;
    END IF;

    SELECT id INTO v_overhead_acc_id 
    FROM public."ChartOfAccount"
    WHERE company_id = p_company_id AND (account_code = '5300' OR account_name ILIKE '%Manufacturing Overhead%' OR account_name ILIKE '%Overhead%')
    ORDER BY account_code ASC LIMIT 1;

    -- 3. Deterministic Pessimistic Row Lock to prevent Deadlocks
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
            -- Check stock sufficiency in specified Godown
            SELECT current_qty INTO v_cur_qty
            FROM public."CurrentStock"
            WHERE company_id = p_company_id AND godown_id = v_godown_id AND item_id = v_line.item_id;

            IF NOT FOUND OR v_cur_qty < v_line.quantity OR v_cur_qty <= 0 THEN
                RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: Item "%" only has % available in this Godown (required %)',
                    v_line.item_name, COALESCE(v_cur_qty, 0), v_line.quantity;
            END IF;

            -- Zero-Trust Backend WAC Injection
            v_live_wac := COALESCE(NULLIF(v_line.weighted_average_cost, 0), v_line.current_unit_cost, 0);

            UPDATE public."StockAssemblyItem"
            SET unit_cost = v_live_wac
            WHERE id = v_line.id;

            v_total_consumed := v_total_consumed + (v_line.quantity * v_live_wac);

            -- Deduct quantity on hand on master Item
            UPDATE public."Item"
            SET quantity_on_hand = GREATEST(0, COALESCE(quantity_on_hand, 0) - v_line.quantity), updated_at = NOW()
            WHERE id = v_line.item_id;

            -- InventoryLedger insert: trg_update_current_stock automatically deducts from CurrentStock exactly once
            INSERT INTO public."InventoryLedger" (
                company_id, item_id, godown_id, transaction_type,
                quantity_in, quantity_out, transaction_date, reference_id, reference_type,
                total_amount, description, voucher_no, ledger_status, wac_at_post
            ) VALUES (
                p_company_id, v_line.item_id, v_godown_id, 'StockAssembly',
                0, v_line.quantity, v_assembly.assembly_date, p_assembly_id, 'StockAssembly',
                (v_line.quantity * v_live_wac), 'Raw Material Consumed: ' || v_line.item_name || ' (' || v_assembly.assembly_no || ')',
                v_assembly.assembly_no, 'Active', v_live_wac
            );

            -- GL Credit for Consumed Raw Material
            v_gl_lines := v_gl_lines || jsonb_build_object(
                'account_id', COALESCE(v_line.inventory_account_id, v_company_inventory_acc),
                'description', 'Raw Material Consumed: ' || v_line.item_name,
                'debit_amount', 0,
                'credit_amount', (v_line.quantity * v_live_wac)
            );

        ELSIF v_line.line_type IN ('Wastage', 'Wastage (Recovery)') THEN
            -- Net Realizable Value for Scrap
            IF v_line.unit_cost > 0 THEN
                v_total_scrap_recovery := v_total_scrap_recovery + (v_line.quantity * v_line.unit_cost);

                UPDATE public."Item"
                SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_line.quantity, updated_at = NOW()
                WHERE id = v_line.item_id;

                -- InventoryLedger insert: trg_update_current_stock automatically increments CurrentStock exactly once
                INSERT INTO public."InventoryLedger" (
                    company_id, item_id, godown_id, transaction_type,
                    quantity_in, quantity_out, transaction_date, reference_id, reference_type,
                    total_amount, description, voucher_no, ledger_status, wac_at_post
                ) VALUES (
                    p_company_id, v_line.item_id, v_godown_id, 'StockAssembly',
                    v_line.quantity, 0, v_assembly.assembly_date, p_assembly_id, 'StockAssembly',
                    (v_line.quantity * v_line.unit_cost), 'Scrap Recovery: ' || v_line.item_name || ' (' || v_assembly.assembly_no || ')',
                    v_assembly.assembly_no, 'Active', v_line.unit_cost
                );

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
    v_produced_unit_cost := ROUND(v_total_production_cost / v_produced_qty, 4);

    -- Update unit cost on produced line item
    UPDATE public."StockAssemblyItem" 
    SET unit_cost = v_produced_unit_cost 
    WHERE assembly_id = p_assembly_id AND line_type = 'Produced';

    -- 6. Increment Finished Good Stock & Recalculate WAC
    UPDATE public."Item"
    SET weighted_average_cost = CASE 
            WHEN (COALESCE(quantity_on_hand, 0) + v_produced_qty) > 0 
            THEN ROUND(((COALESCE(quantity_on_hand, 0) * COALESCE(weighted_average_cost, 0)) + v_total_production_cost) / (COALESCE(quantity_on_hand, 0) + v_produced_qty), 4)
            ELSE v_produced_unit_cost 
        END,
        quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_produced_qty,
        current_unit_cost = v_produced_unit_cost,
        updated_at = NOW()
    WHERE id = v_produced_item_id;

    -- InventoryLedger insert: trg_update_current_stock automatically increments CurrentStock exactly once
    INSERT INTO public."InventoryLedger" (
        company_id, item_id, godown_id, transaction_type,
        quantity_in, quantity_out, transaction_date, reference_id, reference_type,
        total_amount, description, voucher_no, ledger_status, wac_at_post
    ) VALUES (
        p_company_id, v_produced_item_id, v_godown_id, 'StockAssembly',
        v_produced_qty, 0, v_assembly.assembly_date, p_assembly_id, 'StockAssembly',
        v_total_production_cost, 'Finished Goods Produced: ' || v_produced_item_name || ' (' || v_assembly.assembly_no || ')',
        v_assembly.assembly_no, 'Active', v_produced_unit_cost
    );

    -- 7. Add GL Lines for Finished Goods Debit and Overhead Credit
    v_gl_lines := v_gl_lines || jsonb_build_object(
        'account_id', v_fg_acc_id,
        'description', 'Finished Goods Produced: ' || v_produced_item_name,
        'debit_amount', v_total_production_cost,
        'credit_amount', 0
    );

    IF v_overhead > 0 THEN
        v_gl_lines := v_gl_lines || jsonb_build_object(
            'account_id', v_overhead_acc_id,
            'description', 'Overhead Absorbed: ' || v_assembly.assembly_no,
            'debit_amount', 0,
            'credit_amount', v_overhead
        );
    END IF;

    -- 8. Commit Single Balanced Journal Entry
    v_journal_id := public.rpc_commit_journal_entry_internal(
        p_company_id,
        v_assembly.assembly_date,
        'Stock Assembly: ' || v_assembly.assembly_no || ' (' || v_produced_item_name || ' x ' || v_produced_qty || ')',
        'StockAssembly',
        p_assembly_id,
        'StockAssembly',
        v_assembly.assembly_no,
        v_gl_lines
    );

    -- 9. Mark Assembly Completed & Lock
    UPDATE public."StockAssembly"
    SET 
        status = 'Completed',
        total_cost = v_total_production_cost,
        overhead_cost = v_overhead,
        updated_at = NOW()
    WHERE id = p_assembly_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'Completed',
        'assembly_id', p_assembly_id,
        'assembly_no', v_assembly.assembly_no,
        'journal_id', v_journal_id,
        'production_cost', v_total_production_cost,
        'produced_qty', v_produced_qty,
        'unit_cost', v_produced_unit_cost
    );
END;
$$;

-- ── 3. PATCHED CANCEL STOCK ASSEMBLY (SINGLE LEDGER MUTATION) ───────────────
CREATE OR REPLACE FUNCTION public.cancel_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID,
    p_reason TEXT DEFAULT 'Cancelled by user',
    p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_assembly RECORD;
    v_produced_line RECORD;
    v_line RECORD;
    v_cur_stock RECORD;
    v_user_id UUID := COALESCE(p_user_id, auth.uid());
    v_journal_rec RECORD;
    v_reversal_count INT := 0;
BEGIN
    -- 1. Fetch & Lock Assembly Header
    SELECT * INTO v_assembly
    FROM public."StockAssembly"
    WHERE id = p_assembly_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NOT_FOUND: Stock Assembly record not found.';
    END IF;

    IF v_assembly.status = 'Cancelled' THEN
        RAISE EXCEPTION 'ERR_ALREADY_CANCELLED: Stock Assembly is already cancelled.';
    END IF;

    IF v_assembly.status != 'Completed' THEN
        RAISE EXCEPTION 'ERR_NOT_COMPLETED: Only Completed stock assemblies can be reversed. Current status: %', v_assembly.status;
    END IF;

    -- Guard against Closed/Locked Fiscal Year
    IF EXISTS (
        SELECT 1 FROM public."FiscalYear"
        WHERE company_id = p_company_id 
          AND (is_locked = TRUE OR status = 'Closed')
          AND v_assembly.assembly_date::DATE BETWEEN start_date AND end_date
    ) THEN
        RAISE EXCEPTION 'ERR_PERIOD_LOCKED: Cannot cancel stock assembly belonging to a locked or closed fiscal year.';
    END IF;

    -- Lock involved rows deterministically
    PERFORM 1
    FROM public."CurrentStock"
    WHERE company_id = p_company_id 
      AND godown_id = v_assembly.godown_id
      AND item_id IN (
          SELECT item_id FROM public."StockAssemblyItem" WHERE assembly_id = p_assembly_id
      )
    ORDER BY item_id ASC
    FOR UPDATE;

    PERFORM 1
    FROM public."Item"
    WHERE id IN (SELECT item_id FROM public."StockAssemblyItem" WHERE assembly_id = p_assembly_id)
    ORDER BY id ASC
    FOR UPDATE;

    -- Find the Produced item
    SELECT sai.*, i.item_name
    INTO v_produced_line
    FROM public."StockAssemblyItem" sai
    JOIN public."Item" i ON i.id = sai.item_id
    WHERE sai.assembly_id = p_assembly_id AND sai.line_type = 'Produced'
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_INVALID_ASSEMBLY: Produced item not found for this assembly.';
    END IF;

    -- Stock Guard: Does the Godown still have enough finished goods to deduct?
    SELECT current_qty INTO v_cur_stock
    FROM public."CurrentStock"
    WHERE company_id = p_company_id AND godown_id = v_assembly.godown_id AND item_id = v_produced_line.item_id;

    IF v_cur_stock IS NULL OR v_cur_stock.current_qty < v_produced_line.quantity THEN
        RAISE EXCEPTION 'ERR_STOCK_DEPLETED: Cannot cancel assembly. Only % units of produced item "%" remain in this Godown (need % units to reverse). The finished goods may have already been sold or moved.',
            COALESCE(v_cur_stock.current_qty, 0), v_produced_line.item_name, v_produced_line.quantity;
    END IF;

    -- 4. Deduct Finished Good Stock from Item table
    UPDATE public."Item"
    SET quantity_on_hand = GREATEST(0, COALESCE(quantity_on_hand, 0) - v_produced_line.quantity),
        updated_at = NOW()
    WHERE id = v_produced_line.item_id;

    -- InventoryLedger insert: trg_update_current_stock automatically deducts from CurrentStock exactly once
    INSERT INTO public."InventoryLedger" (
        company_id, item_id, godown_id, transaction_type,
        quantity_in, quantity_out, transaction_date, reference_id, reference_type,
        total_amount, description, voucher_no, ledger_status, wac_at_post
    ) VALUES (
        p_company_id, v_produced_line.item_id, v_assembly.godown_id, 'StockAssembly',
        0, v_produced_line.quantity, CURRENT_TIMESTAMP, p_assembly_id, 'StockAssembly',
        (v_produced_line.quantity * COALESCE(v_produced_line.unit_cost, 0)),
        'Reversal of Produced Item: ' || v_produced_line.item_name || ' (' || v_assembly.assembly_no || '): ' || p_reason,
        v_assembly.assembly_no || '-REV', 'Active', COALESCE(v_produced_line.unit_cost, 0)
    );

    -- 5. Restock Consumed Raw Materials
    FOR v_line IN (
        SELECT sai.*, i.item_name
        FROM public."StockAssemblyItem" sai
        JOIN public."Item" i ON i.id = sai.item_id
        WHERE sai.assembly_id = p_assembly_id AND sai.line_type = 'Consumed'
    ) LOOP
        UPDATE public."Item"
        SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_line.quantity,
            updated_at = NOW()
        WHERE id = v_line.item_id;

        -- InventoryLedger insert: trg_update_current_stock automatically restocks CurrentStock exactly once
        INSERT INTO public."InventoryLedger" (
            company_id, item_id, godown_id, transaction_type,
            quantity_in, quantity_out, transaction_date, reference_id, reference_type,
            total_amount, description, voucher_no, ledger_status, wac_at_post
        ) VALUES (
            p_company_id, v_line.item_id, v_assembly.godown_id, 'StockAssembly',
            v_line.quantity, 0, CURRENT_TIMESTAMP, p_assembly_id, 'StockAssembly',
            (v_line.quantity * COALESCE(v_line.unit_cost, 0)),
            'Restocked Consumed Material: ' || v_line.item_name || ' (' || v_assembly.assembly_no || '): ' || p_reason,
            v_assembly.assembly_no || '-REV', 'Active', COALESCE(v_line.unit_cost, 0)
        );
    END LOOP;

    -- 6. Deduct Scrap Recovery items if any were added
    FOR v_line IN (
        SELECT sai.*, i.item_name
        FROM public."StockAssemblyItem" sai
        JOIN public."Item" i ON i.id = sai.item_id
        WHERE sai.assembly_id = p_assembly_id 
          AND sai.line_type IN ('Wastage', 'Wastage (Recovery)')
          AND sai.unit_cost > 0
    ) LOOP
        SELECT current_qty INTO v_cur_stock
        FROM public."CurrentStock"
        WHERE company_id = p_company_id AND godown_id = v_assembly.godown_id AND item_id = v_line.item_id;

        IF v_cur_stock IS NOT NULL AND v_cur_stock.current_qty >= v_line.quantity THEN
            UPDATE public."Item"
            SET quantity_on_hand = GREATEST(0, COALESCE(quantity_on_hand, 0) - v_line.quantity),
                updated_at = NOW()
            WHERE id = v_line.item_id;

            INSERT INTO public."InventoryLedger" (
                company_id, item_id, godown_id, transaction_type,
                quantity_in, quantity_out, transaction_date, reference_id, reference_type,
                total_amount, description, voucher_no, ledger_status, wac_at_post
            ) VALUES (
                p_company_id, v_line.item_id, v_assembly.godown_id, 'StockAssembly',
                0, v_line.quantity, CURRENT_TIMESTAMP, p_assembly_id, 'StockAssembly',
                (v_line.quantity * v_line.unit_cost),
                'Deducted Scrap on Reversal: ' || v_line.item_name || ' (' || v_assembly.assembly_no || '): ' || p_reason,
                v_assembly.assembly_no || '-REV', 'Active', v_line.unit_cost
            );
        END IF;
    END LOOP;

    -- 7. Reverse Associated General Ledger Journals
    FOR v_journal_rec IN (
        SELECT id, voucher_no 
        FROM public."GeneralLedgerJournal"
        WHERE company_id = p_company_id 
          AND source_document_id = p_assembly_id 
          AND source_document_type = 'StockAssembly'
          AND is_reversed = FALSE
          AND status = 'Posted'
    ) LOOP
        PERFORM public.rpc_reverse_gl_journal(
            v_journal_rec.id,
            'Cancelled Stock Assembly: ' || v_assembly.assembly_no || ' - ' || p_reason,
            v_user_id
        );
        v_reversal_count := v_reversal_count + 1;
    END LOOP;

    -- 8. Mark StockAssembly as Cancelled
    UPDATE public."StockAssembly"
    SET status = 'Cancelled',
        cancellation_reason = p_reason,
        cancelled_at = NOW(),
        cancelled_by = v_user_id,
        updated_at = NOW()
    WHERE id = p_assembly_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'Cancelled',
        'assembly_id', p_assembly_id,
        'reversal_journals_count', v_reversal_count,
        'message', 'Stock Assembly reversed and physical inventory restored successfully.'
    );
END;
$$;

-- ── 4. RE-ESTABLISH ALIAS RPCS ──────────────────────────────────────────────
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

CREATE OR REPLACE FUNCTION public.rpc_cancel_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID,
    p_reason TEXT DEFAULT 'Cancelled by user',
    p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.cancel_stock_assembly(p_assembly_id, p_company_id, p_reason, p_user_id);
END;
$$;

-- ── 5. DATA CLEANUP: PURGE ORPHANED TEST DATA & RECONCILE STOCK ─────────────
-- Temporarily lift triggers and enable maintenance mode for administrative cleanup
SET LOCAL sajilo.maintenance_mode = 'true';
ALTER TABLE public."GeneralLedgerJournal" DISABLE TRIGGER trg_gl_journal_anti_tamper_del;
ALTER TABLE public."InventoryLedger" DISABLE TRIGGER trg_update_current_stock;

-- Delete orphaned GL lines for non-existent stock assemblies
DELETE FROM public."GeneralLedgerLine"
WHERE journal_id IN (
    SELECT id FROM public."GeneralLedgerJournal"
    WHERE source_document_type = 'StockAssembly'
      AND source_document_id NOT IN (SELECT id FROM public."StockAssembly")
);

-- Delete orphaned GL journals for non-existent stock assemblies
DELETE FROM public."GeneralLedgerJournal"
WHERE source_document_type = 'StockAssembly'
  AND source_document_id NOT IN (SELECT id FROM public."StockAssembly");

-- Delete orphaned InventoryLedger entries for non-existent stock assemblies
DELETE FROM public."InventoryLedger"
WHERE transaction_type = 'StockAssembly'
  AND reference_id NOT IN (SELECT id FROM public."StockAssembly");

-- Synchronize CurrentStock across all godowns from active InventoryLedger records
UPDATE public."CurrentStock" cs
SET current_qty = GREATEST(0, COALESCE((
    SELECT SUM(COALESCE(il.quantity_in, 0) - COALESCE(il.quantity_out, 0))
    FROM public."InventoryLedger" il
    WHERE il.company_id = cs.company_id
      AND il.godown_id = cs.godown_id
      AND il.item_id = cs.item_id
      AND il.ledger_status = 'Active'
), 0)),
updated_at = NOW();

-- Synchronize Item quantity_on_hand across all physical items from CurrentStock
UPDATE public."Item" i
SET quantity_on_hand = COALESCE((
    SELECT SUM(current_qty)
    FROM public."CurrentStock" cs
    WHERE cs.company_id = i.company_id AND cs.item_id = i.id
), 0),
updated_at = NOW()
WHERE is_physical = true;

-- Re-enable anti-tamper and stock triggers
ALTER TABLE public."InventoryLedger" ENABLE TRIGGER trg_update_current_stock;
ALTER TABLE public."GeneralLedgerJournal" ENABLE TRIGGER trg_gl_journal_anti_tamper_del;
SET LOCAL sajilo.maintenance_mode = 'false';

-- ── 6. GRANTS ───────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.complete_stock_assembly(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_complete_stock_assembly(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_stock_assembly(UUID, UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_stock_assembly(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

COMMIT;
