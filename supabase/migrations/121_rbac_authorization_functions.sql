-- ============================================================================
-- Migration 121: Server Authorization Functions & Dual-Gate RLS Policies
-- ============================================================================

-- 0. Purge Policies First to Avoid Dependency Errors
DROP POLICY IF EXISTS "select_company_settings" ON public."CompanySettings";
DROP POLICY IF EXISTS "update_company_settings" ON public."CompanySettings";
DROP POLICY IF EXISTS "all_CompanySettings" ON public."CompanySettings";

DROP POLICY IF EXISTS "select_company_role" ON public."CompanyRole";
DROP POLICY IF EXISTS "insert_company_role" ON public."CompanyRole";
DROP POLICY IF EXISTS "update_company_role" ON public."CompanyRole";
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public."CompanyRole";
DROP POLICY IF EXISTS "all_CompanyRole" ON public."CompanyRole";

DROP POLICY IF EXISTS "select_UserCompany" ON public."UserCompany";
DROP POLICY IF EXISTS "update_UserCompany" ON public."UserCompany";
DROP POLICY IF EXISTS "delete_UserCompany" ON public."UserCompany";
DROP POLICY IF EXISTS "insert_UserCompany" ON public."UserCompany";
DROP POLICY IF EXISTS "user_company_secure_policy" ON public."UserCompany";
DROP POLICY IF EXISTS "user_company_insert_policy" ON public."UserCompany";

