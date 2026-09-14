-- ============================================================================
-- Rollback 121: Revert Server Authorization Functions & Dual-Gate RLS Policies
-- ============================================================================

DROP POLICY IF EXISTS "insert_UserCompany" ON public."UserCompany";
DROP POLICY IF EXISTS "delete_UserCompany" ON public."UserCompany";
DROP POLICY IF EXISTS "update_UserCompany" ON public."UserCompany";
DROP POLICY IF EXISTS "select_UserCompany" ON public."UserCompany";

DROP POLICY IF EXISTS "update_company_role" ON public."CompanyRole";
DROP POLICY IF EXISTS "insert_company_role" ON public."CompanyRole";
DROP POLICY IF EXISTS "select_company_role" ON public."CompanyRole";

DROP POLICY IF EXISTS "update_company_settings" ON public."CompanySettings";
DROP POLICY IF EXISTS "select_company_settings" ON public."CompanySettings";

DROP FUNCTION IF EXISTS public.is_tenant_admin_for_company(text);
DROP FUNCTION IF EXISTS public.is_tenant_admin_for_company(uuid);
DROP FUNCTION IF EXISTS public.user_has_company_access(text);
DROP FUNCTION IF EXISTS public.user_has_company_access(uuid);

DROP FUNCTION IF EXISTS public.get_user_max_role_weight(text, text);
DROP FUNCTION IF EXISTS public.get_user_max_role_weight(uuid, uuid);
DROP FUNCTION IF EXISTS public.current_user_has_company_permission(text, text);
DROP FUNCTION IF EXISTS public.current_user_has_company_permission(uuid, text);
DROP FUNCTION IF EXISTS public.current_user_is_active_company_member(text);
DROP FUNCTION IF EXISTS public.current_user_is_active_company_member(uuid);
