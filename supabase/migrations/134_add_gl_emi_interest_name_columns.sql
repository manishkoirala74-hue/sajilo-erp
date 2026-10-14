-- 134_add_gl_emi_interest_name_columns.sql
-- Adds the missing gl_unearned_emi_interest_name and gl_emi_interest_income_name columns to CompanySettings.
-- Ensures that when restoring defaults or saving GL mapping in settings/finance/gl-mapping,
-- both account IDs and their display names persist seamlessly.

BEGIN;

ALTER TABLE public."CompanySettings"
  ADD COLUMN IF NOT EXISTS gl_unearned_emi_interest_id   UUID REFERENCES public."ChartOfAccount"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS gl_unearned_emi_interest_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gl_emi_interest_income_id     UUID REFERENCES public."ChartOfAccount"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS gl_emi_interest_income_name   TEXT DEFAULT NULL;

COMMIT;
