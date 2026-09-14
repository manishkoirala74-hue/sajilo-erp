-- ============================================================================
-- Rollback Migration 126: Revert Owner/Admin RBAC Permissions
-- ============================================================================

-- 1. Revert current_user_has_company_permission to Migration 121 state (Text signature)
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

-- 2. Revert get_user_max_role_weight to Migration 121 state (Universal text parameters)
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

-- 3. Drop Schema Columns
ALTER TABLE public."UserCompany" 
DROP COLUMN IF EXISTS is_owner,
DROP COLUMN IF EXISTS is_tenant_admin;

-- 4. Re-grant Execution Permissions to Authenticated Role
GRANT EXECUTE ON FUNCTION public.current_user_has_company_permission(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_company_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_max_role_weight(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_max_role_weight(uuid, uuid) TO authenticated;
