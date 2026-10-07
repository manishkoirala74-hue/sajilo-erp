-- =============================================================================
-- Migration Rollback : 214_hr_attendance_bulk_upload_and_payroll_sync_rollback.sql
-- Project   : Sajilo ERP
-- =============================================================================

DROP FUNCTION IF EXISTS public.post_payroll_run(UUID);
DROP FUNCTION IF EXISTS public.process_payroll_run(UUID, DATE, DATE, TEXT, TEXT, INTEGER, INTEGER);

DROP TRIGGER IF EXISTS trg_attendance_payroll_lock ON "AttendanceRecord";
DROP FUNCTION IF EXISTS public.check_attendance_payroll_lock();

ALTER TABLE "PayrollRun" DROP CONSTRAINT IF EXISTS no_overlapping_posted_runs;

DROP FUNCTION IF EXISTS public.rpc_bulk_upsert_attendance(UUID, TEXT, TEXT, JSONB);
DROP TABLE IF EXISTS "AttendanceImportLog" CASCADE;
