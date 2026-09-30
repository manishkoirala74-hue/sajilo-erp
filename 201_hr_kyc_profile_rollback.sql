-- =============================================================================
-- Rollback    : 201_hr_kyc_profile_rollback.sql
-- Rolls back  : 201_hr_kyc_profile.sql
-- Author      : Sajilo ERP Migration Engineer
-- Created     : 2026-09-26
-- Description :
--   Exactly reverses every change introduced by 201_hr_kyc_profile.sql in
--   safe, dependency-respecting order:
--     1. DROP FUNCTION  rpc_next_company_code
--     2. DROP TRIGGER   trg_employee_profile_updated_at  (on EmployeeProfile)
--     3. DROP FUNCTION  set_employee_profile_updated_at  (trigger helper)
--     4. DROP TABLE     EmployeeProfile   (cascade drops its RLS policies)
--     5. DROP COLUMNS   from Employee     (6 columns, all IF EXISTS)
--     6. DROP TABLE     CompanyCounter    (cascade drops its RLS policies)
--
--   All statements use IF EXISTS / IF NOT EXISTS to keep the script
--   idempotent – safe to re-run even if the migration was partially applied.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Drop the RPC function
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.rpc_next_company_code(UUID, TEXT);


-- ---------------------------------------------------------------------------
-- 2 & 3. Drop the EmployeeProfile updated_at trigger and its helper function
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_employee_profile_updated_at ON "EmployeeProfile";

DROP FUNCTION IF EXISTS public.set_employee_profile_updated_at();


-- ---------------------------------------------------------------------------
-- 4. Drop EmployeeProfile
--    (CASCADE automatically removes all RLS policies and the FK index.)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS "EmployeeProfile" CASCADE;


-- ---------------------------------------------------------------------------
-- 5. Remove the six columns added to Employee
-- ---------------------------------------------------------------------------

ALTER TABLE "Employee"
    DROP COLUMN IF EXISTS pf_number;

ALTER TABLE "Employee"
    DROP COLUMN IF EXISTS bank_account_holder;

ALTER TABLE "Employee"
    DROP COLUMN IF EXISTS bank_branch;

ALTER TABLE "Employee"
    DROP COLUMN IF EXISTS work_location;

-- reporting_manager_id is a self-referencing FK; dropping the column also
-- drops the implicit FK constraint.
ALTER TABLE "Employee"
    DROP COLUMN IF EXISTS reporting_manager_id;

ALTER TABLE "Employee"
    DROP COLUMN IF EXISTS employment_type;


-- ---------------------------------------------------------------------------
-- 6. Drop CompanyCounter
--    (CASCADE automatically removes all RLS policies.)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS "CompanyCounter" CASCADE;
