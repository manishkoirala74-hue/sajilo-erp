-- 209_backfill_cash_bank_flags_rollback.sql
-- Reverts 209_backfill_cash_bank_flags.sql
-- Clears all backfilled flag values and drops the GL line compound index.
--
-- WARNING: Run 210_get_cash_bank_balance_rpc_rollback.sql BEFORE this script.
-- Run this script BEFORE 208_add_is_cash_account_to_coa_rollback.sql.

BEGIN;

DROP INDEX IF EXISTS idx_gl_line_company_account_journal;

-- Reset all backfilled values. Columns remain (they are dropped by rollback 208).
UPDATE "ChartOfAccount" SET is_bank_account = false WHERE is_bank_account = true;
UPDATE "ChartOfAccount" SET is_cash_account = false WHERE is_cash_account = true;

COMMIT;
