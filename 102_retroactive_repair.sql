-- 102_retroactive_repair.sql
-- Safely revert anomalous legacy transactions to Draft status
-- and completely clean up any orphaned journals

-- Fix missing columns on PurchaseInvoice that break the cancellation RPC
ALTER TABLE public."PurchaseInvoice" 
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_date TIMESTAMP WITH TIME ZONE;

DO $$
DECLARE
    v_rec RECORD;
    v_sales_ids UUID[] := '{}';
    v_purchase_ids UUID[] := '{}';
BEGIN
    -- 0. Purge Orphaned Journals that no longer have a parent invoice
    DELETE FROM "GeneralLedgerJournal" WHERE source_document_type = 'SalesInvoice' AND (source_document_id IS NULL OR source_document_id NOT IN (SELECT id FROM "SalesInvoice"));
    DELETE FROM "GeneralLedgerJournal" WHERE source_document_type = 'PurchaseInvoice' AND (source_document_id IS NULL OR source_document_id NOT IN (SELECT id FROM "PurchaseInvoice"));

    -- 1. Identify Invalid Sales Journals (For existing invoices)
    FOR v_rec IN 
        SELECT j.source_document_id as id
        FROM "GeneralLedgerJournal" j
        JOIN "SalesInvoice" si ON si.id = j.source_document_id
        WHERE j.source_document_type = 'SalesInvoice'
        AND NOT EXISTS (
            SELECT 1 FROM "GeneralLedgerLine" l
            JOIN "ChartOfAccount" a ON a.id = l.account_id
            WHERE l.journal_id = j.id AND (a.account_type ILIKE '%receivable%' OR a.account_name ILIKE '%receivable%' OR a.account_type ILIKE '%cash%' OR a.account_type ILIKE '%bank%')
        )
    LOOP
        v_sales_ids := array_append(v_sales_ids, v_rec.id);
    END LOOP;

    -- 2. Identify Sales Journals missing COGS
    FOR v_rec IN 
        SELECT si.id
        FROM "SalesInvoice" si
        JOIN "GeneralLedgerJournal" j ON j.source_document_id = si.id
        WHERE si.status = 'Posted'
        AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(si.line_items) AS item
            JOIN "Item" i ON i.id = (item->>'item_id')::UUID
            WHERE i.is_physical = true
        )
        AND NOT EXISTS (
            SELECT 1 FROM "GeneralLedgerLine" l
            JOIN "ChartOfAccount" a ON a.id = l.account_id
            WHERE l.journal_id = j.id AND (a.account_type ILIKE '%expense%' OR a.account_type ILIKE '%cogs%' OR a.account_type ILIKE '%cost of%')
        )
    LOOP
        v_sales_ids := array_append(v_sales_ids, v_rec.id);
    END LOOP;

    -- 3. Identify Invalid Purchase Journals
    FOR v_rec IN 
        SELECT j.source_document_id as id
        FROM "GeneralLedgerJournal" j
        JOIN "PurchaseInvoice" pi ON pi.id = j.source_document_id
        WHERE j.source_document_type = 'PurchaseInvoice'
        AND NOT EXISTS (
            SELECT 1 FROM "GeneralLedgerLine" l
            JOIN "ChartOfAccount" a ON a.id = l.account_id
            WHERE l.journal_id = j.id AND (a.account_type ILIKE '%payable%' OR a.account_name ILIKE '%payable%' OR a.account_type ILIKE '%cash%' OR a.account_type ILIKE '%bank%')
        )
    LOOP
        v_purchase_ids := array_append(v_purchase_ids, v_rec.id);
    END LOOP;

    -- 4. Execute Native Cancellation RPC for Sales
    FOR v_rec IN SELECT DISTINCT unnest(v_sales_ids) AS id LOOP
        PERFORM rpc_cancel_document(v_rec.id, 'SalesInvoice', 'Retroactive Repair to Draft');
    END LOOP;

    -- 5. Execute Native Cancellation RPC for Purchases
    FOR v_rec IN SELECT DISTINCT unnest(v_purchase_ids) AS id LOOP
        PERFORM rpc_cancel_document(v_rec.id, 'PurchaseInvoice', 'Retroactive Repair to Draft');
    END LOOP;

    -- 6. Restore specific Cancelled documents directly to Draft
    IF array_length(v_sales_ids, 1) > 0 THEN
        UPDATE "SalesInvoice" 
        SET status = 'Draft', cancelled_date = NULL, cancellation_reason = NULL, payment_status = 'Unpaid'
        WHERE id = ANY(v_sales_ids);
    END IF;

    IF array_length(v_purchase_ids, 1) > 0 THEN
        UPDATE "PurchaseInvoice" 
        SET status = 'Draft', cancelled_date = NULL, cancellation_reason = NULL, payment_status = 'Unpaid'
        WHERE id = ANY(v_purchase_ids);
    END IF;

END $$;
