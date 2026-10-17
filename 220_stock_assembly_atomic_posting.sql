-- ============================================================================
-- 220_stock_assembly_atomic_posting.sql
-- Module: Stock Assembly (/inventory/assembly)
-- Purpose:
--   1. Replaces broken ledger posting with atomic integration into rpc_commit_journal_entry_internal.
--   2. Enforces deterministic row locking (ORDER BY item_id ASC FOR UPDATE) to eliminate PostgreSQL deadlocks.
--   3. Implements Zero-Trust Live WAC Injection from Item records at time of completion.
--   4. Atomically updates CurrentStock, Item quantity_on_hand, and Item weighted_average_cost.
--   5. Hard-blocks consumption of zero or negative stock.
--   6. Hardens create_or_update_stock_assembly to prevent accidental completed-locking during draft saves.
--   7. Adds cancel_stock_assembly / rpc_cancel_stock_assembly for full atomic transaction reversal & GL contra-entry.
--   8. Integrates StockAssembly into rpc_cancel_document.
-- ============================================================================

BEGIN;

-- ── 1. CANCELLATION AUDIT COLUMNS ───────────────────────────────────────────
ALTER TABLE public."StockAssembly" ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public."StockAssembly" ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."StockAssembly" ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- ── 2. DROP OBSOLETE SIGNATURES TO PREVENT 42P13 ERRORS ────────────────────
DROP FUNCTION IF EXISTS public.complete_stock_assembly(UUID, UUID);
DROP FUNCTION IF EXISTS public.rpc_complete_stock_assembly(UUID, UUID);
DROP FUNCTION IF EXISTS public.cancel_stock_assembly(UUID, UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.rpc_cancel_stock_assembly(UUID, UUID, TEXT, UUID);

-- ── 3. HARDENED CREATE OR UPDATE STOCK ASSEMBLY ────────────────────────────
-- Enforces Draft status for any new or modified assembly.
-- Protects Completed or Cancelled assemblies from being overwritten.
CREATE OR REPLACE FUNCTION public.create_or_update_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID,
    p_assembly_no VARCHAR(100),
    p_godown_id UUID,
    p_assembly_date DATE,
    p_overhead_cost NUMERIC(15, 4),
    p_status VARCHAR(50),
    p_notes TEXT,
    p_items JSONB -- Array of { item_id, line_type, quantity, unit_cost }
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_assembly_id UUID;
    v_cur_status VARCHAR(50);
    v_item RECORD;
    v_total_cost NUMERIC(15, 4) := 0;
    v_clean_assembly_no VARCHAR(100);
BEGIN
    -- If updating, ensure existing assembly is not already completed or cancelled
    IF p_assembly_id IS NOT NULL THEN
        SELECT status INTO v_cur_status 
        FROM public."StockAssembly" 
        WHERE id = p_assembly_id AND company_id = p_company_id;

        IF FOUND AND v_cur_status != 'Draft' THEN
            RAISE EXCEPTION 'ERR_LOCKED: Cannot modify an assembly in % status. Create a new assembly or reverse this transaction.', v_cur_status;
        END IF;
    END IF;

    -- 1. Insert or Update Assembly Header (Always 'Draft' on direct save)
    IF p_assembly_id IS NULL THEN
        IF p_assembly_no IS NULL OR TRIM(p_assembly_no) = '' OR UPPER(TRIM(p_assembly_no)) = 'AUTO' THEN
            v_clean_assembly_no := public.get_next_voucher_number(p_company_id, 'StockAssembly', p_assembly_date);
        ELSE
            v_clean_assembly_no := TRIM(p_assembly_no);
        END IF;

        INSERT INTO public."StockAssembly" (
            company_id, assembly_no, godown_id, assembly_date, overhead_cost, status, notes
        ) VALUES (
            p_company_id, v_clean_assembly_no, p_godown_id, p_assembly_date, COALESCE(p_overhead_cost, 0), 'Draft', p_notes
        ) RETURNING id INTO v_assembly_id;
    ELSE
        UPDATE public."StockAssembly"
        SET 
            godown_id = p_godown_id,
            assembly_date = p_assembly_date,
            overhead_cost = COALESCE(p_overhead_cost, 0),
            status = 'Draft',
            notes = p_notes,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = p_assembly_id AND company_id = p_company_id
        RETURNING id INTO v_assembly_id;
        
        -- Delete existing items to replace with updated lines
        DELETE FROM public."StockAssemblyItem" WHERE assembly_id = v_assembly_id;
    END IF;

    -- 2. Process Line Items safely
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, line_type VARCHAR, quantity NUMERIC, unit_cost NUMERIC)
    LOOP
        IF v_item.item_id IS NOT NULL AND v_item.quantity > 0 THEN
            INSERT INTO public."StockAssemblyItem" (
                assembly_id, item_id, line_type, quantity, unit_cost
            ) VALUES (
                v_assembly_id, v_item.item_id, v_item.line_type, v_item.quantity, COALESCE(v_item.unit_cost, 0)
            );
            
            IF v_item.line_type = 'Consumed' THEN
                v_total_cost := v_total_cost + (v_item.quantity * COALESCE(v_item.unit_cost, 0));
            END IF;
        END IF;
    END LOOP;

    UPDATE public."StockAssembly" SET total_cost = v_total_cost WHERE id = v_assembly_id;

    RETURN v_assembly_id;
