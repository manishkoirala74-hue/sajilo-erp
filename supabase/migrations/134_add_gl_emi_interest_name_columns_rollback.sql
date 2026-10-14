-- 134_add_gl_emi_interest_name_columns_rollback.sql

BEGIN;

ALTER TABLE public."CompanySettings"
  DROP COLUMN IF EXISTS gl_unearned_emi_interest_name,
  DROP COLUMN IF EXISTS gl_emi_interest_income_name;

COMMIT;
