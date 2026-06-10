-- ==============================================================================
-- CLEANUP SCRIPT: REMOVE UNBALANCED & ORPHANED JOURNALS
-- ==============================================================================

-- 1. Identify and Delete Unbalanced Journals
-- (Where total debits do not equal total credits)
WITH unbalanced_journals AS (
    SELECT j.id
    FROM "GeneralLedgerJournal" j
    JOIN "GeneralLedgerLine" l ON j.id::TEXT = l.journal_id
    GROUP BY j.id
    HAVING ABS(SUM(COALESCE(l.debit_amount, 0)) - SUM(COALESCE(l.credit_amount, 0))) > 0.01
)
DELETE FROM "GeneralLedgerLine" 
WHERE journal_id IN (SELECT id::TEXT FROM unbalanced_journals);

WITH unbalanced_journals AS (
    SELECT j.id
    FROM "GeneralLedgerJournal" j
    JOIN "GeneralLedgerLine" l ON j.id::TEXT = l.journal_id
    GROUP BY j.id
    HAVING ABS(SUM(COALESCE(l.debit_amount, 0)) - SUM(COALESCE(l.credit_amount, 0))) > 0.01
)
DELETE FROM "GeneralLedgerJournal" 
WHERE id IN (SELECT id FROM unbalanced_journals);


-- 2. Identify and Delete Orphaned Journals
-- (Journals that have no lines at all)
WITH empty_journals AS (
    SELECT j.id
    FROM "GeneralLedgerJournal" j
    LEFT JOIN "GeneralLedgerLine" l ON j.id::TEXT = l.journal_id
    GROUP BY j.id
    HAVING COUNT(l.id) = 0
)
DELETE FROM "GeneralLedgerJournal" 
WHERE id IN (SELECT id FROM empty_journals);


-- 3. Recalculate Current Balances for the Chart of Accounts
-- Since we deleted bad data, we need to correct the cached 'current_balance' 
-- on the ChartOfAccount table.
WITH true_balances AS (
    SELECT 
        account_id,
        SUM(COALESCE(debit_amount, 0)) as total_dr,
        SUM(COALESCE(credit_amount, 0)) as total_cr
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON j.id::TEXT = l.journal_id
    WHERE j.status = 'Posted'
    GROUP BY account_id
)
UPDATE "ChartOfAccount" c
SET current_balance = 
    CASE 
        WHEN c.normal_balance = 'Debit' THEN COALESCE(tb.total_dr, 0) - COALESCE(tb.total_cr, 0)
        WHEN c.normal_balance = 'Credit' THEN COALESCE(tb.total_cr, 0) - COALESCE(tb.total_dr, 0)
        ELSE COALESCE(tb.total_dr, 0) - COALESCE(tb.total_cr, 0)
    END
FROM true_balances tb
WHERE c.id::TEXT = tb.account_id::TEXT;

-- Set balances to 0 for accounts that have no lines left
UPDATE "ChartOfAccount" c
SET current_balance = 0
WHERE NOT EXISTS (
    SELECT 1 FROM "GeneralLedgerLine" l 
    JOIN "GeneralLedgerJournal" j ON j.id::TEXT = l.journal_id
    WHERE l.account_id::TEXT = c.id::TEXT AND j.status = 'Posted'
);