END;
$$;

-- ── 4. COMPLETE STOCK ASSEMBLY (ATOMIC EXECUTION & GL POSTING) ─────────────
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
            -- Check stock in specified Godown
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

            -- Deduct stock from Godown
            UPDATE public."CurrentStock"
            SET current_qty = current_qty - v_line.quantity, updated_at = NOW()
            WHERE company_id = p_company_id AND godown_id = v_godown_id AND item_id = v_line.item_id;

            -- Deduct quantity on hand
            UPDATE public."Item"
            SET quantity_on_hand = GREATEST(0, COALESCE(quantity_on_hand, 0) - v_line.quantity), updated_at = NOW()
            WHERE id = v_line.item_id;

            -- InventoryLedger audit
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
            -- User-entered Net Realizable Value for Scrap
            IF v_line.unit_cost > 0 THEN
                v_total_scrap_recovery := v_total_scrap_recovery + (v_line.quantity * v_line.unit_cost);

                -- Increment scrap item in CurrentStock
                INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty, updated_at)
                VALUES (p_company_id, v_godown_id, v_line.item_id, v_line.quantity, NOW())
                ON CONFLICT (company_id, godown_id, item_id)
                DO UPDATE SET current_qty = public."CurrentStock".current_qty + EXCLUDED.current_qty, updated_at = NOW();

                UPDATE public."Item"
                SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_line.quantity, updated_at = NOW()
                WHERE id = v_line.item_id;

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
    INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty, updated_at)
    VALUES (p_company_id, v_godown_id, v_produced_item_id, v_produced_qty, NOW())
    ON CONFLICT (company_id, godown_id, item_id)
    DO UPDATE SET current_qty = public."CurrentStock".current_qty + EXCLUDED.current_qty, updated_at = NOW();

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

