-- ============================================================================
-- 039_fix_company_rls_isolation.sql
-- Fixes the Company table Row Level Security (RLS) policy.
--
-- PROBLEM:
--   The original policy was: USING (true)
--   This allowed ANY authenticated user to SELECT, INSERT, UPDATE, or DELETE
--   ANY company row, meaning a new user could see and modify other tenants' data.
--
-- FIX:
--   Company visibility and modification is now scoped to:
--     1. Companies the authenticated user is explicitly linked to via UserCompany.
--     2. INSERT (creating a new company) is allowed for any authenticated user
--        since the frontend immediately creates the UserCompany link afterwards.
--
-- NOTE: The UserCompany link is created by the frontend (CompanyManagement.jsx)
--       immediately after a Company is created, so all subsequent SELECT/UPDATE/DELETE
--       calls correctly pass the RLS check.
-- ============================================================================

-- Drop the overly permissive original policy
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "Company";

-- SELECT: A user can see a company only if they are linked to it via UserCompany
CREATE POLICY "select_Company"
  ON "Company"
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT company_id::uuid
      FROM "UserCompany"
      WHERE user_id::uuid = auth.uid()
    )
  );

-- INSERT: Any authenticated user can create a new company.
-- The frontend immediately links the creator via UserCompany afterwards.
CREATE POLICY "insert_Company"
  ON "Company"
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: A user can only update companies they are linked to
CREATE POLICY "update_Company"
  ON "Company"
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT company_id::uuid
      FROM "UserCompany"
      WHERE user_id::uuid = auth.uid()
    )
  )
  WITH CHECK (
    id IN (
      SELECT company_id::uuid
      FROM "UserCompany"
      WHERE user_id::uuid = auth.uid()
    )
  );

-- DELETE: A user can only delete companies they are linked to
-- (Additional application-level checks should guard this in practice)
CREATE POLICY "delete_Company"
  ON "Company"
  FOR DELETE
  TO authenticated
  USING (
    id IN (
      SELECT company_id::uuid
      FROM "UserCompany"
      WHERE user_id::uuid = auth.uid()
    )
  );

-- Also scope UserCompany table: users should only see their own UserCompany rows
-- (Prevents a user from reading another user's company links)
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "UserCompany";

CREATE POLICY "select_UserCompany"
  ON "UserCompany"
  FOR SELECT
  TO authenticated
  USING (user_id::uuid = auth.uid());

CREATE POLICY "insert_UserCompany"
  ON "UserCompany"
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id::uuid = auth.uid());

CREATE POLICY "update_UserCompany"
  ON "UserCompany"
  FOR UPDATE
  TO authenticated
  USING (user_id::uuid = auth.uid())
  WITH CHECK (user_id::uuid = auth.uid());

CREATE POLICY "delete_UserCompany"
  ON "UserCompany"
  FOR DELETE
  TO authenticated
  USING (user_id::uuid = auth.uid());
