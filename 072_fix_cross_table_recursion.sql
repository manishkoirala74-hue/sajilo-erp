-- ============================================================================
-- 072_fix_cross_table_recursion.sql
-- Destroys cross-table infinite recursion loops across all CRUD policies
-- by applying STABLE, SECURITY DEFINER, and SET search_path = public 
-- to all authorization helper functions, and replacing raw subqueries.
-- ============================================================================

-- 1. Harden is_current_user_super_admin()
CREATE OR REPLACE FUNCTION public.is_current_user_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN 
    RETURN false; 
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM "User" 
    WHERE id = auth.uid() AND is_super_admin = true
  );
END;
$$;

-- 2. Harden get_shared_colleague_ids()
CREATE OR REPLACE FUNCTION public.get_shared_colleague_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT DISTINCT uc2.user_id::uuid
  FROM "UserCompany" uc1
  JOIN "UserCompany" uc2 ON uc1.company_id = uc2.company_id
  WHERE uc1.user_id::uuid = auth.uid();
END;
$$;

-- 3. Harden get_user_company_ids()
CREATE OR REPLACE FUNCTION public.get_user_company_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT array_agg(company_id) 
  FROM "UserCompany" 
  WHERE user_id = auth.uid();
$$;

-- 3.5 Harden is_tenant_admin_for_company()
CREATE OR REPLACE FUNCTION public.is_tenant_admin_for_company(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM "UserCompany" 
    WHERE user_id = auth.uid() AND company_id = p_company_id AND is_tenant_admin = true
  );
END;
$$;


-- ============================================================================
-- 4. Rebuild "UserCompany" Policies (Hardened CUD)
-- ============================================================================
DROP POLICY IF EXISTS "select_UserCompany" ON "UserCompany";
DROP POLICY IF EXISTS "insert_UserCompany" ON "UserCompany";
DROP POLICY IF EXISTS "update_UserCompany" ON "UserCompany";
DROP POLICY IF EXISTS "delete_UserCompany" ON "UserCompany";

-- READ: Users can see their own memberships, and members of the company can see each other
CREATE POLICY "select_UserCompany" ON "UserCompany"
  FOR SELECT TO authenticated
  USING (
    is_current_user_super_admin()
    OR user_id::uuid = auth.uid()
    OR company_id = ANY(get_user_company_ids())
  );

-- INSERT/UPDATE/DELETE: Strictly limited to Tenant Admins or Super Admins!
CREATE POLICY "insert_UserCompany" ON "UserCompany"
  FOR INSERT TO authenticated
  WITH CHECK (
    is_current_user_super_admin()
    OR is_tenant_admin_for_company(company_id)
  );

CREATE POLICY "update_UserCompany" ON "UserCompany"
  FOR UPDATE TO authenticated
  USING (is_current_user_super_admin() OR is_tenant_admin_for_company(company_id))
  WITH CHECK (is_current_user_super_admin() OR is_tenant_admin_for_company(company_id));

CREATE POLICY "delete_UserCompany" ON "UserCompany"
  FOR DELETE TO authenticated
  USING (is_current_user_super_admin() OR is_tenant_admin_for_company(company_id));

-- ============================================================================
-- 5. Rebuild "User" Policies (Hardened CUD)
-- ============================================================================
DROP POLICY IF EXISTS "select_User" ON "User";
DROP POLICY IF EXISTS "insert_User" ON "User";
DROP POLICY IF EXISTS "update_User" ON "User";
DROP POLICY IF EXISTS "delete_User" ON "User";

-- READ: Users can see themselves, super admins see all, and colleagues see colleagues
CREATE POLICY "select_User" ON "User"
  FOR SELECT TO authenticated
  USING (
    is_current_user_super_admin()
    OR id::uuid = auth.uid()
    OR id::uuid IN (SELECT get_shared_colleague_ids())
  );

-- INSERT/UPDATE/DELETE: Strictly limited to Self or Super Admin! (No colleague CUD)
CREATE POLICY "insert_User" ON "User"
  FOR INSERT TO authenticated
  WITH CHECK (is_current_user_super_admin() OR id::uuid = auth.uid());

CREATE POLICY "update_User" ON "User"
  FOR UPDATE TO authenticated
  USING (is_current_user_super_admin() OR id::uuid = auth.uid())
  WITH CHECK (is_current_user_super_admin() OR id::uuid = auth.uid());

CREATE POLICY "delete_User" ON "User"
  FOR DELETE TO authenticated
  USING (is_current_user_super_admin() OR id::uuid = auth.uid());
