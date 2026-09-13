-- 119_offline_onboarding_kernel_rollback.sql

DROP TRIGGER IF EXISTS trg_clear_password_flag ON auth.users;
DROP FUNCTION IF EXISTS public.clear_must_change_password_flag();

ALTER TABLE public."User" DROP COLUMN IF EXISTS must_change_password;

-- Restore is_current_user_super_admin
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

-- Restore is_tenant_admin_for_company
CREATE OR REPLACE FUNCTION is_tenant_admin_for_company(p_company_id uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_tenant_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT is_tenant_admin INTO v_is_tenant_admin
  FROM "UserCompany"
  WHERE user_id::uuid = auth.uid() AND company_id::text = p_company_id::text
  LIMIT 1;
  RETURN COALESCE(v_is_tenant_admin, FALSE);
END;
$$;

-- Restore UserCompany policy
DROP POLICY IF EXISTS "select_UserCompany" ON "UserCompany";
CREATE POLICY "Enable all for authenticated users" ON "UserCompany" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Restore User policy
DROP POLICY IF EXISTS "select_User" ON "User";
CREATE POLICY "select_User" ON "User" FOR SELECT TO authenticated USING (true);
