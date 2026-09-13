-- 120_fix_user_recursion.sql

-- 1. Redefine get_shared_colleague_ids to include the password lock check securely
CREATE OR REPLACE FUNCTION get_shared_colleague_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_must_change BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  
  -- Check password lock
  SELECT must_change_password INTO v_must_change FROM "User" WHERE id::uuid = auth.uid();
  IF v_must_change = true THEN RETURN; END IF;
  
  RETURN QUERY
  SELECT uc2.user_id::uuid
  FROM "UserCompany" uc1
  JOIN "UserCompany" uc2 ON uc1.company_id = uc2.company_id
  WHERE uc1.user_id::uuid = auth.uid();
END;
$$;

-- 2. Fix infinite recursion in select_User by removing the inline NOT EXISTS and restoring colleague sharing
DROP POLICY IF EXISTS "select_User" ON "User";
CREATE POLICY "select_User" ON "User"
  FOR SELECT TO authenticated
  USING (
    id::uuid = auth.uid() 
    OR is_current_user_super_admin() 
    OR id::uuid IN (SELECT get_shared_colleague_ids())
  );