-- 1. Helper: Check if current authenticated user is an active member of the company (Text signature)
CREATE OR REPLACE FUNCTION public.current_user_is_active_company_member(p_company_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR p_company_id IS NULL THEN
        RETURN false;
    END IF;

    -- Check active global user account status (Universal text comparison)
    IF EXISTS (
        SELECT 1 FROM public."User" u 
        WHERE u.id::text = auth.uid()::text 
          AND (u.account_status IS NULL OR u.account_status = 'active')
    ) THEN
        -- Check active company workspace membership (Universal text comparison)
        RETURN EXISTS (
            SELECT 1 FROM public."UserCompany" uc 
            WHERE uc.user_id::text = auth.uid()::text 
              AND uc.company_id::text = p_company_id::text 
              AND (uc.membership_status IS NULL OR uc.membership_status = 'active')
        );
    END IF;

    RETURN false;
END;
$$;

-- UUID Overload Wrapper
CREATE OR REPLACE FUNCTION public.current_user_is_active_company_member(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.current_user_is_active_company_member(p_company_id::text);
END;
$$;

-- 2. Helper: Check if current authenticated user has a specific company permission (Text signature)
CREATE OR REPLACE FUNCTION public.current_user_has_company_permission(p_company_id text, p_permission_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_role text;
    v_is_super boolean;
BEGIN
    IF auth.uid() IS NULL OR p_company_id IS NULL OR p_permission_key IS NULL THEN
        RETURN false;
    END IF;

    -- Check if super admin or tenant admin (Universal text comparison)
    SELECT u.role, COALESCE(u.is_super_admin, false) INTO v_user_role, v_is_super
    FROM public."User" u WHERE u.id::text = auth.uid()::text;

    IF v_is_super OR v_user_role IN ('admin', 'tenant_admin') THEN
        RETURN true;
    END IF;

    -- Verify active membership
    IF NOT public.current_user_is_active_company_member(p_company_id) THEN
        RETURN false;
    END IF;

    -- Check permission catalog mapping or role permissions (Universal text comparison)
    RETURN EXISTS (
        SELECT 1 
        FROM public."UserCompany" uc
        JOIN public."CompanyRole" cr ON cr.id::text = uc.company_role_id::text
        LEFT JOIN public."RolePermission" rp ON rp.role_id::text = cr.id::text
        LEFT JOIN public."Permission" p ON p.id::text = rp.permission_id::text
        WHERE uc.user_id::text = auth.uid()::text
          AND uc.company_id::text = p_company_id::text
          AND (
            p.key = p_permission_key OR
            (cr.menu_permissions->'settings'->>'approve')::boolean = true
          )
    );
END;
$$;

-- UUID Overload Wrapper
CREATE OR REPLACE FUNCTION public.current_user_has_company_permission(p_company_id uuid, p_permission_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.current_user_has_company_permission(p_company_id::text, p_permission_key);
END;
$$;

-- 3. Helper: Get max role weight for a user in a company (Universal text parameters)
CREATE OR REPLACE FUNCTION public.get_user_max_role_weight(p_user_id text, p_company_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role text;
    v_weight integer;
BEGIN
    IF p_user_id IS NULL OR p_company_id IS NULL THEN
        RETURN 10;
    END IF;

    -- Universal text comparison for User.id primary key lookup
    SELECT u.role INTO v_role FROM public."User" u WHERE u.id::text = p_user_id::text;
    IF v_role IN ('admin', 'tenant_admin') THEN
        RETURN 80;
    END IF;

    -- Universal text comparison for UserCompany
    SELECT COALESCE(MAX(cr.hierarchy_weight), 10) INTO v_weight
    FROM public."UserCompany" uc
    JOIN public."CompanyRole" cr ON cr.id::text = uc.company_role_id::text
    WHERE uc.user_id::text = p_user_id::text AND uc.company_id::text = p_company_id::text;

    RETURN COALESCE(v_weight, 10);
END;
$$;

-- UUID Overload Wrapper
CREATE OR REPLACE FUNCTION public.get_user_max_role_weight(p_user_id uuid, p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.get_user_max_role_weight(p_user_id::text, p_company_id::text);
END;
$$;

-- 4. Legacy Compatibility Wrappers with Matching Parameter Names
CREATE OR REPLACE FUNCTION public.user_has_company_access(company_uuid text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.current_user_is_active_company_member(company_uuid);
END;
$$;

CREATE OR REPLACE FUNCTION public.user_has_company_access(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.current_user_is_active_company_member(p_company_id::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin_for_company(company_uuid text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.current_user_has_company_permission(company_uuid, 'companies.manage');
END;
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin_for_company(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN public.current_user_has_company_permission(p_company_id::text, 'companies.manage');
END;
$$;

-- Grant execute privileges for all signatures
GRANT EXECUTE ON FUNCTION public.current_user_is_active_company_member(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_active_company_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_company_permission(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_company_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_max_role_weight(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_max_role_weight(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_company_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_company_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin_for_company(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin_for_company(uuid) TO authenticated;

-- ============================================================================
-- Dual-Gate RLS Policies with Universal Text Casting & Explicit Table Aliases
-- ============================================================================

-- CompanySettings Table
ALTER TABLE public."CompanySettings" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_settings" ON public."CompanySettings";
CREATE POLICY "select_company_settings" ON public."CompanySettings"
  FOR SELECT TO authenticated
  USING (
    "CompanySettings".company_id IS NOT NULL 
    AND public.current_user_is_active_company_member("CompanySettings".company_id::text)
  );

DROP POLICY IF EXISTS "update_company_settings" ON public."CompanySettings";
CREATE POLICY "update_company_settings" ON public."CompanySettings"
  FOR UPDATE TO authenticated
  USING (
    "CompanySettings".company_id IS NOT NULL 
    AND public.current_user_is_active_company_member("CompanySettings".company_id::text)
    AND public.current_user_has_company_permission("CompanySettings".company_id::text, 'companies.edit')
  )
  WITH CHECK (
    "CompanySettings".company_id IS NOT NULL 
    AND public.current_user_is_active_company_member("CompanySettings".company_id::text)
    AND public.current_user_has_company_permission("CompanySettings".company_id::text, 'companies.edit')
  );

-- CompanyRole Table
ALTER TABLE public."CompanyRole" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_company_role" ON public."CompanyRole";
CREATE POLICY "select_company_role" ON public."CompanyRole"
  FOR SELECT TO authenticated
  USING (
    "CompanyRole".company_id IS NOT NULL 
    AND public.current_user_is_active_company_member("CompanyRole".company_id::text)
  );

DROP POLICY IF EXISTS "insert_company_role" ON public."CompanyRole";
CREATE POLICY "insert_company_role" ON public."CompanyRole"
  FOR INSERT TO authenticated
  WITH CHECK (
    "CompanyRole".company_id IS NOT NULL 
    AND public.current_user_is_active_company_member("CompanyRole".company_id::text)
    AND public.current_user_has_company_permission("CompanyRole".company_id::text, 'roles.create')
  );

DROP POLICY IF EXISTS "update_company_role" ON public."CompanyRole";
CREATE POLICY "update_company_role" ON public."CompanyRole"
  FOR UPDATE TO authenticated
  USING (
    "CompanyRole".company_id IS NOT NULL 
    AND public.current_user_is_active_company_member("CompanyRole".company_id::text)
    AND public.current_user_has_company_permission("CompanyRole".company_id::text, 'roles.edit')
  )
  WITH CHECK (
    "CompanyRole".company_id IS NOT NULL 
    AND public.current_user_is_active_company_member("CompanyRole".company_id::text)
    AND public.current_user_has_company_permission("CompanyRole".company_id::text, 'roles.edit')
  );

-- UserCompany Table
ALTER TABLE public."UserCompany" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_UserCompany" ON public."UserCompany";
CREATE POLICY "select_UserCompany" ON public."UserCompany"
  FOR SELECT TO authenticated
  USING (
    "UserCompany".user_id::text = auth.uid()::text 
    OR public.current_user_is_active_company_member("UserCompany".company_id::text)
  );

DROP POLICY IF EXISTS "update_UserCompany" ON public."UserCompany";
CREATE POLICY "update_UserCompany" ON public."UserCompany"
  FOR UPDATE TO authenticated
  USING (
    public.current_user_has_company_permission("UserCompany".company_id::text, 'users.edit')
  )
  WITH CHECK (
    public.current_user_has_company_permission("UserCompany".company_id::text, 'users.edit')
  );

DROP POLICY IF EXISTS "delete_UserCompany" ON public."UserCompany";
CREATE POLICY "delete_UserCompany" ON public."UserCompany"
  FOR DELETE TO authenticated
  USING (
    public.current_user_has_company_permission("UserCompany".company_id::text, 'users.delete')
  );

DROP POLICY IF EXISTS "insert_UserCompany" ON public."UserCompany";
CREATE POLICY "insert_UserCompany" ON public."UserCompany"
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_company_permission("UserCompany".company_id::text, 'users.create')
  );
