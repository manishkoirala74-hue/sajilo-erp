-- 071_fix_rls_stack_depth.sql
-- Fixes the infinite recursion (stack depth limit exceeded) in UserCompany and FiscalYear RLS

-- 1. Create a SECURITY DEFINER helper function to read user's companies bypassing RLS
-- This prevents the "select_UserCompany" policy from recursively calling itself.
CREATE OR REPLACE FUNCTION public.get_user_company_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT array_agg(company_id) 
  FROM "UserCompany" 
  WHERE user_id = auth.uid();
$$;

-- 2. Drop the faulty recursive policy
DROP POLICY IF EXISTS "select_UserCompany" ON "UserCompany";

-- 3. Create the flat, recursion-free policy
CREATE POLICY "select_UserCompany" ON "UserCompany"
  FOR SELECT TO authenticated
  USING (
    -- Super admins see everything
    EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND is_super_admin = true)
    -- Users can see their own rows
    OR user_id::uuid = auth.uid()
    -- Users can see other users belonging to the same companies (using the safe helper)
    OR company_id = ANY(get_user_company_ids())
  );

-- 4. Ensure the centralized access helper explicitly uses search_path to guarantee SECURITY DEFINER boundaries
CREATE OR REPLACE FUNCTION public.user_has_company_access(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Super Admin Bypass
  IF EXISTS (
    SELECT 1 FROM "User" 
    WHERE id = auth.uid() AND is_super_admin = true
  ) THEN
    RETURN TRUE;
  END IF;

  -- 2. Tenant Isolation Check
  IF EXISTS (
    SELECT 1 FROM "UserCompany" 
    WHERE company_id = p_company_id AND user_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;
