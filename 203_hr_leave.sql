-- =============================================================================
-- Migration   : 203_hr_leave.sql
-- Project     : Sajilo ERP — HR Module v6
-- Author      : Sajilo ERP Migration Engineer
-- Date        : 2026-09-26
-- Description : Full leave management schema.
--               Creates:
--                 1. Helper function  : get_fiscal_year_for_date
--                 2. Table            : LeavePolicy
--                 3. Table            : LeaveLedger
--                 4. Table            : LeaveRequest
--                 5. RPC function     : rpc_approve_leave  (v6 — server-side FY
--                                       derivation, advisory lock, attendance sync)
--                 6. RPC function     : rpc_accrue_leave   (basic annual accrual)
--
-- Rollback    : 203_hr_leave_rollback.sql
-- Dependencies: "Employee", "FiscalYear", "AttendanceRecord" tables must exist.
--               AttendanceRecord must have a leave_request_id UUID column and
--               a UNIQUE constraint on (employee_id, attendance_date).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extension guard (uuid_generate_v4 requires pgcrypto / uuid-ossp)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ===========================================================================
-- 1. HELPER FUNCTION: get_fiscal_year_for_date
--    Looks up the active FiscalYear row for a given company and date.
--    Falls back to the calendar year string when no matching FY row exists.
--    STABLE — safe for use inside read-only and read-write transactions alike.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_fiscal_year_for_date(
    p_company_id UUID,
    p_date       DATE
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_fy RECORD;
BEGIN
    -- Look up the active FiscalYear record for the given date and company.
    SELECT * INTO v_fy
    FROM "FiscalYear"
    WHERE company_id = p_company_id
      AND start_date <= p_date
      AND end_date   >= p_date
    LIMIT 1;

    IF NOT FOUND THEN
        -- Fallback: derive from calendar year.
        -- Adjust this expression if your BS fiscal runs mid-April to mid-April.
        RETURN TO_CHAR(p_date, 'YYYY');
    END IF;

    -- Returns a human-readable label, e.g. '2081-82' or '2024-25'.
    RETURN v_fy.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_fiscal_year_for_date(UUID, DATE) TO authenticated;


-- ===========================================================================
-- 2. TABLE: LeavePolicy
--    One row per leave type per company.  Defines accrual rules.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "LeavePolicy" (
    id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id        UUID        NOT NULL,
    leave_type        TEXT        NOT NULL,         -- e.g. 'Annual','Sick','Maternity'
    display_name      TEXT,                          -- human-readable label
    annual_accrual    NUMERIC     NOT NULL DEFAULT 0,
    max_carry_forward NUMERIC              DEFAULT 0,
    is_paid           BOOLEAN              DEFAULT TRUE,
    created_at        TIMESTAMPTZ          DEFAULT NOW(),
    updated_at        TIMESTAMPTZ          DEFAULT NOW()
);

-- Prevent duplicate leave types within the same company.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leavepolicy_company_type
    ON "LeavePolicy" (company_id, leave_type);

-- ---------------------------------------------------------------------------
-- RLS: LeavePolicy
--   • Regular authenticated users see only their company's policies.
--   • Admins (role claim 'admin') may read and write all rows.
-- ---------------------------------------------------------------------------
ALTER TABLE "LeavePolicy" ENABLE ROW LEVEL SECURITY;

-- Drop and recreate to ensure idempotency on re-runs.
DROP POLICY IF EXISTS "LeavePolicy: tenant isolation"       ON "LeavePolicy";
DROP POLICY IF EXISTS "LeavePolicy: admin override (read)"  ON "LeavePolicy";
DROP POLICY IF EXISTS "LeavePolicy: admin override (write)" ON "LeavePolicy";

-- Tenant-scoped read/write for regular users.
CREATE POLICY "LeavePolicy: tenant isolation"
    ON "LeavePolicy"
    FOR ALL
    USING (
        company_id = (current_setting('app.current_company_id', TRUE))::UUID
    )
    WITH CHECK (
        company_id = (current_setting('app.current_company_id', TRUE))::UUID
    );

-- Admin read override.
CREATE POLICY "LeavePolicy: admin override (read)"
    ON "LeavePolicy"
    FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'admin'
    );

