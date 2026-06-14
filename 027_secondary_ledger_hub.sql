-- ============================================================================
-- MIGRATION: 027_secondary_ledger_hub.sql
-- PURPOSE: Atomic RPC Posting for Secondary Modules (POS, Returns, Adjustments, Payroll)
-- ============================================================================

BEGIN;

-- 1. Add idempotency keys to secondary transaction tables
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='POSSale' AND column_name='idempotency_key') THEN
        ALTER TABLE "POSSale" ADD COLUMN idempotency_key UUID UNIQUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='SalesReturn' AND column_name='idempotency_key') THEN
        ALTER TABLE "SalesReturn" ADD COLUMN idempotency_key UUID UNIQUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PurchaseReturn' AND column_name='idempotency_key') THEN
        ALTER TABLE "PurchaseReturn" ADD COLUMN idempotency_key UUID UNIQUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StockAdjustment' AND column_name='idempotency_key') THEN
        ALTER TABLE "StockAdjustment" ADD COLUMN idempotency_key UUID UNIQUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PayrollRun' AND column_name='idempotency_key') THEN
        ALTER TABLE "PayrollRun" ADD COLUMN idempotency_key UUID UNIQUE;
    END IF;
END $$;

-- 2. Add gl_journal_id to track the corresponding journal
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='POSSale' AND column_name='gl_journal_id') THEN
        ALTER TABLE "POSSale" ADD COLUMN gl_journal_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='SalesReturn' AND column_name='gl_journal_id') THEN
        ALTER TABLE "SalesReturn" ADD COLUMN gl_journal_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PurchaseReturn' AND column_name='gl_journal_id') THEN
        ALTER TABLE "PurchaseReturn" ADD COLUMN gl_journal_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='StockAdjustment' AND column_name='gl_journal_id') THEN
        ALTER TABLE "StockAdjustment" ADD COLUMN gl_journal_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PayrollRun' AND column_name='gl_journal_id') THEN
        ALTER TABLE "PayrollRun" ADD COLUMN gl_journal_id UUID;
    END IF;
END $$;


-- ============================================================================
-- 1. POS Sale RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_post_pos_sale(
    p_payload JSONB,
    p_idempotency_key UUID,
    p_gl_settings JSONB
) RETURNS JSONB AS $$
DECLARE
    v_pos_id UUID;
    v_company_id UUID;
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_qty NUMERIC;
    v_existing RECORD;
