-- 157_expand_company_settings_schema_rollback.sql
-- Reverts changes made by 157_expand_company_settings_schema.sql
-- WARNING: Run only if 158_*, 159_*, 160_*, 161_* have been rolled back first.

BEGIN;

-- Revert REPLICA IDENTITY to default (allows PK-based replication)
ALTER TABLE public."CompanySettings" REPLICA IDENTITY DEFAULT;

-- Remove Domain 3 columns
ALTER TABLE public."CompanySettings"
  DROP COLUMN IF EXISTS session_idle_timeout_minutes,
  DROP COLUMN IF EXISTS enable_strict_audit_logging,
  DROP COLUMN IF EXISTS ip_whitelist;

-- Remove Domain 2 columns
ALTER TABLE public."CompanySettings"
  DROP COLUMN IF EXISTS enable_batch_expiry,
  DROP COLUMN IF EXISTS over_receive_tolerance_pct;

-- Remove Domain 1 columns
ALTER TABLE public."CompanySettings"
  DROP COLUMN IF EXISTS period_lock_date,
  DROP COLUMN IF EXISTS default_costing_method,
  DROP COLUMN IF EXISTS enable_multi_currency,
  DROP COLUMN IF EXISTS tax_default_behavior;

COMMIT;
