-- =============================================================================
-- Migration  : 205_hr_salary_history.sql
-- Module     : HR – Salary History (SCD Type 2)
-- Author     : Sajilo ERP Migration Engineer
-- Date       : 2026-09-26
-- Description:
--   Introduces a full salary-history ledger for every employee using a
--   Slowly Changing Dimension (SCD) Type 2 pattern.
--
--   Changes in this file:
--     1. Enable btree_gist extension (required for the daterange EXCLUDE).
--     2. Create "EmployeeSalaryHistory" table with a daterange exclusion
--        constraint that prevents overlapping active salary rows.
--     3. Enable Row-Level Security (company_id scoped) mirroring the
--        Employee table RLS policy pattern.
--     4. Backfill: seed one history row per existing Employee who already
--        carries salary_components but has no history row yet.
--     5. Create public.rpc_update_salary() – an atomic SCD-2 update function
--        that closes the current active row and opens a new one, with a
--        built-in backdating guard.
--
--   Rollback : 205_hr_salary_history_rollback.sql
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. EXTENSION: btree_gist
--    Required to index a UUID column and a daterange column together inside
--    the EXCLUDE constraint on "EmployeeSalaryHistory".
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;


-- ---------------------------------------------------------------------------
-- 2. TABLE: EmployeeSalaryHistory
--
--   Design notes:
--     • salary_components mirrors the JSONB schema already used on Employee:
--         { "earnings": [...], "deductions": [...] }
--     • effective_to = NULL means the row is the currently active salary.
--     • The EXCLUDE constraint uses a closed daterange '[effective_from,
--       COALESCE(effective_to, infinity)]' so no two rows for the same
--       employee can share even a single overlapping day.
--     • company_id is denormalised here (copied from Employee) so that
--       RLS can filter rows efficiently without joining Employee every time.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "EmployeeSalaryHistory" (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID        NOT NULL,
  employee_id       UUID        NOT NULL
                                REFERENCES "Employee"(id) ON DELETE CASCADE,
  salary_components JSONB       NOT NULL
                                DEFAULT '{"earnings":[],"deductions":[]}',
  effective_from    DATE        NOT NULL,
  effective_to      DATE,                      -- NULL = currently active row
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  change_reason     TEXT,                      -- e.g. 'Annual Increment', 'Promotion', 'Correction'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT,

  -- Prevents two rows for the same employee from covering overlapping date
  -- ranges.  The closed interval '[]' means both endpoints are inclusive,
  -- and 'infinity' stands in for an open-ended (currently active) row.
  CONSTRAINT no_overlapping_salaries EXCLUDE USING gist (
    employee_id  WITH =,
    daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  )
);

-- Useful supporting indexes
CREATE INDEX IF NOT EXISTS idx_esh_employee_id
  ON "EmployeeSalaryHistory" (employee_id);

CREATE INDEX IF NOT EXISTS idx_esh_company_id
  ON "EmployeeSalaryHistory" (company_id);

CREATE INDEX IF NOT EXISTS idx_esh_active
  ON "EmployeeSalaryHistory" (employee_id, is_active)
  WHERE is_active = TRUE;


-- ---------------------------------------------------------------------------
-- 3. ROW-LEVEL SECURITY on EmployeeSalaryHistory
--
--   Policy mirrors the Employee table pattern:
--     • Tenant users see only rows that belong to their company_id.
--     • A superuser / service-role bypasses RLS entirely (Supabase default).
--     • An "admin" check is included via the helper used elsewhere in the
--       codebase: auth.jwt() ->> 'role' = 'admin' grants full-table access
--       within the company.
-- ---------------------------------------------------------------------------
ALTER TABLE "EmployeeSalaryHistory" ENABLE ROW LEVEL SECURITY;

-- Drop policies first so the script is idempotent on re-run after a failed
-- partial migration.
DROP POLICY IF EXISTS "EmployeeSalaryHistory_company_select" ON "EmployeeSalaryHistory";
DROP POLICY IF EXISTS "EmployeeSalaryHistory_company_insert" ON "EmployeeSalaryHistory";
DROP POLICY IF EXISTS "EmployeeSalaryHistory_company_update" ON "EmployeeSalaryHistory";
DROP POLICY IF EXISTS "EmployeeSalaryHistory_company_delete" ON "EmployeeSalaryHistory";

-- SELECT: any authenticated user whose JWT company_id matches the row
CREATE POLICY "EmployeeSalaryHistory_company_select"
  ON "EmployeeSalaryHistory"
  FOR SELECT
  TO authenticated
  USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
  );

-- INSERT: restricted to admins within the same company
CREATE POLICY "EmployeeSalaryHistory_company_insert"
  ON "EmployeeSalaryHistory"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

-- UPDATE: restricted to admins within the same company
CREATE POLICY "EmployeeSalaryHistory_company_update"
  ON "EmployeeSalaryHistory"
  FOR UPDATE
  TO authenticated
  USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  )
  WITH CHECK (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );

