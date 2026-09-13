-- 118_unified_tenant_creation_rpc_rollback.sql

DROP FUNCTION IF EXISTS public.create_new_tenant(JSONB);

-- (Assuming the rollback restores the old weakened policy from v1)
-- Or rather just the strict policy it replaced
DROP POLICY IF EXISTS "insert_UserCompany" ON "UserCompany";

CREATE POLICY "insert_UserCompany" ON "UserCompany"
  FOR INSERT TO authenticated
  WITH CHECK (
    is_current_user_super_admin()
    OR is_tenant_admin_for_company(company_id::uuid)
    OR (
        user_id::uuid = auth.uid() AND 
        EXISTS (
            SELECT 1 FROM "Company"
            WHERE id = company_id::uuid AND created_by = (auth.uid())::text
        )
    )
  );