-- Admin write override.
CREATE POLICY "LeavePolicy: admin override (write)"
    ON "LeavePolicy"
    FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'admin'
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'admin'
    );


-- ===========================================================================
-- 3. TABLE: LeaveLedger
--    Immutable double-entry ledger for all leave movements.
--    Positive days = credit; negative days = debit.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "LeaveLedger" (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id       UUID        NOT NULL,
    employee_id      UUID        NOT NULL
                                 REFERENCES "Employee"(id) ON DELETE CASCADE,
    leave_type       TEXT        NOT NULL,
    -- Valid transaction_type values:
    --   'Accrual'        — annual or pro-rated credit
    --   'Consumption'    — approved leave debit
    --   'Adjustment'     — manual HR correction
    --   'Carry-Forward'  — balance moved from prior FY
    --   'Expiry'         — lapsed balance at FY close
    transaction_type TEXT        NOT NULL,
    days             NUMERIC     NOT NULL,   -- positive = credit, negative = debit
    reference_id     UUID,                   -- FK to LeaveRequest.id where applicable
    fiscal_year      TEXT        NOT NULL,   -- e.g. '2081-82'
    remarks          TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    created_by       TEXT                    -- user identifier (email / UUID string)
);

-- Index for fast balance queries per employee / leave type / FY.
CREATE INDEX IF NOT EXISTS idx_lleadger_emp_type_fy
    ON "LeaveLedger" (employee_id, leave_type, fiscal_year);

-- ---------------------------------------------------------------------------
-- RLS: LeaveLedger
-- ---------------------------------------------------------------------------
ALTER TABLE "LeaveLedger" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "LeaveLedger: tenant isolation"       ON "LeaveLedger";
DROP POLICY IF EXISTS "LeaveLedger: admin override (read)"  ON "LeaveLedger";
DROP POLICY IF EXISTS "LeaveLedger: admin override (write)" ON "LeaveLedger";

CREATE POLICY "LeaveLedger: tenant isolation"
    ON "LeaveLedger"
    FOR ALL
    USING (
        company_id = (current_setting('app.current_company_id', TRUE))::UUID
    )
    WITH CHECK (
        company_id = (current_setting('app.current_company_id', TRUE))::UUID
    );

CREATE POLICY "LeaveLedger: admin override (read)"
    ON "LeaveLedger"
    FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'admin'
    );

CREATE POLICY "LeaveLedger: admin override (write)"
    ON "LeaveLedger"
    FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'admin'
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'admin'
    );


-- ===========================================================================
-- 4. TABLE: LeaveRequest
--    Tracks employee leave applications and their approval lifecycle.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS "LeaveRequest" (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID        NOT NULL,
    employee_id     UUID        NOT NULL
                                REFERENCES "Employee"(id) ON DELETE CASCADE,
    leave_type      TEXT        NOT NULL,
    from_date       DATE        NOT NULL,
    to_date         DATE        NOT NULL,
    days            NUMERIC     NOT NULL,
    reason          TEXT,
    -- Valid status values: 'Pending', 'Approved', 'Rejected', 'Cancelled'
    status          TEXT        NOT NULL DEFAULT 'Pending',
    approved_by     UUID,                  -- FK to Employee.id (approver)
    approved_at     TIMESTAMPTZ,
    rejected_reason TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_leaverequest_dates   CHECK (to_date >= from_date),
    CONSTRAINT chk_leaverequest_days    CHECK (days > 0),
    CONSTRAINT chk_leaverequest_status  CHECK (status IN ('Pending','Approved','Rejected','Cancelled'))
);

-- Index for fast lookups by employee and status.
CREATE INDEX IF NOT EXISTS idx_leaverequest_emp_status
    ON "LeaveRequest" (employee_id, status);

-- Index for date-range queries (payroll period checks).
CREATE INDEX IF NOT EXISTS idx_leaverequest_dates
    ON "LeaveRequest" (company_id, from_date, to_date);

-- ---------------------------------------------------------------------------
-- RLS: LeaveRequest
-- ---------------------------------------------------------------------------
ALTER TABLE "LeaveRequest" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "LeaveRequest: tenant isolation"       ON "LeaveRequest";
DROP POLICY IF EXISTS "LeaveRequest: admin override (read)"  ON "LeaveRequest";
DROP POLICY IF EXISTS "LeaveRequest: admin override (write)" ON "LeaveRequest";