BEGIN
    -- Check Idempotency
    SELECT * INTO v_existing FROM "POSSale" WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'POS Sale already posted');
    END IF;

    -- Extract common fields
    v_company_id := (p_payload->>'company_id')::UUID;
    v_pos_id := (p_payload->>'id')::UUID;

    -- Inventory Updates with Row-Level Lock
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        IF v_item_id IS NOT NULL AND v_qty > 0 THEN
            UPDATE "Item" 
            SET quantity_on_hand = quantity_on_hand - v_qty 
            WHERE id = v_item_id AND item_type != 'Service';
        END IF;
    END LOOP;

    -- Post the journal via internal hub
    SELECT rpc_commit_journal_entry_internal(
        p_payload,
        'POS Sale',
        (p_payload->>'sale_number')::TEXT,
        (p_payload->>'sale_date')::TIMESTAMP WITH TIME ZONE,
        v_company_id,
        p_gl_settings
    ) INTO v_journal_id;

    -- Update the record
    UPDATE "POSSale" 
    SET status = 'Completed', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = v_pos_id;

    RETURN jsonb_build_object('success', true, 'id', v_pos_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 2. Sales Return RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_post_sales_return(
    p_payload JSONB,
    p_idempotency_key UUID,
    p_gl_settings JSONB
) RETURNS JSONB AS $$
DECLARE
    v_return_id UUID;
    v_company_id UUID;
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_qty NUMERIC;
    v_existing RECORD;
BEGIN
    SELECT * INTO v_existing FROM "SalesReturn" WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'Return already posted');
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_return_id := (p_payload->>'id')::UUID;

    -- Inventory Updates (Stock goes back UP)
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        IF v_item_id IS NOT NULL AND v_qty > 0 THEN
            UPDATE "Item" 
            SET quantity_on_hand = quantity_on_hand + v_qty 
            WHERE id = v_item_id AND item_type != 'Service';
        END IF;
    END LOOP;

    -- Post GL
    SELECT rpc_commit_journal_entry_internal(
        p_payload,
        'Sales Return',
        (p_payload->>'return_number')::TEXT,
        (p_payload->>'return_date')::TIMESTAMP WITH TIME ZONE,
        v_company_id,
        p_gl_settings
    ) INTO v_journal_id;

    -- Update record
    UPDATE "SalesReturn" 
    SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = v_return_id;

    RETURN jsonb_build_object('success', true, 'id', v_return_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 3. Purchase Return RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_post_purchase_return(
    p_payload JSONB,
    p_idempotency_key UUID,
    p_gl_settings JSONB
) RETURNS JSONB AS $$
DECLARE
    v_return_id UUID;
    v_company_id UUID;
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_qty NUMERIC;
    v_existing RECORD;
BEGIN
    SELECT * INTO v_existing FROM "PurchaseReturn" WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'Return already posted');
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_return_id := (p_payload->>'id')::UUID;

    -- Inventory Updates (Stock goes DOWN because we return to vendor)
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        IF v_item_id IS NOT NULL AND v_qty > 0 THEN
            UPDATE "Item" 
            SET quantity_on_hand = quantity_on_hand - v_qty 
            WHERE id = v_item_id AND item_type != 'Service';
        END IF;
    END LOOP;

    -- Post GL
    SELECT rpc_commit_journal_entry_internal(
        p_payload,
        'Purchase Return',
        (p_payload->>'return_number')::TEXT,
        (p_payload->>'return_date')::TIMESTAMP WITH TIME ZONE,
        v_company_id,
        p_gl_settings
    ) INTO v_journal_id;

    -- Update record
    UPDATE "PurchaseReturn" 
    SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = v_return_id;

    RETURN jsonb_build_object('success', true, 'id', v_return_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 4. Stock Adjustment RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_post_stock_adjustment(
    p_payload JSONB,
    p_idempotency_key UUID,
    p_gl_settings JSONB
) RETURNS JSONB AS $$
DECLARE
    v_adj_id UUID;
    v_company_id UUID;
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_adjusted_qty NUMERIC;
    v_existing RECORD;
BEGIN
    SELECT * INTO v_existing FROM "StockAdjustment" WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'Adjustment already posted');
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_adj_id := (p_payload->>'id')::UUID;

    -- Inventory Updates (Sets stock to exactly the adjusted_qty)
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_adjusted_qty := (v_line->>'adjusted_qty')::NUMERIC;
        IF v_item_id IS NOT NULL THEN
            UPDATE "Item" 
            SET quantity_on_hand = v_adjusted_qty 
            WHERE id = v_item_id AND item_type != 'Service';
        END IF;
    END LOOP;

    -- Post GL
    SELECT rpc_commit_journal_entry_internal(
        p_payload,
        'Stock Adjustment',
        (p_payload->>'adjustment_number')::TEXT,
        (p_payload->>'adjustment_date')::TIMESTAMP WITH TIME ZONE,
        v_company_id,
        p_gl_settings
    ) INTO v_journal_id;

    -- Update record
    UPDATE "StockAdjustment" 
    SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = v_adj_id;

    RETURN jsonb_build_object('success', true, 'id', v_adj_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 5. Payroll Run RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_post_payroll_run(
    p_payload JSONB,
    p_idempotency_key UUID,
    p_gl_settings JSONB
) RETURNS JSONB AS $$
DECLARE
    v_run_id UUID;
    v_company_id UUID;
    v_journal_id UUID;
    v_existing RECORD;
BEGIN
    SELECT * INTO v_existing FROM "PayrollRun" WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'Payroll Run already posted');
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_run_id := (p_payload->>'id')::UUID;

    -- Post GL
    SELECT rpc_commit_journal_entry_internal(
        p_payload,
        'Payroll Run',
        (p_payload->>'run_reference')::TEXT,
        NOW(), -- Assuming today's date for payroll journal entry if period_date isn't passed directly
        v_company_id,
        p_gl_settings
    ) INTO v_journal_id;

    -- Update record
    UPDATE "PayrollRun" 
    SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = v_run_id;

    RETURN jsonb_build_object('success', true, 'id', v_run_id);
END;
$$ LANGUAGE plpgsql;

COMMIT;
