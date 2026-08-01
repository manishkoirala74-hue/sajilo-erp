-- 094_unified_cancellation_rpc.sql
-- Unified RPC to atomically cancel Sales and Purchase Invoices
-- This function handles status updates, GL reversals (contra-entries), and Inventory reversals.

CREATE OR REPLACE FUNCTION rpc_cancel_document(p_doc_id UUID, p_doc_type TEXT, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_status VARCHAR;
    v_affected_items UUID[];
    v_journal_record RECORD;
BEGIN
    -- Check permissions (must be authenticated)
    IF auth.role() != 'authenticated' AND auth.role() != 'service_role' THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Must be logged in to cancel documents.';
    END IF;

    -- 1. Idempotency Guard & Status Update
    IF p_doc_type = 'SalesInvoice' THEN
        SELECT status INTO v_existing_status FROM public."SalesInvoice" WHERE id = p_doc_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'ERR_NOT_FOUND: Invoice not found.'; END IF;
        IF v_existing_status = 'Cancelled' THEN RETURN; END IF;
        
        UPDATE public."SalesInvoice" 
        SET status = 'Cancelled', cancellation_reason = p_reason, cancelled_date = CURRENT_TIMESTAMP
        WHERE id = p_doc_id;

    ELSIF p_doc_type = 'PurchaseInvoice' THEN
        SELECT status INTO v_existing_status FROM public."PurchaseInvoice" WHERE id = p_doc_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'ERR_NOT_FOUND: Invoice not found.'; END IF;
        IF v_existing_status = 'Cancelled' THEN RETURN; END IF;
        
        UPDATE public."PurchaseInvoice" 
        SET status = 'Cancelled', cancellation_reason = p_reason, cancelled_date = CURRENT_TIMESTAMP
        WHERE id = p_doc_id;

    ELSE
        RAISE EXCEPTION 'ERR_INVALID_DOC_TYPE: Document type % is not supported for cancellation.', p_doc_type;
    END IF;

    -- 2. GL Reversal (Append-Only Ledger standard: create contra-entries)
    FOR v_journal_record IN 
        SELECT id, company_id FROM public."GeneralLedgerJournal" 
        WHERE source_document_id = p_doc_id AND source_document_type = p_doc_type
    LOOP
        PERFORM public.rpc_reverse_gl_journal(v_journal_record.company_id, v_journal_record.id, CURRENT_DATE, p_reason);
    END LOOP;

    -- 3. Inventory Reversal (Append-Only standard: create stock contra-entries)
    -- First, gather the items affected so we can resync their global quantity_on_hand
    SELECT array_agg(DISTINCT item_id) INTO v_affected_items 
    FROM public."InventoryLedger" 
    WHERE reference_id = p_doc_id AND reference_type = p_doc_type;

    IF v_affected_items IS NOT NULL THEN
        INSERT INTO public."InventoryLedger" (
            company_id, item_id, transaction_type, godown_id, 
            quantity_in, quantity_out, transaction_date, reference_id, reference_type, 
            total_amount, description, voucher_no, wac_at_post
        )
        SELECT 
            company_id, item_id, transaction_type, godown_id, 
            quantity_out, -- Swapped to negate movement
            quantity_in,  -- Swapped to negate movement
            CURRENT_TIMESTAMP, reference_id, reference_type, 
            total_amount, CONCAT('Cancelled: ', p_reason), 
            CONCAT(voucher_no, '-REV'), -- Appended suffix for strict audit visibility
            wac_at_post
        FROM public."InventoryLedger"
        WHERE reference_id = p_doc_id AND reference_type = p_doc_type;

        -- 4. Resync the global Item.quantity_on_hand cache with CurrentStock
        UPDATE public."Item" i
        SET quantity_on_hand = COALESCE((
            SELECT SUM(current_qty)
            FROM public."CurrentStock"
            WHERE item_id = i.id
        ), 0)
        WHERE id = ANY(v_affected_items);
    END IF;

END;
$$;

-- Lock down the function
REVOKE EXECUTE ON FUNCTION rpc_cancel_document(UUID, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION rpc_cancel_document(UUID, TEXT, TEXT) TO authenticated, service_role;
