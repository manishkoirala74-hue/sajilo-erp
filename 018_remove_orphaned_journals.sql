-- =================================================================================
-- FIX ORPHANED GL JOURNALS FROM DELETED VOUCHERS
-- 
-- Description: 
-- This script removes GeneralLedgerJournal and GeneralLedgerLine entries 
-- that belong to Financial Vouchers which have been hard-deleted from the system.
-- Since the system previously created a Reversal Journal but deleted the Voucher, 
-- both the original and reversal journals are left orphaned, causing UUIDs to 
-- appear in ledger statements.
-- Since the original and reversal journals exactly cancel each other out, 
-- deleting them both has ZERO net impact on ChartOfAccount balances.
-- =================================================================================

BEGIN;

-- 1. Identify orphaned journals
CREATE TEMP TABLE orphaned_journals AS
SELECT j.id
FROM "GeneralLedgerJournal" j
LEFT JOIN "FinancialVoucher" fv ON j.source_document_id = fv.id::text
WHERE j.source_document_type = 'FinancialVoucher'
  AND fv.id IS NULL;

-- 2. Delete the lines associated with these orphaned journals
DELETE FROM "GeneralLedgerLine"
WHERE journal_id IN (SELECT id::text FROM orphaned_journals);

-- 3. Delete the orphaned journals themselves
DELETE FROM "GeneralLedgerJournal"
WHERE id IN (SELECT id FROM orphaned_journals);

-- Output how many were deleted
DO $$
DECLARE
    deleted_count INT;
BEGIN
    SELECT count(*) INTO deleted_count FROM orphaned_journals;
    RAISE NOTICE 'Deleted % orphaned GeneralLedgerJournal entries and their associated lines.', deleted_count;
END $$;

COMMIT;