CREATE POLICY "LeaveRequest: tenant isolation"
    ON "LeaveRequest"
    FOR ALL
    USING (
        company_id = (current_setting('app.current_company_id', TRUE))::UUID
    )
    WITH CHECK (
        company_id = (current_setting('app.current_company_id', TRUE))::UUID
    );

CREATE POLICY "LeaveRequest: admin override (read)"
    ON "LeaveRequest"
    FOR SELECT
    USING (
        current_setting('app.current_user_role', TRUE) = 'admin'
    );

CREATE POLICY "LeaveRequest: admin override (write)"
    ON "LeaveRequest"
    FOR ALL
    USING (
        current_setting('app.current_user_role', TRUE) = 'admin'
    )
    WITH CHECK (
        current_setting('app.current_user_role', TRUE) = 'admin'
    );


-- ===========================================================================
-- 5. RPC FUNCTION: rpc_approve_leave  (v6)
--
--    Atomically:
--      a) Locks the LeaveRequest row (prevents double-processing).
--      b) Derives fiscal year server-side — caller cannot tamper.
--      c) Acquires an advisory lock scoped to (employee, leave_type, FY)
--         using a ':'-delimited key to avoid hash collisions.
--      d) Checks the current LeaveLedger balance for that FY.
--      e) Updates LeaveRequest status → 'Approved'.
--      f) Inserts a 'Consumption' debit row into LeaveLedger.
--      g) UPSERTs one AttendanceRecord row per calendar day of the leave span.
--         NOTE: Weekends are included; the payroll bridge is responsible for
--         filtering non-working days when calculating pay deductions.
--
--    Parameters:
--      p_request_id  — UUID of the LeaveRequest to approve.
--      p_approved_by — UUID of the approving user (stored in LeaveRequest).
--
--    Returns: TRUE on success; raises EXCEPTION on any failure.
-- ===========================================================================
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
    -- -----------------------------------------------------------------------
    -- Step 1: Lock the specific request row to prevent duplicate processing.
    -- -----------------------------------------------------------------------
    SELECT * INTO v_req
    FROM "LeaveRequest"
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'LeaveRequest % not found.', p_request_id;
    END IF;

    IF v_req.status != 'Pending' THEN
        RAISE EXCEPTION 'LeaveRequest % cannot be approved — current status is ''%''.',
            p_request_id, v_req.status;
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 2: Derive fiscal year server-side (tamper-proof).
    -- -----------------------------------------------------------------------
    SELECT public.get_fiscal_year_for_date(v_req.company_id, v_req.from_date)
    INTO v_fiscal_year;

    -- -----------------------------------------------------------------------
    -- Step 3: Advisory lock — serializes concurrent approvals for the same
    -- employee / leave_type / fiscal_year triple.
    -- The ':' delimiter prevents hash collisions caused by concatenation
    -- ambiguity (e.g. employee_id 'AB' + type 'CD' ≠ 'A' + 'BCD').
    -- pg_advisory_xact_lock is automatically released at transaction end.
    -- -----------------------------------------------------------------------
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            v_req.employee_id::TEXT || ':' || v_req.leave_type || ':' || v_fiscal_year,
            0
        )
    );

    -- -----------------------------------------------------------------------
    -- Step 4: Balance check — sum all ledger movements for this FY.
    -- -----------------------------------------------------------------------
    SELECT COALESCE(SUM(days), 0) INTO v_current_balance
    FROM "LeaveLedger"
    WHERE employee_id = v_req.employee_id
      AND leave_type  = v_req.leave_type
      AND fiscal_year = v_fiscal_year;

    IF v_current_balance < v_req.days THEN
        RAISE EXCEPTION
            'Insufficient leave balance for FY %. Current balance: %, Requested: %.',
            v_fiscal_year, v_current_balance, v_req.days;
    END IF;

    -- -----------------------------------------------------------------------
    -- Step 5: Mark the request as Approved.
    -- -----------------------------------------------------------------------
    UPDATE "LeaveRequest"
    SET
        status      = 'Approved',
        approved_by = p_approved_by,
        approved_at = NOW()
    WHERE id = p_request_id;

    -- -----------------------------------------------------------------------
    -- Step 6: Post a Consumption debit to the LeaveLedger.
    -- days is stored as a negative value to represent a debit movement.
    -- -----------------------------------------------------------------------
    INSERT INTO "LeaveLedger" (
        company_id,
        employee_id,
        leave_type,
        transaction_type,
        days,
        reference_id,
        fiscal_year,
        remarks
    )
    VALUES (
        v_req.company_id,
        v_req.employee_id,
        v_req.leave_type,
        'Consumption',
        -v_req.days,    -- negative = debit
        p_request_id,
        v_fiscal_year,
        'Leave Approved'
    );

    -- -----------------------------------------------------------------------
    -- Step 7: Auto-sync AttendanceRecord for every calendar day of the span.
    -- Uses leave_request_id (not remarks) so attendance records can be
    -- unambiguously traced back to this approval.
    -- ON CONFLICT: updates existing rows (e.g. if previously marked Absent).
    -- -----------------------------------------------------------------------
    FOR v_date IN
        SELECT d::DATE
        FROM generate_series(v_req.from_date, v_req.to_date, '1 day'::INTERVAL) d
    LOOP
        INSERT INTO "AttendanceRecord" (
            company_id,
            employee_id,
            attendance_date,
            status,
            leave_request_id
        )
        VALUES (
            v_req.company_id,
            v_req.employee_id,
            v_date,
            'Approved Leave',
            p_request_id
        )
        ON CONFLICT (employee_id, attendance_date)
        DO UPDATE SET
            status           = 'Approved Leave',
            leave_request_id = EXCLUDED.leave_request_id;
    END LOOP;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_approve_leave(UUID, UUID) TO authenticated;


