-- fix_si_2026_011.sql
-- Isolated Data Patch to clean up orphaned entries for SI-2026-011

DO $$
DECLARE
    v_invoice_id UUID;
BEGIN
    -- 1. Find the invoice ID for SI-2026-011
    SELECT id INTO v_invoice_id FROM public."SalesInvoice" WHERE invoice_number = 'SI-2026-011';
    
    IF v_invoice_id IS NOT NULL THEN
        -- 2. Delete orphaned GL journals
        DELETE FROM public."GeneralLedgerLine" 
        WHERE journal_id IN (
            SELECT id FROM public."GeneralLedgerJournal" 
            WHERE source_document_id = v_invoice_id 
              AND source_document_type = 'SalesInvoice'
        );
        
        DELETE FROM public."GeneralLedgerJournal" 
        WHERE source_document_id = v_invoice_id 
          AND source_document_type = 'SalesInvoice';

        -- 3. Delete orphaned Inventory entries (this will trigger stock restoration)
        DELETE FROM public."InventoryLedger" 
        WHERE reference_id = v_invoice_id AND reference_type = 'SalesInvoice';
        
        -- 4. Resync the global Item.quantity_on_hand cache with CurrentStock
        UPDATE public."Item" i
        SET quantity_on_hand = COALESCE((
            SELECT SUM(current_qty)
            FROM public."CurrentStock"
            WHERE item_id = i.id
        ), 0)
        WHERE item_type = 'Product';

        RAISE NOTICE 'Successfully cleaned up SI-2026-011.';
    ELSE
        RAISE NOTICE 'SI-2026-011 not found.';
    END IF;
END;
$$;
