-- =============================================================================
-- Migration  : 201_hr_kyc_profile.sql
-- Module     : HR – KYC & Employee Profile
-- Author     : Sajilo ERP Migration Engineer
-- Created    : 2026-09-26
-- Description:
--   1. Creates the `CompanyCounter` table for per-company auto-incrementing
--      code sequences (e.g. employee codes, voucher numbers) and enables RLS.
--   2. Adds six new columns to the existing `Employee` table
--      (employment_type, reporting_manager_id, work_location, bank_branch,
--       bank_account_holder, pf_number) — all guarded with IF NOT EXISTS.
--   3. Creates the `EmployeeProfile` table to store KYC / personal details
--      linked 1-to-1 with an Employee row, with RLS enabled and
--      company_id-scoped policies mirroring the Employee table pattern.
--   4. Creates (or replaces) the `rpc_next_company_code` RPC function that
--      atomically returns the next available counter value for a given
--      company + counter_type pair.
-- Rollback   : 201_hr_kyc_profile_rollback.sql
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. CompanyCounter table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "CompanyCounter" (
    company_id   UUID NOT NULL,
    counter_type TEXT NOT NULL,
    next_val     INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (company_id, counter_type)
);

COMMENT ON TABLE "CompanyCounter" IS
    'Holds per-company, per-type monotonically increasing counters used by '
    'rpc_next_company_code() to generate unique codes (employee IDs, vouchers, etc.).';

-- Enable Row-Level Security
ALTER TABLE "CompanyCounter" ENABLE ROW LEVEL SECURITY;

-- SELECT policy: company members may read their own counters; admins may read all.
DROP POLICY IF EXISTS "CompanyCounter_select" ON "CompanyCounter";
CREATE POLICY "CompanyCounter_select" ON "CompanyCounter"
    FOR SELECT
    USING (
        -- User belongs to the same company via UserCompany mapping
        company_id IN (
            SELECT uc.company_id
            FROM "UserCompany" uc
            WHERE uc.user_id = auth.uid()
        )
        OR
        -- Supabase/app admin role bypass
        auth.role() = 'admin'
    );

-- INSERT policy: company members may insert counter rows for their own company.
DROP POLICY IF EXISTS "CompanyCounter_insert" ON "CompanyCounter";
CREATE POLICY "CompanyCounter_insert" ON "CompanyCounter"
    FOR INSERT
    WITH CHECK (
        company_id IN (
            SELECT uc.company_id
            FROM "UserCompany" uc
            WHERE uc.user_id = auth.uid()
        )
        OR
        auth.role() = 'admin'
    );

-- UPDATE policy: company members may update counters belonging to their company.
DROP POLICY IF EXISTS "CompanyCounter_update" ON "CompanyCounter";
CREATE POLICY "CompanyCounter_update" ON "CompanyCounter"
    FOR UPDATE
    USING (
        company_id IN (
            SELECT uc.company_id
            FROM "UserCompany" uc
            WHERE uc.user_id = auth.uid()
        )
        OR
        auth.role() = 'admin'
    )
    WITH CHECK (
        company_id IN (
            SELECT uc.company_id
            FROM "UserCompany" uc
            WHERE uc.user_id = auth.uid()
        )
        OR
        auth.role() = 'admin'
    );


-- ---------------------------------------------------------------------------
-- 2. New columns on Employee (all guarded with IF NOT EXISTS)
-- ---------------------------------------------------------------------------

-- Employment type (e.g. 'Full Time', 'Part Time', 'Contract', 'Intern')
ALTER TABLE "Employee"
    ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'Full Time';

COMMENT ON COLUMN "Employee".employment_type IS
    'Nature of employment. Allowed values: Full Time, Part Time, Contract, Intern.';

-- Self-referencing FK to the reporting manager's Employee row
ALTER TABLE "Employee"
    ADD COLUMN IF NOT EXISTS reporting_manager_id UUID
        REFERENCES "Employee"(id) ON DELETE SET NULL;

COMMENT ON COLUMN "Employee".reporting_manager_id IS
    'FK to the Employee who is this employee''s direct reporting manager.';

-- Physical / remote work location label
ALTER TABLE "Employee"
    ADD COLUMN IF NOT EXISTS work_location TEXT;

COMMENT ON COLUMN "Employee".work_location IS
    'Descriptive work location (e.g. "Head Office", "Remote", "Branch – Pokhara").';

-- Bank branch where the employee's salary account is held
ALTER TABLE "Employee"
    ADD COLUMN IF NOT EXISTS bank_branch TEXT;

COMMENT ON COLUMN "Employee".bank_branch IS
    'Name of the bank branch for salary disbursement.';

-- Name on the bank account (may differ from employee display name)
ALTER TABLE "Employee"
    ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;

COMMENT ON COLUMN "Employee".bank_account_holder IS
    'Account holder name as printed on the bank account.';

-- Employee Provident Fund (EPF / PF) number
ALTER TABLE "Employee"
    ADD COLUMN IF NOT EXISTS pf_number TEXT;

COMMENT ON COLUMN "Employee".pf_number IS
    'Provident Fund registration number assigned by the relevant authority.';


