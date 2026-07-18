-- 112_fix_rls_function_permissions.sql
-- Grants EXECUTE permission to the core RLS function so it doesn't throw 'permission denied' when evaluated during queries.

GRANT EXECUTE ON FUNCTION user_has_company_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_company_access(UUID) TO anon;
GRANT EXECUTE ON FUNCTION user_has_company_access(UUID) TO service_role;