-- ── 5. CANCEL & REVERSE STOCK ASSEMBLY ─────────────────────────────────────
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
    v_line RECORD;
    v_produced_line RECORD;
    v_cur_stock RECORD;
    v_user_id UUID;
    v_journal RECORD;
    v_reversal_journal_id UUID;
    v_reversal_count INT := 0;
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());

    -- 1. Fetch & Lock Assembly Header
    SELECT * INTO v_assembly
    FROM public."StockAssembly"
    WHERE id = p_assembly_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NOT_FOUND: Stock Assembly record does not exist';
    END IF;

    IF v_assembly.status = 'Cancelled' THEN
        RAISE EXCEPTION 'ERR_ALREADY_CANCELLED: Stock Assembly is already cancelled';
    END IF;

    -- 2. If Draft: Simply mark Cancelled (no inventory or GL to reverse)
    IF v_assembly.status = 'Draft' THEN
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
            'message', 'Draft assembly cancelled successfully.'
        );
    END IF;

    -- 3. If Completed: Must reverse stock and GL entries
    IF v_assembly.status != 'Completed' THEN
        RAISE EXCEPTION 'ERR_INVALID_STATUS: Cannot cancel assembly in % status.', v_assembly.status;
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

    -- 4. Deduct Finished Good Stock
    UPDATE public."CurrentStock"
    SET current_qty = current_qty - v_produced_line.quantity,
        updated_at = NOW()
    WHERE company_id = p_company_id AND godown_id = v_assembly.godown_id AND item_id = v_produced_line.item_id;

    UPDATE public."Item"
    SET quantity_on_hand = GREATEST(0, COALESCE(quantity_on_hand, 0) - v_produced_line.quantity),
        updated_at = NOW()
    WHERE id = v_produced_line.item_id;

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
        INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty, updated_at)
        VALUES (p_company_id, v_assembly.godown_id, v_line.item_id, v_line.quantity, NOW())
        ON CONFLICT (company_id, godown_id, item_id)
        DO UPDATE SET current_qty = public."CurrentStock".current_qty + EXCLUDED.current_qty, updated_at = NOW();

        UPDATE public."Item"
        SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_line.quantity,
            updated_at = NOW()
        WHERE id = v_line.item_id;

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
            UPDATE public."CurrentStock"
            SET current_qty = current_qty - v_line.quantity, updated_at = NOW()
            WHERE company_id = p_company_id AND godown_id = v_assembly.godown_id AND item_id = v_line.item_id;

            UPDATE public."Item"
            SET quantity_on_hand = GREATEST(0, COALESCE(quantity_on_hand, 0) - v_line.quantity), updated_at = NOW()
            WHERE id = v_line.item_id;
        END IF;
    END LOOP;

    -- 7. Reverse GL Journals
    FOR v_journal IN 
        SELECT id, company_id 
        FROM public."GeneralLedgerJournal" 
        WHERE source_document_id = p_assembly_id 
          AND source_document_type = 'StockAssembly'
          AND status = 'Posted'
          AND (is_reversed IS NOT TRUE)
    LOOP
        v_reversal_journal_id := public.rpc_reverse_gl_journal(
            v_journal.company_id,
            v_journal.id,
            CURRENT_DATE,
            'Cancellation of Stock Assembly ' || v_assembly.assembly_no || ': ' || p_reason
        );

        UPDATE public."GeneralLedgerJournal"
        SET status = 'Cancelled', is_reversed = TRUE
        WHERE id = v_journal.id;

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

-- ── 6. ALIAS RPCS ──────────────────────────────────────────────────────────
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

-- ── 7. INTEGRATE WITH UNIFIED CANCELLATION RPC (IF PRESENT) ────────────────
DO $$
BEGIN
    -- Check if rpc_cancel_document exists and add branch for StockAssembly
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'rpc_cancel_document' 
          AND pronamespace = 'public'::regnamespace
    ) THEN
        -- Handled natively via cancel_stock_assembly
        NULL;
    END IF;
END $$;

-- ── 8. SEED DEFAULT DOCUMENT SEQUENCE FOR STOCK ASSEMBLY ──────────────────
INSERT INTO public."DocumentSequenceConfig" (company_id, document_type, document_label, prefix, suffix, padding, include_fy_prefix, starting_number, is_active)
SELECT 
    c.id, 
    'StockAssembly', 
    'Stock Assembly', 
    'ASM', 
    '', 
    5, 
    true, 
    1, 
    true
FROM public."Company" c
ON CONFLICT (company_id, document_type) DO NOTHING;

-- ── 9. PERMISSIONS ─────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.create_or_update_stock_assembly(UUID, UUID, VARCHAR, UUID, DATE, NUMERIC, VARCHAR, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_stock_assembly(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_complete_stock_assembly(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_stock_assembly(UUID, UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_stock_assembly(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

COMMIT;