-- DELETE: restricted to admins within the same company
CREATE POLICY "EmployeeSalaryHistory_company_delete"
  ON "EmployeeSalaryHistory"
  FOR DELETE
  TO authenticated
  USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'admin'
  );


-- ---------------------------------------------------------------------------
-- 4. BACKFILL: seed one history row per existing Employee
--
--   Conditions:
--     • The Employee must have a salary_components value (or we default to
--       the empty components object).
--     • No existing row in EmployeeSalaryHistory for that employee yet.
--   The effective_from is set to the employee's joining_date when available,
--   otherwise TODAY is used as a safe fallback.
-- ---------------------------------------------------------------------------
INSERT INTO "EmployeeSalaryHistory" (
  company_id,
  employee_id,
  salary_components,
  effective_from,
  is_active,
  change_reason,
  created_by
)
SELECT
  e.company_id,
  e.id,
  COALESCE(e.salary_components, '{"earnings":[],"deductions":[]}')::jsonb,
  COALESCE(e.joining_date::date, CURRENT_DATE),
  TRUE,
  'Migrated from Employee.salary_components',
  'migration:205_hr_salary_history'
FROM "Employee" e
WHERE NOT EXISTS (
  SELECT 1
  FROM   "EmployeeSalaryHistory" h
  WHERE  h.employee_id = e.id
);


-- ---------------------------------------------------------------------------
-- 5. FUNCTION: public.rpc_update_salary
--
--   Atomic SCD Type 2 update.  All three DML statements (close current row,
--   open new row) run inside the same transaction; the exclusion constraint
--   provides a final safety net against race conditions.
--
--   Parameters:
--     p_employee_id   – target employee UUID
--     p_components    – new salary JSONB  { "earnings":[...], "deductions":[...] }
--     p_effective_from – the date the new salary takes effect
--     p_change_reason – free-text audit note (optional)
--
--   Returns: UUID of the newly inserted EmployeeSalaryHistory row.
--
--   Error conditions:
--     • Raises an exception if p_effective_from is on or before the start
--       date of the currently active row (backdating guard).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rpc_update_salary(
  p_employee_id    UUID,
  p_components     JSONB,
  p_effective_from DATE,
  p_change_reason  TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER                         -- runs as the migration owner to bypass RLS
SET search_path = public
AS $$
DECLARE
  v_new_id       UUID;
  v_current_from DATE;
  v_company_id   UUID;
BEGIN
  -- ------------------------------------------------------------------
  -- Fetch the current active salary row's start date (if one exists).
  -- ------------------------------------------------------------------
  SELECT effective_from
  INTO   v_current_from
  FROM   "EmployeeSalaryHistory"
  WHERE  employee_id = p_employee_id
    AND  is_active   = TRUE
  LIMIT  1;                              -- at most one active row guaranteed by EXCLUDE

  -- ------------------------------------------------------------------
  -- Backdating guard: the new effective date must be strictly after the
  -- current active row's start date to preserve an append-only ledger.
  -- ------------------------------------------------------------------
  IF FOUND AND p_effective_from <= v_current_from THEN
    RAISE EXCEPTION
      'New effective date (%) must be strictly after the current active row start date (%).',
      p_effective_from, v_current_from
      USING ERRCODE = 'P0001';
  END IF;

  -- ------------------------------------------------------------------
  -- Resolve company_id from Employee (needed to satisfy RLS on INSERT).
  -- ------------------------------------------------------------------
  SELECT company_id
  INTO   v_company_id
  FROM   "Employee"
  WHERE  id = p_employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee with id % not found.', p_employee_id
      USING ERRCODE = 'P0002';
  END IF;

  -- ------------------------------------------------------------------
  -- Close the current active row: set effective_to to one day before
  -- the new row starts, and mark it inactive.
  -- ------------------------------------------------------------------
  UPDATE "EmployeeSalaryHistory"
  SET    effective_to = p_effective_from - INTERVAL '1 day',
         is_active    = FALSE
  WHERE  employee_id  = p_employee_id
    AND  is_active    = TRUE;

  -- ------------------------------------------------------------------
  -- Open the new active row.
  -- ------------------------------------------------------------------
  INSERT INTO "EmployeeSalaryHistory" (
    company_id,
    employee_id,
    salary_components,
    effective_from,
    is_active,
    change_reason,
    created_by
  )
  VALUES (
    v_company_id,
    p_employee_id,
    p_components,
    p_effective_from,
    TRUE,
    p_change_reason,
    auth.uid()::text          -- record the Supabase user who triggered the change
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Mandatory RPC grant so the authenticated role can call this function.
GRANT EXECUTE ON FUNCTION public.rpc_update_salary(UUID, JSONB, DATE, TEXT) TO authenticated;


-- =============================================================================
-- End of migration 205_hr_salary_history.sql
-- =============================================================================
