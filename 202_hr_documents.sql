-- =============================================================================
-- Migration  : 202_hr_documents.sql
-- Module     : HR v6 – Employee KYC Document Metadata
-- Author     : Sajilo ERP Platform
-- Date       : 2026-09-26
-- Description: Creates the EmployeeDocument table for tracking KYC document
--              metadata whose physical files are stored in Supabase Storage.
--              RLS is enabled and scoped to company_id via UserCompany membership
--              (mirrors the Employee table policy pattern in supabase_schema.sql).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PREREQUISITE: uuid-ossp extension (already enabled in supabase_schema.sql)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- SUPABASE STORAGE – MANUAL SETUP (cannot be automated via SQL)
-- =============================================================================
-- Two Storage buckets must be created manually in the Supabase Dashboard
-- (Storage → New Bucket) before this feature can be used:
--
--  1. Bucket: hr_avatars
--     Visibility : PUBLIC  (files served without a signed URL)
--     Path pattern: {company_id}/{employee_uuid}.{ext}
--     Example    : 9f4a.../3c7b....jpg
--     Usage      : Employee profile photos referenced by Employee.profile_image_url
--
--  2. Bucket: employee_kyc
--     Visibility : PRIVATE (files require a time-limited signed URL)
--     Path pattern: {company_id}/{employee_uuid}/{document_type}.{ext}
--     Example    : 9f4a.../3c7b.../citizenship_front.jpg
--     Usage      : Sensitive KYC documents tracked by this EmployeeDocument table
--                  via the file_url column (stores the Storage object path,
--                  NOT a pre-signed URL — sign at query time via the Storage API).
--
-- Recommended bucket-level RLS policies (set in Supabase Dashboard or via
-- the storage schema directly):
--   • INSERT / SELECT / DELETE scoped to auth.uid() matching the company_id
--     prefix in the object name, consistent with the table-level RLS below.
-- =============================================================================

-- =============================================================================
-- TABLE: EmployeeDocument
-- =============================================================================
CREATE TABLE IF NOT EXISTS "EmployeeDocument" (
  -- Primary key
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Tenant isolation – every row is owned by exactly one company
  company_id      UUID NOT NULL,

  -- Parent employee reference; cascade delete removes documents when the
  -- employee record is hard-deleted.
  employee_id     UUID NOT NULL
                    REFERENCES "Employee"(id) ON DELETE CASCADE,

  -- Enumerated document kind.
  -- Allowed values: 'Citizenship Front' | 'Citizenship Back' | 'Passport'
  --                 | 'Certificate' | 'Contract' | 'Other'
  document_type   TEXT NOT NULL,

  -- Free-form label used only when document_type = 'Other'; ignored otherwise.
  label           TEXT,

  -- Original filename as uploaded by the user (for display / download hints).
  file_name       TEXT NOT NULL,

  -- Supabase Storage object path (NOT a pre-signed URL).
  -- Format: {company_id}/{employee_uuid}/{document_type}.{ext}
  -- Obtain a time-limited signed URL at read-time via the Storage JS/REST API.
  file_url        TEXT NOT NULL,

  -- File size rounded to the nearest kilobyte; NULL if unknown.
  file_size_kb    INTEGER,

  -- Timestamp of the actual file upload action (may differ from created_at
  -- if records are bulk-imported).
  uploaded_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Display name / email of the user who performed the upload.
  uploaded_by     TEXT,

  -- Standard audit timestamps
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
-- Speed up the most common query patterns: all documents for an employee,
-- and company-wide listing filtered by type.
CREATE INDEX IF NOT EXISTS idx_employeedocument_employee_id
  ON "EmployeeDocument" (employee_id);

CREATE INDEX IF NOT EXISTS idx_employeedocument_company_id
  ON "EmployeeDocument" (company_id);

CREATE INDEX IF NOT EXISTS idx_employeedocument_company_type
  ON "EmployeeDocument" (company_id, document_type);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
-- Policy pattern mirrors supabase_schema.sql → Employee table:
--   • Super-admins (User.role = 'admin') see / modify all rows.
--   • Regular authenticated users are restricted to rows whose company_id
--     matches a company they belong to (via UserCompany).
-- ---------------------------------------------------------------------------
ALTER TABLE "EmployeeDocument" ENABLE ROW LEVEL SECURITY;

-- SELECT: read own-company documents OR global admin
CREATE POLICY "select_EmployeeDocument"
  ON "EmployeeDocument"
  FOR SELECT
  USING (
    (EXISTS (
      SELECT 1 FROM "User"
      WHERE id = auth.uid() AND role = 'admin'
    ))
    OR
    (company_id IN (
      SELECT (company_id)::uuid
      FROM "UserCompany"
      WHERE (user_id)::uuid = auth.uid()
    ))
  );

-- INSERT: only write into a company the user belongs to, OR admin
CREATE POLICY "insert_EmployeeDocument"
  ON "EmployeeDocument"
  FOR INSERT
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM "User"
      WHERE id = auth.uid() AND role = 'admin'
    ))
    OR
    (company_id IN (
      SELECT (company_id)::uuid
      FROM "UserCompany"
      WHERE (user_id)::uuid = auth.uid()
    ))
  );

-- UPDATE: both USING (which rows can be targeted) and WITH CHECK (what the
--         updated row must satisfy) are company-scoped.
CREATE POLICY "update_EmployeeDocument"
  ON "EmployeeDocument"
  FOR UPDATE
  USING (
    (EXISTS (
      SELECT 1 FROM "User"
      WHERE id = auth.uid() AND role = 'admin'
    ))
    OR
    (company_id IN (
      SELECT (company_id)::uuid
      FROM "UserCompany"
      WHERE (user_id)::uuid = auth.uid()
    ))
  )
  WITH CHECK (
    (EXISTS (
      SELECT 1 FROM "User"
      WHERE id = auth.uid() AND role = 'admin'
    ))
    OR
    (company_id IN (
      SELECT (company_id)::uuid
      FROM "UserCompany"
      WHERE (user_id)::uuid = auth.uid()
    ))
  );

-- DELETE: restrict to own-company rows OR admin
CREATE POLICY "delete_EmployeeDocument"
  ON "EmployeeDocument"
  FOR DELETE
  USING (
    (EXISTS (
      SELECT 1 FROM "User"
      WHERE id = auth.uid() AND role = 'admin'
    ))
    OR
    (company_id IN (
      SELECT (company_id)::uuid
      FROM "UserCompany"
      WHERE (user_id)::uuid = auth.uid()
    ))
  );

-- =============================================================================
-- END OF MIGRATION 202_hr_documents.sql
-- =============================================================================
