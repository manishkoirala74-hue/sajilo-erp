-- 1. Cancel all journals belonging to documents that are genuinely cancelled
UPDATE "GeneralLedgerJournal"
SET status = 'Cancelled'
WHERE source_document_id IN (
    SELECT id::TEXT FROM "SalesInvoice" WHERE status = 'Cancelled'
    UNION ALL
    SELECT id::TEXT FROM "PurchaseInvoice" WHERE status = 'Cancelled'
);

-- 2. For EDITED documents, keep only the LATEST journal and cancel the old duplicate ones
UPDATE "GeneralLedgerJournal"
SET status = 'Cancelled'
WHERE description NOT LIKE '%CANCELLED%'
  AND description NOT LIKE '%VOIDED%'
  AND source_document_id IS NOT NULL
  AND id NOT IN (
      SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER(PARTITION BY source_document_id ORDER BY created_at DESC) as rn
          FROM "GeneralLedgerJournal"
          WHERE description NOT LIKE '%CANCELLED%' AND description NOT LIKE '%VOIDED%'
      ) sub WHERE rn = 1
  );

-- 3. Delete the buggy/empty reversal journals that failed to post
DELETE FROM "GeneralLedgerJournal"
WHERE (description LIKE '%CANCELLED%' OR description LIKE '%VOIDED%')
  AND total_debit = 0;

-- 4. Reset cached Trial Balances to zero safely
UPDATE "ChartOfAccount" SET current_balance = 0;

-- 5. Recalculate exact Trial Balances from the clean, deduplicated ledger lines
UPDATE "ChartOfAccount" c
SET current_balance = calc.net_balance
FROM (
    SELECT 
        l.account_id::TEXT as account_id,
        SUM(
            CASE 
                WHEN c_type.account_type IN ('Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense') 
                THEN COALESCE(l.debit_amount, 0) - COALESCE(l.credit_amount, 0)
                ELSE COALESCE(l.credit_amount, 0) - COALESCE(l.debit_amount, 0)
            END
        ) as net_balance
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON j.id::TEXT = l.journal_id::TEXT
    JOIN "ChartOfAccount" c_type ON c_type.id::TEXT = l.account_id::TEXT
    WHERE j.status = 'Posted'
    GROUP BY l.account_id::TEXT
) calc
WHERE c.id::TEXT = calc.account_id;
