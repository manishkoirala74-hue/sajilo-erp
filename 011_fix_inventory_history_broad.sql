UPDATE "GeneralLedgerLine" l
SET 
  account_id = a.id::text,
  account_code = a.account_code,
  account_name = a.account_name
FROM "ChartOfAccount" a, "GeneralLedgerJournal" j
WHERE a.account_code = '1140'
  AND l.journal_id = j.id::text
  AND l.account_code != '1140'
  AND l.debit_amount > 0
  AND (
       j.source_document_type = 'PurchaseInvoice' 
       OR j.source_document_id IN (SELECT id::text FROM "PurchaseInvoice")
       OR j.description ILIKE '%Purchase Invoice%'
      )
  AND l.account_name NOT ILIKE '%VAT%'
  AND l.account_name NOT ILIKE '%Tax%'
  AND l.account_name NOT ILIKE '%Payable%'
  AND l.account_name NOT ILIKE '%Cash%'
  AND l.account_name NOT ILIKE '%Bank%';
