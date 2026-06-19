-- ============================================================================
-- 042_fix_user_rls_casts.sql
-- Fixes type-casting lockouts for User and UserCompany tables.
-- ============================================================================

-- ---------- User ----------
DROP POLICY IF EXISTS "select_User" ON "User";
DROP POLICY IF EXISTS "insert_User" ON "User";
DROP POLICY IF EXISTS "update_User" ON "User";
DROP POLICY IF EXISTS "delete_User" ON "User";

CREATE POLICY "select_User" ON "User"
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "User" u WHERE u.id::uuid = auth.uid() AND u.is_super_admin = true)
    OR id::uuid = auth.uid()
    OR id::uuid IN (
      SELECT uc2.user_id::uuid
      FROM "UserCompany" uc1
      JOIN "UserCompany" uc2 ON uc1.company_id = uc2.company_id
      WHERE uc1.user_id::uuid = auth.uid()
    )
  );

CREATE POLICY "insert_User" ON "User"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM "User" u WHERE u.id::uuid = auth.uid() AND u.is_super_admin = true)
    OR id::uuid = auth.uid()
    OR EXISTS (
      SELECT 1 FROM "UserCompany" WHERE user_id::uuid = auth.uid()
    )
  );

CREATE POLICY "update_User" ON "User"
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "User" u WHERE u.id::uuid = auth.uid() AND u.is_super_admin = true)
    OR id::uuid = auth.uid()
    OR id::uuid IN (
      SELECT uc2.user_id::uuid
      FROM "UserCompany" uc1
      JOIN "UserCompany" uc2 ON uc1.company_id = uc2.company_id
      WHERE uc1.user_id::uuid = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "User" u WHERE u.id::uuid = auth.uid() AND u.is_super_admin = true)
    OR id::uuid = auth.uid()
    OR id::uuid IN (
      SELECT uc2.user_id::uuid
      FROM "UserCompany" uc1
      JOIN "UserCompany" uc2 ON uc1.company_id = uc2.company_id
      WHERE uc1.user_id::uuid = auth.uid()
    )
  );

CREATE POLICY "delete_User" ON "User"
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "User" u WHERE u.id::uuid = auth.uid() AND u.is_super_admin = true)
    OR id::uuid = auth.uid()
  );

-- ---------- UserCompany ----------
DROP POLICY IF EXISTS "select_UserCompany" ON "UserCompany";
DROP POLICY IF EXISTS "insert_UserCompany" ON "UserCompany";
DROP POLICY IF EXISTS "update_UserCompany" ON "UserCompany";
DROP POLICY IF EXISTS "delete_UserCompany" ON "UserCompany";

CREATE POLICY "select_UserCompany" ON "UserCompany" FOR SELECT USING (user_has_company_access(company_id));
CREATE POLICY "insert_UserCompany" ON "UserCompany" FOR INSERT WITH CHECK (user_has_company_access(company_id));
CREATE POLICY "update_UserCompany" ON "UserCompany" FOR UPDATE USING (user_has_company_access(company_id)) WITH CHECK (user_has_company_access(company_id));
CREATE POLICY "delete_UserCompany" ON "UserCompany" FOR DELETE USING (user_has_company_access(company_id));
