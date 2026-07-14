-- 094_unified_cancellation_rpc.sql
-- Unified RPC to atomically cancel Sales and Purchase Invoices
-- This function handles status updates, GL deletion, and Inventory deletion.

CREATE OR REPLACE FUNCTION rpc_cancel_document(p_doc_id UUID, p_doc_type TEXT, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing_status VARCHAR;
    v_affected_items UUID[];
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

    -- 2. GL Deletion (Hard Delete as per Sajilo ERP standard, audit trail remains in invoice row)
    PERFORM public.rpc_delete_gl_journals(p_doc_id, p_doc_type);

    -- 3. Inventory Deletion (Triggers update_current_stock automatically)
    -- First, gather the items affected so we can resync their global quantity_on_hand
    SELECT array_agg(DISTINCT item_id) INTO v_affected_items 
    FROM public."InventoryLedger" 
    WHERE reference_id = p_doc_id AND reference_type = p_doc_type;

    IF v_affected_items IS NOT NULL THEN
        DELETE FROM public."InventoryLedger" 
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
