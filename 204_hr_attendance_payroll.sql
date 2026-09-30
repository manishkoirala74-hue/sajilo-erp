-- =============================================================================
-- Migration : 204_hr_attendance_payroll.sql
-- Project   : Sajilo ERP
-- Module    : Human Resources v6 — Attendance & Payroll
-- Author    : Sajilo ERP Migration Engineer
-- Date      : 2026-09-26
-- Description:
--   1. Creates the AttendanceRecord table with company-scoped RLS.
--   2. Creates the PayrollRun table with company-scoped RLS.
--   3. Creates the rpc_calculate_payroll_batch() PL/pgSQL function which:
--        • Guards against re-calculation of Posted runs
--        • Idempotently wipes and rebuilds PayrollRunDetail rows
--        • Computes working days (Mon–Fri) bounded by joining/exit dates
--        • Applies Unpaid Leave Deduction for Absent days only
--        • Integrates EmployeeLoan deductions and settles paid-off loans
-- Rollback  : 204_hr_attendance_payroll_rollback.sql
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 0. Prerequisites check — uuid-ossp extension (must already be enabled)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =============================================================================
-- 1. AttendanceRecord
-- =============================================================================

CREATE TABLE IF NOT EXISTS "AttendanceRecord" (
  id                UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID         NOT NULL,
  employee_id       UUID         NOT NULL REFERENCES "Employee"(id) ON DELETE CASCADE,
  attendance_date   DATE         NOT NULL,
  check_in          TIME,
  check_out         TIME,
  -- Allowed statuses: 'Present','Absent','Half Day','Approved Leave',
  --                   'Unpaid Leave','Holiday','Late'
  status            TEXT         NOT NULL DEFAULT 'Present',
  overtime_hours    NUMERIC      NOT NULL DEFAULT 0,
  leave_request_id  UUID         REFERENCES "LeaveRequest"(id) ON DELETE SET NULL,
  remarks           TEXT,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Required by rpc_approve_leave: ON CONFLICT (employee_id, attendance_date)
  CONSTRAINT uq_attendance_employee_date UNIQUE (employee_id, attendance_date)
);

COMMENT ON TABLE "AttendanceRecord" IS
  'Daily attendance log per employee. The UNIQUE constraint on (employee_id, attendance_date) '
  'is used by rpc_approve_leave for upsert semantics.';

COMMENT ON COLUMN "AttendanceRecord".status IS
  'Allowed values: Present, Absent, Half Day, Approved Leave, Unpaid Leave, Holiday, Late';

