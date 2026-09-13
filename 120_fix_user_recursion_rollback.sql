-- 120_fix_user_recursion_rollback.sql

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

CREATE OR REPLACE FUNCTION get_shared_colleague_ids()
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  
  RETURN QUERY
  SELECT uc2.user_id::uuid
  FROM "UserCompany" uc1
  JOIN "UserCompany" uc2 ON uc1.company_id = uc2.company_id
  WHERE uc1.user_id::uuid = auth.uid();
END;
$$;
