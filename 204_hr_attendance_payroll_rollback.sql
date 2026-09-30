-- =============================================================================
-- Rollback    : 204_hr_attendance_payroll_rollback.sql
-- Project     : Sajilo ERP
-- Module      : Human Resources v6 — Attendance & Payroll (ROLLBACK)
-- Author      : Sajilo ERP Migration Engineer
-- Date        : 2026-09-26
-- Description :
--   Exactly reverses 204_hr_attendance_payroll.sql in reverse-dependency order:
--     1. DROP the rpc_calculate_payroll_batch() function
--     2. DROP the PayrollRun table (CASCADE removes dependent objects)
--     3. DROP the AttendanceRecord table (CASCADE removes dependent objects)
--
-- WARNING: This rollback is DESTRUCTIVE. All data in AttendanceRecord and
--          PayrollRun (including PayrollRunDetail rows linked to those runs)
--          will be permanently deleted. Run only in a planned rollback window.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Step 1 : Drop the payroll calculation function
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_calculate_payroll_batch(UUID, UUID, DATE, DATE);


-- ---------------------------------------------------------------------------
-- Step 2 : Drop the PayrollRun table
--   CASCADE will also drop:
--     • Any foreign-key references from PayrollRunDetail
--     • Any dependent views or policies on this table
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "PayrollRun" CASCADE;


-- ---------------------------------------------------------------------------
-- Step 3 : Drop the AttendanceRecord table
--   CASCADE will also drop:
--     • Any foreign-key references to AttendanceRecord.id
--     • The leave_request_id FK reference from LeaveRequest remains intact
--       (it was ON DELETE SET NULL so no orphan rows exist)
--     • Any dependent views or policies on this table
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "AttendanceRecord" CASCADE;


-- =============================================================================
-- Rollback complete. 204_hr_attendance_payroll.sql has been fully reversed.
-- =============================================================================