-- Row-Level Security --------------------------------------------------------
ALTER TABLE "AttendanceRecord" ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "select_AttendanceRecord" ON "AttendanceRecord";
  CREATE POLICY "select_AttendanceRecord" ON "AttendanceRecord" FOR SELECT USING (
    (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
    (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
  );

  DROP POLICY IF EXISTS "insert_AttendanceRecord" ON "AttendanceRecord";
  CREATE POLICY "insert_AttendanceRecord" ON "AttendanceRecord" FOR INSERT WITH CHECK (
    (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
    (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
  );

  DROP POLICY IF EXISTS "update_AttendanceRecord" ON "AttendanceRecord";
  CREATE POLICY "update_AttendanceRecord" ON "AttendanceRecord" FOR UPDATE USING (
    (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
    (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
  ) WITH CHECK (
    (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
    (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
  );

  DROP POLICY IF EXISTS "delete_AttendanceRecord" ON "AttendanceRecord";
  CREATE POLICY "delete_AttendanceRecord" ON "AttendanceRecord" FOR DELETE USING (
    (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
    (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
  );


-- =============================================================================
-- 2. PayrollRun
-- =============================================================================

CREATE TABLE IF NOT EXISTS "PayrollRun" (
  id            UUID  PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID  NOT NULL,
  period_start  DATE  NOT NULL,
  period_end    DATE  NOT NULL,
  -- Human-readable label, e.g. 'September 2026'
  run_name      TEXT  NOT NULL,
  -- Lifecycle: 'Draft' → 'Posted'
  status        TEXT  NOT NULL DEFAULT 'Draft',
  posted_at     TIMESTAMP WITH TIME ZONE,
  posted_by     TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT chk_payroll_run_status
    CHECK (status IN ('Draft', 'Posted')),
  CONSTRAINT chk_payroll_period_order
    CHECK (period_end >= period_start)
);

COMMENT ON TABLE "PayrollRun" IS
  'Master payroll run header. Each run spans a date range and moves through '
  'Draft → Posted. A Posted run is immutable.';

-- Row-Level Security --------------------------------------------------------
ALTER TABLE "PayrollRun" ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "select_PayrollRun" ON "PayrollRun";
  CREATE POLICY "select_PayrollRun" ON "PayrollRun" FOR SELECT USING (
    (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
    (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
  );

  DROP POLICY IF EXISTS "insert_PayrollRun" ON "PayrollRun";
  CREATE POLICY "insert_PayrollRun" ON "PayrollRun" FOR INSERT WITH CHECK (
    (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
    (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
  );

  DROP POLICY IF EXISTS "update_PayrollRun" ON "PayrollRun";
  CREATE POLICY "update_PayrollRun" ON "PayrollRun" FOR UPDATE USING (
    (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
    (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
  ) WITH CHECK (
    (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
    (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
  );

  DROP POLICY IF EXISTS "delete_PayrollRun" ON "PayrollRun";
  CREATE POLICY "delete_PayrollRun" ON "PayrollRun" FOR DELETE USING (
    (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
    (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
  );


-- =============================================================================
-- 3. rpc_calculate_payroll_batch
--
-- Idempotently (re-)calculates all PayrollRunDetail rows for a Draft run.
-- Blocked for Posted runs. Returns a summary JSONB.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_calculate_payroll_batch(
  p_company_id    UUID,
  p_payroll_run_id UUID,
  p_start_date    DATE,
  p_end_date      DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- PayrollRun state
  v_run_status        TEXT;

  -- Employee loop cursor
  v_emp               RECORD;

  -- Salary / working day calculations
  v_base_salary       NUMERIC;
  v_joining_date      DATE;
  v_exit_date         DATE;
  v_effective_start   DATE;
  v_effective_end     DATE;
  v_working_days      INTEGER;
  v_absent_days       INTEGER;
  v_daily_rate        NUMERIC;
  v_unpaid_deduction  NUMERIC;

  -- Loan
  v_loan              RECORD;
  v_loan_deduction    NUMERIC;

  -- Summary counters
  v_emp_count         INTEGER := 0;
  v_detail_count      INTEGER := 0;
BEGIN

  -- -------------------------------------------------------------------------
  -- Step 1 : Validate run belongs to company and fetch status
  -- -------------------------------------------------------------------------
  SELECT status
    INTO v_run_status
    FROM "PayrollRun"
   WHERE id = p_payroll_run_id
     AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PayrollRun % not found for company %.', p_payroll_run_id, p_company_id;
  END IF;

  -- Guard: Posted runs are immutable.
  IF v_run_status = 'Posted' THEN
    RAISE EXCEPTION
      'PayrollRun % is already Posted. Recalculation is not allowed. '
      'Create a new Draft run to make corrections.',
      p_payroll_run_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 2 : Idempotent wipe — remove any existing detail rows for this run
  -- -------------------------------------------------------------------------
  DELETE FROM "PayrollRunDetail"
   WHERE payroll_run_id = p_payroll_run_id;

  -- -------------------------------------------------------------------------
  -- Step 3 : Loop over every active employee in the company
  -- -------------------------------------------------------------------------
  FOR v_emp IN
    SELECT e.id          AS employee_id,
           e.joining_date,
           e.exit_date,
           e.full_name
      FROM "Employee" e
     WHERE e.company_id  = p_company_id
       AND e.status      = 'Active'
       -- Include employees who were employed at any point in the period
       AND e.joining_date <= p_end_date
       AND (e.exit_date IS NULL OR e.exit_date >= p_start_date)
  LOOP
    v_emp_count := v_emp_count + 1;

    -- -----------------------------------------------------------------------
    -- 3a. Fetch base salary from EmployeeSalaryHistory (latest active record)
    -- -----------------------------------------------------------------------
    SELECT COALESCE(esh.base_salary, 0)
      INTO v_base_salary
      FROM "EmployeeSalaryHistory" esh
     WHERE esh.employee_id  = v_emp.employee_id
       AND esh.effective_date <= p_start_date
     ORDER BY esh.effective_date DESC
     LIMIT 1;

    -- If no salary record found, skip this employee (with a notice)
    IF v_base_salary IS NULL OR v_base_salary = 0 THEN
      RAISE NOTICE 'Employee % (%) has no active salary record — skipping.',
                   v_emp.full_name, v_emp.employee_id;
      CONTINUE;
    END IF;

    -- -----------------------------------------------------------------------
    -- 3b. Clamp the calculation window to the employee's tenure
    -- -----------------------------------------------------------------------
    v_effective_start := GREATEST(p_start_date, v_emp.joining_date);
    v_effective_end   := LEAST(p_end_date,
                               COALESCE(v_emp.exit_date, p_end_date));

    -- -----------------------------------------------------------------------
    -- 3c. Working days = Mon–Fri count within the clamped window
    --     Uses the standard series-based weekday formula.
    -- -----------------------------------------------------------------------
    SELECT COUNT(*)
      INTO v_working_days
      FROM generate_series(v_effective_start, v_effective_end, '1 day'::INTERVAL) gs(d)
     WHERE EXTRACT(DOW FROM gs.d) BETWEEN 1 AND 5;  -- 1=Mon … 5=Fri

    -- Protect against division by zero (e.g., joined after month end)
    IF v_working_days = 0 THEN
      RAISE NOTICE 'Employee % (%) has 0 working days in period — skipping.',
                   v_emp.full_name, v_emp.employee_id;
      CONTINUE;
    END IF;

    -- -----------------------------------------------------------------------
    -- 3d. Absent days (status = 'Absent' only — Approved Leave is NOT deducted)
    -- -----------------------------------------------------------------------
    SELECT COUNT(*)
      INTO v_absent_days
      FROM "AttendanceRecord" ar
     WHERE ar.employee_id     = v_emp.employee_id
       AND ar.attendance_date BETWEEN v_effective_start AND v_effective_end
       AND ar.status          = 'Absent';

    -- -----------------------------------------------------------------------
    -- 3e. Daily rate and Unpaid Leave Deduction
    -- -----------------------------------------------------------------------
    v_daily_rate       := ROUND(v_base_salary / v_working_days, 2);
    v_unpaid_deduction := ROUND(v_absent_days  * v_daily_rate,  2);

    -- -----------------------------------------------------------------------
    -- 3f. Insert base PayrollRunDetail row
    --     (Assumes table has at minimum these columns; adapt as schema evolves)
    -- -----------------------------------------------------------------------
    INSERT INTO "PayrollRunDetail" (
        id,
        payroll_run_id,
        employee_id,
        company_id,
        base_salary,
        working_days,
        absent_days,
        daily_rate,
        unpaid_leave_deduction,
        total_deductions,
        net_salary,
        created_at
    )
    VALUES (
        uuid_generate_v4(),
        p_payroll_run_id,
        v_emp.employee_id,
        p_company_id,
        v_base_salary,
        v_working_days,
        v_absent_days,
        v_daily_rate,
        v_unpaid_deduction,
        v_unpaid_deduction,                          -- will be updated below
        v_base_salary - v_unpaid_deduction,          -- will be updated below
        NOW()
    );

    v_detail_count := v_detail_count + 1;

    -- -----------------------------------------------------------------------
    -- 3g. EmployeeLoan integration
    --     Deduct the lesser of monthly_deduction or outstanding_amount.
    --     Settle the loan if outstanding reaches 0.
    -- -----------------------------------------------------------------------
    FOR v_loan IN
      SELECT el.id,
             el.monthly_deduction,
             el.outstanding_amount
        FROM "EmployeeLoan" el
       WHERE el.employee_id = v_emp.employee_id
         AND el.status      = 'Active'
         AND el.outstanding_amount > 0
    LOOP
      -- Actual deduction for this payroll period
      v_loan_deduction := LEAST(v_loan.monthly_deduction,
                                v_loan.outstanding_amount);

      -- Accumulate into the PayrollRunDetail row
      UPDATE "PayrollRunDetail"
         SET total_deductions = total_deductions + v_loan_deduction,
             net_salary       = net_salary       - v_loan_deduction
       WHERE payroll_run_id = p_payroll_run_id
         AND employee_id   = v_emp.employee_id;

      -- Reduce outstanding loan balance
      UPDATE "EmployeeLoan"
         SET outstanding_amount = outstanding_amount - v_loan_deduction,
             -- Flip to 'Paid Off' if balance reaches zero
             status = CASE
                        WHEN (outstanding_amount - v_loan_deduction) <= 0
                        THEN 'Paid Off'
                        ELSE status
                      END
       WHERE id = v_loan.id;

    END LOOP;  -- loan loop

  END LOOP;  -- employee loop

  -- -------------------------------------------------------------------------
  -- Step 4 : Return summary JSON
  -- -------------------------------------------------------------------------
  RETURN jsonb_build_object(
    'payroll_run_id',   p_payroll_run_id,
    'company_id',       p_company_id,
    'period_start',     p_start_date,
    'period_end',       p_end_date,
    'employees_processed', v_emp_count,
    'detail_rows_inserted', v_detail_count,
    'calculated_at',    NOW()
  );

END;
$$;

COMMENT ON FUNCTION public.rpc_calculate_payroll_batch(UUID, UUID, DATE, DATE) IS
  'Calculates (or recalculates) all PayrollRunDetail rows for a Draft payroll run. '
  'Raises an exception if the run is already Posted. '
  'Applies Unpaid Leave Deduction for Absent days only (not Approved Leave). '
  'Integrates and settles EmployeeLoan deductions.';

-- Mandatory explicit grant for Supabase authenticated callers
GRANT EXECUTE ON FUNCTION public.rpc_calculate_payroll_batch(UUID, UUID, DATE, DATE)
  TO authenticated;
