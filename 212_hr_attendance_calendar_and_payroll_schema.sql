-- =============================================================================
-- Migration : 212_hr_attendance_calendar_and_payroll_schema.sql
-- Project   : Sajilo ERP
-- Description:
--   Phase 0 & 1: 
--   1. Adds hr_attendance_calendar and hr_weekly_off to CompanySettings
--   2. Standardizes PayrollRun period columns (period_start, period_end)
--   3. Drops obsolete RPC rpc_calculate_payroll_batch
-- =============================================================================

-- 1. CompanySettings Additions
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "hr_attendance_calendar" TEXT DEFAULT 'BS',
  ADD COLUMN IF NOT EXISTS "hr_weekly_off" INT[] DEFAULT '{6}';

-- 2. PayrollRun Standardized Periods
ALTER TABLE "PayrollRun"
  ADD COLUMN IF NOT EXISTS "period_start" DATE,
  ADD COLUMN IF NOT EXISTS "period_end" DATE,
  ADD COLUMN IF NOT EXISTS "period_calendar" TEXT DEFAULT 'BS',
  ADD COLUMN IF NOT EXISTS "period_bs_year" INTEGER,
  ADD COLUMN IF NOT EXISTS "period_bs_month" INTEGER;

-- Backfill period_start and period_end for existing AD records
UPDATE "PayrollRun"
SET 
  period_start = MAKE_DATE(period_year, period_month, 1),
  period_end = (MAKE_DATE(period_year, period_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
  period_calendar = 'AD'
WHERE period_start IS NULL AND period_month IS NOT NULL;

-- Make them NOT NULL now that data is backfilled
ALTER TABLE "PayrollRun"
  ALTER COLUMN "period_start" SET NOT NULL,
  ALTER COLUMN "period_end" SET NOT NULL;

-- Drop legacy columns safely
ALTER TABLE "PayrollRun"
  DROP COLUMN IF EXISTS "period_month",
  DROP COLUMN IF EXISTS "period_year";

-- 3. Drop Dead RPC
DROP FUNCTION IF EXISTS public.rpc_calculate_payroll_batch(UUID, UUID, DATE, DATE);
