-- =============================================================================
-- Rollback     : 203_hr_leave_rollback.sql
-- Project      : Sajilo ERP — HR Module v6
-- Author       : Sajilo ERP Migration Engineer
-- Date         : 2026-09-26
-- Description  : Perfectly reverses 203_hr_leave.sql in reverse creation order.
--                Objects are dropped with IF EXISTS so the script is safe to
--                run even if a prior partial rollback was attempted.
--
--                Reverse order:
--                  1. DROP FUNCTION rpc_accrue_leave
--                  2. DROP FUNCTION rpc_approve_leave
--                  3. DROP TABLE    LeaveRequest  (CASCADE removes FKs/indexes/RLS)
--                  4. DROP TABLE    LeaveLedger   (CASCADE)
--                  5. DROP TABLE    LeavePolicy   (CASCADE)
--                  6. DROP FUNCTION get_fiscal_year_for_date
--
-- WARNING      : This script PERMANENTLY DESTROYS leave data.
--                Run only in a controlled, pre-approved rollback scenario.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop rpc_accrue_leave
--    Signature must match the GRANT EXECUTE issued in the forward migration.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_accrue_leave(UUID, TEXT);

-- ---------------------------------------------------------------------------
-- 2. Drop rpc_approve_leave
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_approve_leave(UUID, UUID);

-- ---------------------------------------------------------------------------
-- 3. Drop LeaveRequest
--    CASCADE removes:
--      • All RLS policies on the table.
--      • Indexes: idx_leaverequest_emp_status, idx_leaverequest_dates.
--      • Any foreign-key references from other tables pointing here
--        (e.g. LeaveLedger.reference_id — note: that column has no FK
--        constraint, so no cascading FK drop is needed, but the data will
--        become orphaned; the LeaveLedger drop below removes it anyway).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "LeaveRequest" CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Drop LeaveLedger
--    CASCADE removes:
--      • All RLS policies on the table.
--      • Index: idx_lleadger_emp_type_fy.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "LeaveLedger" CASCADE;

-- ---------------------------------------------------------------------------
-- 5. Drop LeavePolicy
--    CASCADE removes:
--      • All RLS policies on the table.
--      • Unique index: uq_leavepolicy_company_type.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "LeavePolicy" CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Drop get_fiscal_year_for_date
--    Dropped last because rpc_approve_leave and rpc_accrue_leave depend on it.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_fiscal_year_for_date(UUID, DATE);

-- =============================================================================
-- End of rollback: 203_hr_leave_rollback.sql
-- =============================================================================
