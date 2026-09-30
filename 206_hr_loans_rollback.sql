-- =============================================================================
-- Rollback    : 206_hr_loans_rollback.sql
-- Module      : HR v6 – Employee Loans
-- Author      : Sajilo ERP Migration Engineer
-- Date        : 2026-09-26
-- Description : Perfectly reverses 206_hr_loans.sql.
--               Removes the EmployeeLoan table (and its dependent indexes,
--               triggers, RLS policies via CASCADE), then drops the
--               standalone helper function.
-- Forward     : 206_hr_loans.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SAFETY NOTE
-- Executing this rollback is DESTRUCTIVE and PERMANENT.
-- All loan records stored in "EmployeeLoan" will be lost.
-- Ensure a full database backup exists before proceeding in production.
-- ---------------------------------------------------------------------------

-- =============================================================================
-- 1. DROP TABLE (cascades indexes, triggers, RLS policies, FK references)
-- =============================================================================

DROP TABLE IF EXISTS "EmployeeLoan" CASCADE;

-- =============================================================================
-- 2. DROP helper function
--    (not owned by the table, so CASCADE above does not remove it)
-- =============================================================================

DROP FUNCTION IF EXISTS public.set_employee_loan_updated_at() CASCADE;

-- =============================================================================
-- End of rollback 206_hr_loans_rollback.sql
-- =============================================================================
