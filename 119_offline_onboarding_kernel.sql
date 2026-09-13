-- 119_offline_onboarding_kernel.sql

-- 1. Add Kernel-Level Flag
ALTER TABLE public."User" ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;

-- 2. Create the Auto-Clear Trigger on auth.users
CREATE OR REPLACE FUNCTION public.clear_must_change_password_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- If the password hash changes, the user has set a new password
    IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
        UPDATE public."User" 
        SET must_change_password = false 
        WHERE id::uuid = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_password_flag ON auth.users;
CREATE TRIGGER trg_clear_password_flag
AFTER UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.clear_must_change_password_flag();

-- 3. RBAC Helper Function Modifications
CREATE OR REPLACE FUNCTION is_current_user_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super BOOLEAN;
  v_must_change BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  SELECT is_super_admin, must_change_password INTO v_is_super, v_must_change FROM "User" WHERE id::uuid = auth.uid();
  IF v_must_change = true THEN RETURN FALSE; END IF;
  RETURN COALESCE(v_is_super, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION is_tenant_admin_for_company(p_company_id uuid)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_tenant_admin BOOLEAN;
  v_must_change BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  
  -- Check password lock
  SELECT must_change_password INTO v_must_change FROM "User" WHERE id::uuid = auth.uid();
  IF v_must_change = true THEN RETURN FALSE; END IF;

  SELECT is_tenant_admin INTO v_is_tenant_admin
  FROM "UserCompany"
  WHERE user_id::uuid = auth.uid() AND company_id::text = p_company_id::text
  LIMIT 1;
  RETURN COALESCE(v_is_tenant_admin, FALSE);
END;
$$;

-- 4. Dynamic Policy Injection for Operational Tables
-- By locking UserCompany, we cascade the lock to all operational tables that rely on 'company_id IN (SELECT company_id FROM UserCompany...)'.
DROP POLICY IF EXISTS "select_UserCompany" ON "UserCompany";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "UserCompany";

CREATE POLICY "select_UserCompany" ON "UserCompany"
  FOR SELECT TO authenticated
  USING (
    (user_id::uuid = auth.uid() OR is_current_user_super_admin() OR is_tenant_admin_for_company(company_id::uuid))
    AND (
      NOT EXISTS (SELECT 1 FROM "User" WHERE id::uuid = auth.uid() AND must_change_password = true)
    )
  );

-- We explicitly ensure the User table allows self-read for Catch-22 Fix
DROP POLICY IF EXISTS "select_User" ON "User";
CREATE POLICY "select_User" ON "User"
  FOR SELECT TO authenticated
  USING (
    id::uuid = auth.uid() 
    OR (
        is_current_user_super_admin() 
        AND NOT EXISTS (SELECT 1 FROM "User" u2 WHERE u2.id::uuid = auth.uid() AND u2.must_change_password = true)
    )
  );

