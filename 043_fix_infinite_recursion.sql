-- ============================================================================
-- 043_fix_infinite_recursion.sql
-- Resolves the PostgreSQL RLS Infinite Recursion loop on the User table.
-- ============================================================================

-- 1. Helper Function to securely bypass RLS recursion
CREATE OR REPLACE FUNCTION is_current_user_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT is_super_admin INTO v_is_super FROM "User" WHERE id::uuid = auth.uid();
  RETURN COALESCE(v_is_super, FALSE);
END;
$$;

-- 2. Helper Function to securely fetch shared company colleagues
CREATE OR REPLACE FUNCTION get_shared_colleague_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  
  RETURN QUERY
  SELECT uc2.user_id::uuid
  FROM "UserCompany" uc1
  JOIN "UserCompany" uc2 ON uc1.company_id = uc2.company_id
  WHERE uc1.user_id::uuid = auth.uid();
END;
$$;

-- 3. Overhaul User Table Policies with NON-RECURSIVE checks
DROP POLICY IF EXISTS "select_User" ON "User";
DROP POLICY IF EXISTS "insert_User" ON "User";
DROP POLICY IF EXISTS "update_User" ON "User";
DROP POLICY IF EXISTS "delete_User" ON "User";

CREATE POLICY "select_User" ON "User"
  FOR SELECT TO authenticated
  USING (
    is_current_user_super_admin()
    OR id::uuid = auth.uid()
    OR id::uuid IN (SELECT get_shared_colleague_ids())
  );

CREATE POLICY "insert_User" ON "User"
  FOR INSERT TO authenticated
  WITH CHECK (
    is_current_user_super_admin()
    OR id::uuid = auth.uid()
    OR EXISTS (SELECT 1 FROM "UserCompany" WHERE user_id::uuid = auth.uid())
  );

CREATE POLICY "update_User" ON "User"
  FOR UPDATE TO authenticated
  USING (
    is_current_user_super_admin()
    OR id::uuid = auth.uid()
    OR id::uuid IN (SELECT get_shared_colleague_ids())
  )
  WITH CHECK (
    is_current_user_super_admin()
    OR id::uuid = auth.uid()
    OR id::uuid IN (SELECT get_shared_colleague_ids())
  );

CREATE POLICY "delete_User" ON "User"
  FOR DELETE TO authenticated
  USING (
    is_current_user_super_admin()
    OR id::uuid = auth.uid()
  );

-- 4. Overhaul UserCompany Table to use identical clean isolation
DROP POLICY IF EXISTS "select_UserCompany" ON "UserCompany";
DROP POLICY IF EXISTS "insert_UserCompany" ON "UserCompany";
DROP POLICY IF EXISTS "update_UserCompany" ON "UserCompany";
DROP POLICY IF EXISTS "delete_UserCompany" ON "UserCompany";

CREATE POLICY "select_UserCompany" ON "UserCompany" FOR SELECT USING (user_has_company_access(company_id::uuid));
CREATE POLICY "insert_UserCompany" ON "UserCompany" FOR INSERT WITH CHECK (user_has_company_access(company_id::uuid));
CREATE POLICY "update_UserCompany" ON "UserCompany" FOR UPDATE USING (user_has_company_access(company_id::uuid)) WITH CHECK (user_has_company_access(company_id::uuid));
CREATE POLICY "delete_UserCompany" ON "UserCompany" FOR DELETE USING (user_has_company_access(company_id::uuid));
