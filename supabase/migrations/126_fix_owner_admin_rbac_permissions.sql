-- ============================================================================
-- Migration 126: Fix Owner/Admin RBAC Permissions
-- ============================================================================

-- 1. Schema Extension
ALTER TABLE public."UserCompany" 
ADD COLUMN IF NOT EXISTS is_owner boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_tenant_admin boolean DEFAULT false;

-- 2. Native UUID Backfill (Zero Table Scans)
-- Backfill company creators using native UUID matching
UPDATE public."UserCompany" uc
SET is_tenant_admin = true,
    is_owner = true
FROM public."Company" c
WHERE uc.company_id = c.id 
  AND uc.user_id = c.created_by;

-- Backfill admin/owner user role accounts
UPDATE public."UserCompany" uc
SET is_tenant_admin = true,
    is_owner = true
FROM public."User" u
WHERE uc.user_id = u.id
  AND u.role IN ('admin', 'tenant_admin', 'owner');

-- 3. High-Performance RPC current_user_has_company_permission
CREATE OR REPLACE FUNCTION public.current_user_has_company_permission(p_company_id text, p_permission_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_role text;
    v_is_super boolean;
    v_user_uuid uuid;
BEGIN
    IF auth.uid() IS NULL OR p_company_id IS NULL OR p_permission_key IS NULL THEN
        RETURN false;
    END IF;

    v_user_uuid := auth.uid();

    -- Step 1: Global Super Admin / Platform Admin check (B-Tree Index Safe on public."User".id)
    SELECT u.role, COALESCE(u.is_super_admin, false) INTO v_user_role, v_is_super
    FROM public."User" u 
    WHERE u.id = v_user_uuid;

    IF v_is_super OR v_user_role IN ('admin', 'tenant_admin') THEN
        RETURN true;
    END IF;

    -- Step 2: Workspace Owner / Tenant Admin check WITH Active Status verification (Right-side UUID cast)
    IF EXISTS (
        SELECT 1 
        FROM public."UserCompany" uc
        WHERE uc.user_id = v_user_uuid
          AND uc.company_id = p_company_id::uuid
          AND (COALESCE(uc.is_owner, false) = true OR COALESCE(uc.is_tenant_admin, false) = true)
          AND (uc.membership_status IS NULL OR uc.membership_status = 'active')
    ) THEN
        RETURN true;
    END IF;

    -- Step 3: Verify active workspace membership
    IF NOT public.current_user_is_active_company_member(p_company_id) THEN
        RETURN false;
    END IF;

    -- Step 4: Fallback to custom CompanyRole permissions (Migration 121 JSONB Standard + Active Membership Guard)
    RETURN EXISTS (
        SELECT 1 
        FROM public."UserCompany" uc
        JOIN public."CompanyRole" cr ON cr.id = uc.company_role_id
        WHERE uc.user_id = v_user_uuid
          AND uc.company_id = p_company_id::uuid
          AND (uc.membership_status IS NULL OR uc.membership_status = 'active')
          AND (
              cr.permissions ? p_permission_key
              OR cr.permissions ? '*'
          )
    );
END;
$$;



-- 4. High-Performance RPC get_user_max_role_weight
CREATE OR REPLACE FUNCTION public.get_user_max_role_weight(p_user_id text, p_company_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role text;
    v_weight integer;
    v_is_owner boolean;
    v_is_tenant_admin boolean;
BEGIN
    IF p_user_id IS NULL OR p_company_id IS NULL THEN
        RETURN 10;
    END IF;

    -- Step 1: Check Global User.role (Right-side UUID cast)
    SELECT u.role INTO v_role 
    FROM public."User" u 
    WHERE u.id = p_user_id::uuid;
    
    IF v_role IN ('admin', 'tenant_admin') THEN
        RETURN 80;
    END IF;

    -- Step 2: Check Workspace Owner (Weight 100) or Tenant Admin (Weight 80) flags with Active Status verification
    SELECT COALESCE(uc.is_owner, false), COALESCE(uc.is_tenant_admin, false)
    INTO v_is_owner, v_is_tenant_admin
    FROM public."UserCompany" uc
    WHERE uc.user_id = p_user_id::uuid 
      AND uc.company_id = p_company_id::uuid
      AND (uc.membership_status IS NULL OR uc.membership_status = 'active');

    IF v_is_owner THEN
        RETURN 100;
    END IF;

    IF v_is_tenant_admin THEN
        RETURN 80;
    END IF;

    -- Step 3: Fallback to assigned CompanyRole hierarchy_weight WITH Active Status verification
    SELECT COALESCE(MAX(cr.hierarchy_weight), 10) INTO v_weight
    FROM public."UserCompany" uc
    JOIN public."CompanyRole" cr ON cr.id = uc.company_role_id
    WHERE uc.user_id = p_user_id::uuid 
      AND uc.company_id = p_company_id::uuid
      AND (uc.membership_status IS NULL OR uc.membership_status = 'active');

    RETURN COALESCE(v_weight, 10);
END;
$$;

-- 5. Drop Conflicting UUID Wrappers to Fix PostgREST PGRST203 Overloading Error
DROP FUNCTION IF EXISTS public.current_user_has_company_permission(uuid, text);
DROP FUNCTION IF EXISTS public.get_user_max_role_weight(uuid, uuid);

-- 6. Re-grant Execution Permissions to Authenticated Role for Text Signatures
GRANT EXECUTE ON FUNCTION public.current_user_has_company_permission(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_max_role_weight(text, text) TO authenticated;
