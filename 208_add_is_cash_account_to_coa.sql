-- 208_add_is_cash_account_to_coa.sql
-- Adds two deterministic boolean classification flags to ChartOfAccount:
--   is_cash_account  → TRUE for liquid Cash ledgers (e.g. Cash in Hand, Petty Cash)
--   is_bank_account  → TRUE for Bank deposit / current account ledgers
--
-- These flags replace brittle ILIKE text-matching heuristics in financial
-- reporting queries. Partial indexes are added for query performance.
--
-- Prerequisites : None (additive schema change only)
-- Run After     : 207_hr_settings_columns.sql
-- Rollback      : 208_add_is_cash_account_to_coa_rollback.sql

BEGIN;

ALTER TABLE "ChartOfAccount"
  ADD COLUMN IF NOT EXISTS "is_cash_account" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_bank_account" BOOLEAN NOT NULL DEFAULT false;

-- Partial indexes: only scan the flagged minority of rows for dashboard queries.
CREATE INDEX IF NOT EXISTS idx_coa_is_cash_account
  ON "ChartOfAccount" (company_id, is_cash_account)
  WHERE is_cash_account = true;

CREATE INDEX IF NOT EXISTS idx_coa_is_bank_account
  ON "ChartOfAccount" (company_id, is_bank_account)
  WHERE is_bank_account = true;

COMMIT;
