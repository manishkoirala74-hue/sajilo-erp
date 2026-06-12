-- Backfill missing or UUID voucher numbers in GeneralLedgerJournal

UPDATE "GeneralLedgerJournal" j
SET voucher_no = (
  CASE 
    WHEN j.source_document_type = 'PurchaseInvoice' THEN COALESCE((SELECT invoice_number FROM "PurchaseInvoice" WHERE id = j.source_document_id LIMIT 1), 'PUR-' || SUBSTRING(j.id::TEXT, 1, 8))
    WHEN j.source_document_type = 'SalesInvoice' THEN COALESCE((SELECT invoice_number FROM "SalesInvoice" WHERE id = j.source_document_id LIMIT 1), 'INV-' || SUBSTRING(j.id::TEXT, 1, 8))
    WHEN j.source_document_type = 'POSSale' THEN COALESCE((SELECT sale_number FROM "POSSale" WHERE id = j.source_document_id LIMIT 1), 'POS-' || SUBSTRING(j.id::TEXT, 1, 8))
    WHEN j.source_document_type = 'FinancialVoucher' THEN COALESCE((SELECT voucher_number FROM "FinancialVoucher" WHERE id = j.source_document_id LIMIT 1), 'VOU-' || SUBSTRING(j.id::TEXT, 1, 8))
    WHEN j.source_document_type = 'StockAdjustment' THEN COALESCE((SELECT reference_number FROM "StockAdjustment" WHERE id = j.source_document_id LIMIT 1), 'ADJ-' || SUBSTRING(j.id::TEXT, 1, 8))
    WHEN j.source_document_type = 'SalesReturn' THEN COALESCE((SELECT return_number FROM "SalesReturn" WHERE id = j.source_document_id LIMIT 1), 'RET-' || SUBSTRING(j.id::TEXT, 1, 8))
    ELSE UPPER(SUBSTRING(j.source_document_type, 1, 3)) || '-' || SUBSTRING(j.id::TEXT, 1, 8)
  END
)
WHERE j.voucher_no IS NULL 
   OR j.voucher_no = j.id::TEXT 
   OR length(j.voucher_no) = 36;