-- ===========================================================================
-- 6. RPC FUNCTION: rpc_accrue_leave
--
--    Credits all active employees with their full annual_accrual for the
--    given company and fiscal year.  The INSERT is guarded by an EXISTS
--    check so the function is safe to call multiple times (idempotent).
--
--    Deferred items (v6 plan item 5):
--      • Pro-rating for mid-year hires.
--      • max_carry_forward cap enforcement.
--    Both will be added in a subsequent migration.
--
--    Parameters:
--      p_company_id  — UUID of the company to process.
--      p_fiscal_year — Fiscal year label, e.g. '2081-82'.
--
--    Returns: Count of LeaveLedger rows inserted.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.rpc_accrue_leave(
    p_company_id  UUID,
    p_fiscal_year TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_emp    RECORD;
    v_policy RECORD;
    v_count  INTEGER := 0;
BEGIN
    -- NOTE: Pro-rating for mid-year hires and max_carry_forward cap are
    -- deferred (v6 plan item 5).  This version credits all active employees
    -- the full annual_accrual unconditionally.

    -- Loop over all active employees for the given company.
    FOR v_emp IN
        SELECT id, company_id
        FROM "Employee"
        WHERE company_id      = p_company_id
          AND employment_status IN ('Probation', 'Permanent')
    LOOP
        -- Loop over every LeavePolicy defined for this company.
        FOR v_policy IN
            SELECT *
            FROM "LeavePolicy"
            WHERE company_id = p_company_id
        LOOP
            -- Only insert if no Accrual row already exists for this
            -- employee / leave_type / fiscal_year combination.
            IF NOT EXISTS (
                SELECT 1
                FROM "LeaveLedger"
                WHERE employee_id      = v_emp.id
                  AND leave_type       = v_policy.leave_type
                  AND fiscal_year      = p_fiscal_year
                  AND transaction_type = 'Accrual'
            ) THEN
                INSERT INTO "LeaveLedger" (
                    company_id,
                    employee_id,
                    leave_type,
                    transaction_type,
                    days,
                    fiscal_year,
                    remarks
                )
                VALUES (
                    p_company_id,
                    v_emp.id,
                    v_policy.leave_type,
                    'Accrual',
                    v_policy.annual_accrual,
                    p_fiscal_year,
                    'Annual Accrual'
                );

                v_count := v_count + 1;
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_accrue_leave(UUID, TEXT) TO authenticated;

-- =============================================================================
-- End of migration: 203_hr_leave.sql
-- =============================================================================
