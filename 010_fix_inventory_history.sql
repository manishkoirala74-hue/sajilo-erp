UPDATE "GeneralLedgerLine" l
SET 
  account_id = a.id::text,
  account_code = a.account_code,
  account_name = a.account_name
FROM "ChartOfAccount" a, "GeneralLedgerJournal" j
WHERE a.account_code = '1140'
  AND l.journal_id = j.id::text
  AND j.source_document_type = 'PurchaseInvoice'
  AND l.description LIKE 'Purchase:%'
  AND l.account_id != a.id::text;
