-- =============================================================================
-- Migration : 213_hr_attendance_daily_entry_schema.sql
-- Project   : Sajilo ERP
-- Description:
--   Phase 2: Manual Daily Entry Schema
--   1. Adds shift settings to CompanySettings.
--   2. Adds source, worked_hours, import_batch_id to AttendanceRecord.
--   3. Updates rpc_approve_leave to inject source='Leave Sync'.
-- =============================================================================

-- 1. CompanySettings Additions
ALTER TABLE "CompanySettings"
  ADD COLUMN IF NOT EXISTS "hr_shift_start" TIME DEFAULT '10:00:00',
  ADD COLUMN IF NOT EXISTS "hr_grace_minutes" INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "hr_full_day_hours" NUMERIC DEFAULT 8.0,
  ADD COLUMN IF NOT EXISTS "hr_half_day_hours" NUMERIC DEFAULT 4.0;

-- 2. AttendanceRecord Additions
ALTER TABLE "AttendanceRecord"
  ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'Manual',
  ADD COLUMN IF NOT EXISTS "worked_hours" NUMERIC,
  ADD COLUMN IF NOT EXISTS "import_batch_id" UUID;

-- 3. Update rpc_approve_leave
CREATE OR REPLACE FUNCTION public.rpc_approve_leave(
    p_request_id  UUID,
    p_approved_by UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_req             RECORD;
    v_current_balance NUMERIC;
    v_fiscal_year     TEXT;
    v_date            DATE;
BEGIN
    SELECT * INTO v_req FROM "LeaveRequest" WHERE id = p_request_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'LeaveRequest % not found.', p_request_id;
    END IF;

    IF v_req.status != 'Pending' THEN
        RAISE EXCEPTION 'LeaveRequest % cannot be approved — current status is ''%''.', p_request_id, v_req.status;
    END IF;

    SELECT public.get_fiscal_year_for_date(v_req.company_id, v_req.from_date) INTO v_fiscal_year;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_req.employee_id::TEXT || ':' || v_req.leave_type || ':' || v_fiscal_year, 0)
    );

    SELECT COALESCE(SUM(days), 0) INTO v_current_balance
    FROM "LeaveLedger"
    WHERE employee_id = v_req.employee_id
      AND leave_type  = v_req.leave_type
      AND fiscal_year = v_fiscal_year;

    IF v_current_balance < v_req.days THEN
        RAISE EXCEPTION 'Insufficient leave balance for FY %. Current balance: %, Requested: %.', v_fiscal_year, v_current_balance, v_req.days;
    END IF;

    UPDATE "LeaveRequest"
    SET
        status      = 'Approved',
        approved_by = p_approved_by,
        approved_at = NOW()
    WHERE id = p_request_id;

    INSERT INTO "LeaveLedger" (
        company_id, employee_id, leave_type, transaction_type, days, reference_id, fiscal_year, remarks
    ) VALUES (
        v_req.company_id, v_req.employee_id, v_req.leave_type, 'Consumption', -v_req.days, p_request_id, v_fiscal_year, 'Leave Approved'
    );

    FOR v_date IN
        SELECT d::DATE FROM generate_series(v_req.from_date, v_req.to_date, '1 day'::INTERVAL) d
    LOOP
        INSERT INTO "AttendanceRecord" (
            company_id, employee_id, attendance_date, status, leave_request_id, source
        ) VALUES (
            v_req.company_id, v_req.employee_id, v_date, 'Approved Leave', p_request_id, 'Leave Sync'
        )
        ON CONFLICT (employee_id, attendance_date)
        DO UPDATE SET
            status           = 'Approved Leave',
            leave_request_id = EXCLUDED.leave_request_id,
            source           = 'Leave Sync';
    END LOOP;

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rpc_approve_leave(UUID, UUID) TO authenticated;
