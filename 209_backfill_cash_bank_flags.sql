-- 209_backfill_cash_bank_flags.sql
-- Backfills is_cash_account and is_bank_account for all existing tenants.
-- Uses deterministic account_code matching on system accounts — NOT ILIKE.
--
--   Code 1110 (Cash in Hand)     → is_cash_account = TRUE
--   Sub-ledgers under code 1120  → is_bank_account = TRUE
--     (Covers both the default seeded "Bank Accounts" group and any user-created
--     bank sub-ledgers created via BankAccountFormModal → createSubLedger.)
--
-- Also adds a compound index on GeneralLedgerLine to accelerate the
-- fiscal-year-bounded balance query introduced in migration 210.
--
-- Prerequisites : 208_add_is_cash_account_to_coa.sql
-- Run After     : 208_add_is_cash_account_to_coa.sql
-- Rollback      : 209_backfill_cash_bank_flags_rollback.sql

BEGIN;

-- 1. Mark system-seeded "Cash in Hand" (account_code = '1110') across all tenants.
UPDATE "ChartOfAccount"
SET    is_cash_account = true
WHERE  is_system_account = true
  AND  account_code = '1110';

-- 2. Mark Sub Ledger children of every tenant's "Bank Accounts" group (code 1120).
--    Covers both the seeded group and any user-created bank sub-ledgers whose
--    parent is the 1120 group ledger.
UPDATE "ChartOfAccount" child
SET    is_bank_account = true
FROM   "ChartOfAccount" parent
WHERE  child.parent_account_id = parent.id::uuid
  AND  parent.account_code     = '1120'
  AND  parent.is_system_account = true
  AND  child.ledger_type       = 'Sub Ledger';

-- 3. Compound index on GeneralLedgerLine for the fiscal-year-bounded balance query
--    introduced in 210_get_cash_bank_balance_rpc.sql.
--    Covers: company_id equality filter + account_id join against flagged COA rows
--            + journal_id join to GeneralLedgerJournal for entry_date filtering.
CREATE INDEX IF NOT EXISTS idx_gl_line_company_account_journal
  ON "GeneralLedgerLine" (company_id, account_id, journal_id);

COMMIT;
