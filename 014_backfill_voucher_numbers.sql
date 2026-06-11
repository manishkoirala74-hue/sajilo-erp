-- ==============================================================================
-- 014_backfill_voucher_numbers.sql
-- Backfill historical General Ledger Journals with proper voucher numbers
-- ==============================================================================

-- 1. Backfill Sales Invoices
UPDATE "GeneralLedgerJournal" j
SET voucher_no = s.invoice_number
FROM "SalesInvoice" s
WHERE j.source_document_type = 'SalesInvoice' 
  AND j.source_document_id = s.id::TEXT 
  AND j.voucher_no IS NULL;

-- 2. Backfill Purchase Invoices
UPDATE "GeneralLedgerJournal" j
SET voucher_no = p.invoice_number
FROM "PurchaseInvoice" p
WHERE j.source_document_type = 'PurchaseInvoice' 
  AND j.source_document_id = p.id::TEXT 
  AND j.voucher_no IS NULL;

-- 3. Backfill POS Sales
UPDATE "GeneralLedgerJournal" j
SET voucher_no = p.sale_number
FROM "POSSale" p
WHERE j.source_document_type = 'POSSale' 
  AND j.source_document_id = p.id::TEXT 
  AND j.voucher_no IS NULL;

-- 4. Backfill Sales Returns
UPDATE "GeneralLedgerJournal" j
SET voucher_no = s.return_number
FROM "SalesReturn" s
WHERE j.source_document_type = 'SalesReturn' 
  AND j.source_document_id = s.id::TEXT 
  AND j.voucher_no IS NULL;

-- 5. Backfill Purchase Returns
UPDATE "GeneralLedgerJournal" j
SET voucher_no = p.return_number
FROM "PurchaseReturn" p
WHERE j.source_document_type = 'PurchaseReturn' 
  AND j.source_document_id = p.id::TEXT 
  AND j.voucher_no IS NULL;

-- 6. Backfill Stock Adjustments
UPDATE "GeneralLedgerJournal" j
SET voucher_no = s.adjustment_number
FROM "StockAdjustment" s
WHERE j.source_document_type = 'StockAdjustment' 
  AND j.source_document_id = s.id::TEXT 
  AND j.voucher_no IS NULL;

-- 7. Fix any previously Cancelled/Reversed transactions that don't map to a source
UPDATE "GeneralLedgerJournal" j
SET voucher_no = 'REV-' || SUBSTRING(j.id::TEXT, 1, 8)
WHERE j.reference_module = 'Reversal'
  AND j.voucher_no IS NULL;