-- ---------------------------------------------------------------------------
-- 3. EmployeeProfile table (KYC / personal details)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "EmployeeProfile" (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id         UUID,
    employee_id        UUID UNIQUE REFERENCES "Employee"(id) ON DELETE CASCADE,

    -- Personal demographics
    gender             TEXT,
    blood_group        TEXT,
    marital_status     TEXT,

    -- Family information
    father_name        TEXT,
    mother_name        TEXT,
    grandfather_name   TEXT,
    spouse_name        TEXT,

    -- Identification documents
    pan_number         TEXT,
    citizenship_number TEXT,
    passport_number    TEXT,
    passport_expiry    DATE,

    -- Address information stored as flexible JSONB
    -- Expected shape: { "province": "", "district": "", "municipality": "",
    --                   "ward": "", "tole": "" }
    permanent_address  JSONB DEFAULT '{}',
    temporary_address  JSONB DEFAULT '{}',

    -- Emergency contact stored as JSONB
    -- Expected shape: { "name": "", "relation": "", "phone": "" }
    emergency_contact  JSONB DEFAULT '{}',

    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE "EmployeeProfile" IS
    'One-to-one KYC / personal profile record for each Employee. '
    'Contains demographics, identity documents, addresses, and emergency contacts.';

COMMENT ON COLUMN "EmployeeProfile".permanent_address IS
    'JSONB: { "province", "district", "municipality", "ward", "tole" }';
COMMENT ON COLUMN "EmployeeProfile".temporary_address IS
    'JSONB: { "province", "district", "municipality", "ward", "tole" }';
COMMENT ON COLUMN "EmployeeProfile".emergency_contact IS
    'JSONB: { "name", "relation", "phone" }';

-- Enable Row-Level Security
ALTER TABLE "EmployeeProfile" ENABLE ROW LEVEL SECURITY;

-- SELECT policy
DROP POLICY IF EXISTS "EmployeeProfile_select" ON "EmployeeProfile";
CREATE POLICY "EmployeeProfile_select" ON "EmployeeProfile"
    FOR SELECT
    USING (
        company_id IN (
            SELECT uc.company_id
            FROM "UserCompany" uc
            WHERE uc.user_id = auth.uid()
        )
        OR
        auth.role() = 'admin'
    );

-- INSERT policy
DROP POLICY IF EXISTS "EmployeeProfile_insert" ON "EmployeeProfile";
CREATE POLICY "EmployeeProfile_insert" ON "EmployeeProfile"
    FOR INSERT
    WITH CHECK (
        company_id IN (
            SELECT uc.company_id
            FROM "UserCompany" uc
            WHERE uc.user_id = auth.uid()
        )
        OR
        auth.role() = 'admin'
    );

-- UPDATE policy
DROP POLICY IF EXISTS "EmployeeProfile_update" ON "EmployeeProfile";
CREATE POLICY "EmployeeProfile_update" ON "EmployeeProfile"
    FOR UPDATE
    USING (
        company_id IN (
            SELECT uc.company_id
            FROM "UserCompany" uc
            WHERE uc.user_id = auth.uid()
        )
        OR
        auth.role() = 'admin'
    )
    WITH CHECK (
        company_id IN (
            SELECT uc.company_id
            FROM "UserCompany" uc
            WHERE uc.user_id = auth.uid()
        )
        OR
        auth.role() = 'admin'
    );

-- DELETE policy: only admins may hard-delete a profile row.
DROP POLICY IF EXISTS "EmployeeProfile_delete" ON "EmployeeProfile";
CREATE POLICY "EmployeeProfile_delete" ON "EmployeeProfile"
    FOR DELETE
    USING (
        auth.role() = 'admin'
    );

-- Auto-update `updated_at` on every row change
CREATE OR REPLACE FUNCTION public.set_employee_profile_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Attach the trigger (idempotent: drop first if it already exists)
DROP TRIGGER IF EXISTS trg_employee_profile_updated_at ON "EmployeeProfile";
CREATE TRIGGER trg_employee_profile_updated_at
    BEFORE UPDATE ON "EmployeeProfile"
    FOR EACH ROW
    EXECUTE FUNCTION public.set_employee_profile_updated_at();


-- ---------------------------------------------------------------------------
-- 4. rpc_next_company_code – atomic counter increment RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_next_company_code(
    p_company_id   UUID,
    p_counter_type TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER   -- runs as the function owner so RLS on CompanyCounter is bypassed
                   -- for the internal upsert; the calling user is still validated via
                   -- the GRANT below.
AS $$
DECLARE
    v_val INTEGER;
BEGIN
    -- Atomically upsert: first call inserts with next_val = 2 and returns 1;
    -- subsequent calls increment next_val and return the *previous* value.
    INSERT INTO "CompanyCounter" (company_id, counter_type, next_val)
    VALUES (p_company_id, p_counter_type, 2)
    ON CONFLICT (company_id, counter_type) DO UPDATE
        SET next_val = "CompanyCounter".next_val + 1
    RETURNING "CompanyCounter".next_val - 1 INTO v_val;

    RETURN v_val;
END;
$$;

COMMENT ON FUNCTION public.rpc_next_company_code(UUID, TEXT) IS
    'Atomically returns the next integer code for a (company_id, counter_type) pair. '
    'Thread-safe: uses INSERT … ON CONFLICT DO UPDATE to avoid race conditions. '
    'The first call for a given pair returns 1; each subsequent call returns the '
    'next sequential integer.';

-- Explicit RPC grant required by DEVELOPMENT_CHECKLIST.md
GRANT EXECUTE ON FUNCTION public.rpc_next_company_code(UUID, TEXT) TO authenticated;
