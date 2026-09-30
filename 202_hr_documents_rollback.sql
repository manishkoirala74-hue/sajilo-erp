-- =============================================================================
-- Rollback     : 202_hr_documents_rollback.sql
-- Rolls back   : 202_hr_documents.sql
-- Module       : HR v6 – Employee KYC Document Metadata
-- Author       : Sajilo ERP Platform
-- Date         : 2026-09-26
-- Description  : Fully reverses migration 202_hr_documents.sql.
--
--                Execution order matters:
--                  1. Drop RLS policies (must precede table drop; included
--                     automatically by CASCADE but listed explicitly for
--                     clarity and idempotency).
--                  2. Drop indexes (also covered by CASCADE but explicit).
--                  3. DROP TABLE … CASCADE removes the table, its indexes,
--                     its RLS policies, and any FK constraints referencing it.
--
-- WARNING: This destroys ALL EmployeeDocument rows permanently.
--          Ensure Storage objects in the 'employee_kyc' bucket are also
--          cleaned up manually if required — SQL cannot delete Storage files.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1: Drop RLS policies (idempotent – IF EXISTS prevents errors on re-run)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "select_EmployeeDocument" ON "EmployeeDocument";
DROP POLICY IF EXISTS "insert_EmployeeDocument" ON "EmployeeDocument";
DROP POLICY IF EXISTS "update_EmployeeDocument" ON "EmployeeDocument";
DROP POLICY IF EXISTS "delete_EmployeeDocument" ON "EmployeeDocument";

-- ---------------------------------------------------------------------------
-- STEP 2: Drop indexes explicitly (CASCADE below would remove them, but this
--          makes the rollback self-documenting and safe to run incrementally)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_employeedocument_employee_id;
DROP INDEX IF EXISTS idx_employeedocument_company_id;
DROP INDEX IF EXISTS idx_employeedocument_company_type;

-- ---------------------------------------------------------------------------
-- STEP 3: Drop the table (CASCADE removes any remaining dependent objects)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "EmployeeDocument" CASCADE;

-- =============================================================================
-- END OF ROLLBACK 202_hr_documents_rollback.sql
-- =============================================================================
