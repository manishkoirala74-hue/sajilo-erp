-- 208_add_is_cash_account_to_coa_rollback.sql
-- Reverts 208_add_is_cash_account_to_coa.sql
-- Drops the partial indexes then removes the two classification columns.
--
-- WARNING: Run 210_get_cash_bank_balance_rpc_rollback.sql and
--          209_backfill_cash_bank_flags_rollback.sql BEFORE this script,
--          as they depend on the columns being present.

BEGIN;

DROP INDEX IF EXISTS idx_coa_is_bank_account;
DROP INDEX IF EXISTS idx_coa_is_cash_account;

ALTER TABLE "ChartOfAccount"
  DROP COLUMN IF EXISTS "is_bank_account",
  DROP COLUMN IF EXISTS "is_cash_account";

COMMIT;
