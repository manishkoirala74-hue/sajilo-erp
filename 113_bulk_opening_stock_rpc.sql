-- Migration: 113_bulk_opening_stock_rpc
-- Description: Adds bulk opening stock RPC and rollback functionality with safe double-entry posting.

-- 1. Add metadata column to ItemImportLog for tracking created items and journal ID
ALTER TABLE "ItemImportLog" ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 2. Create the Bulk Import RPC
CREATE OR REPLACE FUNCTION rpc_post_bulk_opening_stock(
    p_items jsonb,
    p_inventory_account_id uuid,
    p_offset_account_id uuid,
    p_date date,
    p_company_id uuid,
    p_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    item_record jsonb;
    v_total_value numeric := 0;
    v_journal_id uuid := NULL;
    v_journal_lines jsonb;
    v_voucher_no text;
BEGIN
    -- Loop through items and create physical Inventory History
    FOR item_record IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_total_value := v_total_value + (item_record->>'total_value')::numeric;

        INSERT INTO "InventoryHistory" (
            item_id, 
            company_id,
            transaction_date,
            reference_type,
            reference_no,
            quantity_change, 
            unit_cost,
            notes,
            created_at,
            created_by
        ) VALUES (
            (item_record->>'item_id')::uuid, 
            p_company_id,
            p_date, 
            'Opening Stock',
            'OP-BULK-' || to_char(p_date, 'YYYYMMDD'),
            (item_record->>'quantity')::numeric, 
            (item_record->>'rate')::numeric,
            'Bulk Opening Stock Import',
            NOW(),
            p_user_id
        );
    END LOOP;

    -- Post Financials via Central Hub
    IF v_total_value > 0 THEN
        v_journal_lines := jsonb_build_array(
            jsonb_build_object('account_id', p_inventory_account_id, 'debit_amount', v_total_value, 'credit_amount', 0),
            jsonb_build_object('account_id', p_offset_account_id, 'debit_amount', 0, 'credit_amount', v_total_value)
        );

        v_voucher_no := 'OP-BULK-' || extract(epoch from now())::int::text;

        v_journal_id := rpc_commit_journal_entry_internal(
            p_company_id, 
            p_date, 
            'Bulk Opening Stock Import', 
            'Inventory',
            NULL, -- p_source_id (no single source item)
            'BulkImport',
            v_voucher_no, 
            v_journal_lines
        );
    END IF;

    RETURN v_journal_id;
END;
$$;

-- 3. Create the Rollback RPC
CREATE OR REPLACE FUNCTION rpc_rollback_bulk_import(
    p_log_id uuid,
    p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
    v_log_record RECORD;
    v_journal_id uuid;
    v_created_items jsonb;
    v_item_id uuid;
    v_history_count int;
BEGIN
    -- Fetch the log
    SELECT * INTO v_log_record FROM "ItemImportLog" WHERE id = p_log_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Import log not found.';
    END IF;

    IF v_log_record.status = 'Rolled Back' THEN
        RAISE EXCEPTION 'This import has already been rolled back.';
    END IF;

    v_journal_id := (v_log_record.metadata->>'journal_id')::uuid;
    v_created_items := v_log_record.metadata->'created_item_ids';

    IF v_created_items IS NULL OR jsonb_array_length(v_created_items) = 0 THEN
        RAISE EXCEPTION 'No items were created in this import to rollback.';
    END IF;

    -- Validation: Ensure no items have subsequent transactions (e.g., sales)
    FOR v_item_id IN SELECT jsonb_array_elements_text(v_created_items)::uuid
    LOOP
        SELECT COUNT(*) INTO v_history_count 
        FROM "InventoryHistory" 
        WHERE item_id = v_item_id AND reference_type != 'Opening Stock';

        IF v_history_count > 0 THEN
            RAISE EXCEPTION 'Cannot rollback. Item % has subsequent transactions.', v_item_id;
        END IF;
    END LOOP;

    -- Deletion Sequence (Foreign Key Compliance)
    -- 1. Explicitly delete child InventoryHistory records
    FOR v_item_id IN SELECT jsonb_array_elements_text(v_created_items)::uuid
    LOOP
        DELETE FROM "InventoryHistory" 
        WHERE item_id = v_item_id AND reference_type = 'Opening Stock';
    END LOOP;

    -- 2. Explicitly delete the items
    FOR v_item_id IN SELECT jsonb_array_elements_text(v_created_items)::uuid
    LOOP
        DELETE FROM "Item" WHERE id = v_item_id;
    END LOOP;

    -- Ledger Rollback (Audit Compliance via Soft-Delete)
    IF v_journal_id IS NOT NULL THEN
        -- Cancel the journal to preserve the voucher number
        UPDATE "GeneralLedgerJournal" 
        SET status = 'Cancelled', notes = 'Cancelled via bulk import rollback'
        WHERE id = v_journal_id;

        -- Zero out the ledger lines to neutralize impact
        UPDATE "GeneralLedgerLine"
        SET debit = 0, credit = 0, debit_amount = 0, credit_amount = 0
        WHERE journal_id = v_journal_id;
    END IF;

    -- Update Log Status
    UPDATE "ItemImportLog"
    SET status = 'Rolled Back',
        updated_at = NOW(),
        updated_by = p_user_id::text
    WHERE id = p_log_id;

    RETURN true;
END;
$$;
