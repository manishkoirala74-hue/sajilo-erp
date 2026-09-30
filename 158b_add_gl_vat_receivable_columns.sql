-- 158b_add_gl_vat_receivable_columns.sql
-- Adds the missing gl_vat_receivable columns to CompanySettings.
-- These were referenced in GLAccountSettings.jsx but never added to the schema.
-- Roll Forward: adds two nullable text columns. No existing data is affected.

BEGIN;

ALTER TABLE public."CompanySettings"
  ADD COLUMN IF NOT EXISTS gl_vat_receivable_id   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gl_vat_receivable_name TEXT DEFAULT NULL;

COMMIT;
