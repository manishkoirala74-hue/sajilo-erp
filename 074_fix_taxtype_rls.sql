-- ==============================================================================
-- 074_fix_taxtype_rls.sql
-- Hardens the TaxType RLS policy by splitting READ and WRITE operations,
-- and utilizes native scalar functions to eliminate Type-Mismatch errors 
-- between UUID and TEXT, while preventing privilege escalation.
-- ==============================================================================

-- 1. Drop the flawed, legacy policies
DROP POLICY IF EXISTS "company_isolation" ON "public"."TaxType";
DROP POLICY IF EXISTS "select_TaxType" ON "public"."TaxType";
DROP POLICY IF EXISTS "insert_TaxType" ON "public"."TaxType";
DROP POLICY IF EXISTS "update_TaxType" ON "public"."TaxType";
DROP POLICY IF EXISTS "delete_TaxType" ON "public"."TaxType";

-- 2. READ: All authenticated members of the company can view Tax Types (for UI dropdowns)
CREATE POLICY "select_TaxType" ON "public"."TaxType"
  FOR SELECT TO authenticated
  USING (
    is_current_user_super_admin() 
    OR company_id = ANY(get_user_company_ids())
  );

-- 3. INSERT/UPDATE/DELETE: Strictly limited to Tenant Admins or Super Admins
CREATE POLICY "insert_TaxType" ON "public"."TaxType"
  FOR INSERT TO authenticated
  WITH CHECK (
    is_current_user_super_admin() 
    OR is_tenant_admin_for_company(company_id)
  );

CREATE POLICY "update_TaxType" ON "public"."TaxType"
  FOR UPDATE TO authenticated
  USING (
    is_current_user_super_admin() OR is_tenant_admin_for_company(company_id)
  )
  WITH CHECK (
    is_current_user_super_admin() OR is_tenant_admin_for_company(company_id)
  );

CREATE POLICY "delete_TaxType" ON "public"."TaxType"
  FOR DELETE TO authenticated
  USING (
    is_current_user_super_admin() OR is_tenant_admin_for_company(company_id)
  );
