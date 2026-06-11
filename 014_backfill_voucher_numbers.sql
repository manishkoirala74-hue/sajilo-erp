-- ==============================================================================
-- BACKFILL HISTORICAL VOUCHER NUMBERS IN GENERAL LEDGER
-- This script updates the 'voucher_no' column in GeneralLedgerJournal
-- for older transactions by looking up their respective operational tables.
-- ==============================================================================

-- 1. Sales Invoice
UPDATE "GeneralLedgerJournal" j
SET voucher_no = si.invoice_number
FROM "SalesInvoice" si
WHERE j.source_document_type = 'SalesInvoice'
  AND j.source_document_id = si.id::TEXT
  AND (j.voucher_no IS NULL OR j.voucher_no = j.id::TEXT);

-- 2. Purchase Invoice
UPDATE "GeneralLedgerJournal" j
SET voucher_no = pi.invoice_number
FROM "PurchaseInvoice" pi
WHERE j.source_document_type = 'PurchaseInvoice'
  AND j.source_document_id = pi.id::TEXT
  AND (j.voucher_no IS NULL OR j.voucher_no = j.id::TEXT);

-- 3. POS Sale
UPDATE "GeneralLedgerJournal" j
SET voucher_no = ps.sale_number
FROM "POSSale" ps
WHERE j.source_document_type = 'POSSale'
  AND j.source_document_id = ps.id::TEXT
  AND (j.voucher_no IS NULL OR j.voucher_no = j.id::TEXT);

-- 4. Sales Return
UPDATE "GeneralLedgerJournal" j
SET voucher_no = sr.return_number
FROM "SalesReturn" sr
WHERE j.source_document_type = 'SalesReturn'
  AND j.source_document_id = sr.id::TEXT
  AND (j.voucher_no IS NULL OR j.voucher_no = j.id::TEXT);

-- 5. Purchase Return
UPDATE "GeneralLedgerJournal" j
SET voucher_no = pr.return_number
FROM "PurchaseReturn" pr
WHERE j.source_document_type = 'PurchaseReturn'
  AND j.source_document_id = pr.id::TEXT
  AND (j.voucher_no IS NULL OR j.voucher_no = j.id::TEXT);

-- 6. Financial Voucher
UPDATE "GeneralLedgerJournal" j
SET voucher_no = fv.voucher_number
FROM "FinancialVoucher" fv
WHERE j.source_document_type = 'FinancialVoucher'
  AND j.source_document_id = fv.id::TEXT
  AND (j.voucher_no IS NULL OR j.voucher_no = j.id::TEXT);

-- 7. Stock Adjustment
UPDATE "GeneralLedgerJournal" j
SET voucher_no = sa.adjustment_number
FROM "StockAdjustment" sa
WHERE j.source_document_type = 'StockAdjustment'
  AND j.source_document_id = sa.id::TEXT
  AND (j.voucher_no IS NULL OR j.voucher_no = j.id::TEXT);
