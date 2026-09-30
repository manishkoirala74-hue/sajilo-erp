-- =============================================================================
-- Migration  : 206_hr_loans.sql
-- Module     : HR v6 – Employee Loans
-- Author     : Sajilo ERP Migration Engineer
-- Date       : 2026-09-26
-- Description: Creates the EmployeeLoan table to track salary advances,
--              personal loans, and emergency loans issued to employees.
--              Enables Row-Level Security scoped to company_id with an
--              admin-override pattern mirroring the Employee table.
-- Rollback   : 206_hr_loans_rollback.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Prerequisites
-- ---------------------------------------------------------------------------
-- Relies on:
--   • uuid-ossp extension (uuid_generate_v4)
--   • "Employee"   table  (employee_id FK)
--   • "User"       table  (role column used in RLS)
--   • "UserCompany" table  (company_id resolution for authenticated users)
-- ---------------------------------------------------------------------------

-- =============================================================================
-- 1. TABLE: EmployeeLoan
-- =============================================================================

CREATE TABLE IF NOT EXISTS "EmployeeLoan" (
    id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Tenant scoping (required for RLS)
    company_id         UUID        NOT NULL,

    -- Core relationships
    employee_id        UUID        NOT NULL
                                   REFERENCES "Employee"(id) ON DELETE CASCADE,

    -- Loan classification
    -- Allowed values: 'Salary Advance' | 'Personal Loan' | 'Emergency Loan'
    loan_type          TEXT        NOT NULL DEFAULT 'Salary Advance',

    -- Financial fields
    principal_amount   NUMERIC     NOT NULL DEFAULT 0,   -- Original disbursed amount
    outstanding_amount NUMERIC     NOT NULL DEFAULT 0,   -- Remaining balance
    monthly_deduction  NUMERIC     NOT NULL DEFAULT 0,   -- EMI deducted from payroll

    -- Dates
    disbursement_date  DATE,                             -- Null until funds are released

    -- Lifecycle
    -- Allowed values: 'Active' | 'Paid Off' | 'Defaulted'
    status             TEXT        NOT NULL DEFAULT 'Active',

    -- Free-form notes / approval remarks
    notes              TEXT,

    -- Audit timestamps
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 1a. Indexes
-- ---------------------------------------------------------------------------

-- Lookup loans by employee quickly (payroll deduction queries)
CREATE INDEX IF NOT EXISTS idx_employee_loan_employee_id
    ON "EmployeeLoan" (employee_id);

-- Filter active loans per company (dashboard / reporting queries)
CREATE INDEX IF NOT EXISTS idx_employee_loan_company_status
    ON "EmployeeLoan" (company_id, status);

-- =============================================================================
-- 2. ROW-LEVEL SECURITY
-- =============================================================================

ALTER TABLE "EmployeeLoan" ENABLE ROW LEVEL SECURITY;

-- Force RLS even for the table owner (Supabase service role bypasses by default;
-- authenticated queries must still satisfy the policies below).
ALTER TABLE "EmployeeLoan" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2a. SELECT policy
--     Admin role sees all rows company-wide.
--     Regular authenticated users see only rows belonging to their company.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "select_EmployeeLoan" ON "EmployeeLoan";
CREATE POLICY "select_EmployeeLoan"
    ON "EmployeeLoan"
    FOR SELECT
    USING (
        (
            -- Admin override: any user whose role = 'admin' in the User table
            EXISTS (
                SELECT 1
                FROM "User"
                WHERE id   = auth.uid()
                  AND role = 'admin'
            )
        )
        OR
        (
            -- Company-scoped access: user must belong to the same company
            company_id IN (
                SELECT (company_id)::uuid
                FROM   "UserCompany"
                WHERE  (user_id)::uuid = auth.uid()
            )
        )
    );

-- ---------------------------------------------------------------------------
-- 2b. INSERT policy
--     Users may only insert loans into a company they belong to.
--     Admins may insert into any company.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "insert_EmployeeLoan" ON "EmployeeLoan";
CREATE POLICY "insert_EmployeeLoan"
    ON "EmployeeLoan"
    FOR INSERT
    WITH CHECK (
        (
            EXISTS (
                SELECT 1
                FROM "User"
                WHERE id   = auth.uid()
                  AND role = 'admin'
            )
        )
        OR
        (
            company_id IN (
                SELECT (company_id)::uuid
                FROM   "UserCompany"
                WHERE  (user_id)::uuid = auth.uid()
            )
        )
    );

-- ---------------------------------------------------------------------------
-- 2c. UPDATE policy
--     Users may only update loans within their own company.
--     Admins may update any loan.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "update_EmployeeLoan" ON "EmployeeLoan";
CREATE POLICY "update_EmployeeLoan"
    ON "EmployeeLoan"
    FOR UPDATE
    USING (
        (
            EXISTS (
                SELECT 1
                FROM "User"
                WHERE id   = auth.uid()
                  AND role = 'admin'
            )
        )
        OR
        (
            company_id IN (
                SELECT (company_id)::uuid
                FROM   "UserCompany"
                WHERE  (user_id)::uuid = auth.uid()
            )
        )
    )
    WITH CHECK (
        (
            EXISTS (
                SELECT 1
                FROM "User"
                WHERE id   = auth.uid()
                  AND role = 'admin'
            )
        )
        OR
        (
            company_id IN (
                SELECT (company_id)::uuid
                FROM   "UserCompany"
                WHERE  (user_id)::uuid = auth.uid()
            )
        )
    );

-- ---------------------------------------------------------------------------
-- 2d. DELETE policy
--     Only admins or members of the owning company may delete loan records.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "delete_EmployeeLoan" ON "EmployeeLoan";
CREATE POLICY "delete_EmployeeLoan"
    ON "EmployeeLoan"
    FOR DELETE
    USING (
        (
            EXISTS (
                SELECT 1
                FROM "User"
                WHERE id   = auth.uid()
                  AND role = 'admin'
            )
        )
        OR
        (
            company_id IN (
                SELECT (company_id)::uuid
                FROM   "UserCompany"
                WHERE  (user_id)::uuid = auth.uid()
            )
        )
    );

-- =============================================================================
-- 3. HELPER FUNCTION: auto-update updated_at on row change
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_employee_loan_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_employee_loan_updated_at()
    TO authenticated;

-- Attach trigger (idempotent: drop first then recreate)
DROP TRIGGER IF EXISTS trg_employee_loan_updated_at ON "EmployeeLoan";
CREATE TRIGGER trg_employee_loan_updated_at
    BEFORE UPDATE ON "EmployeeLoan"
    FOR EACH ROW
    EXECUTE FUNCTION public.set_employee_loan_updated_at();

-- =============================================================================
-- End of migration 206_hr_loans.sql
-- =============================================================================
