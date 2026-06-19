-- ============================================================================
-- 040_fix_all_rls_admin_bypass.sql
-- Complete New-User Tenant Isolation Fix
--
-- PROBLEM:
--   Every business table has a fatal RLS bypass:
--     USING ( EXISTS(SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin') OR ... )
--   This grants ANY admin — including brand-new signups — full read/write access
--   across ALL tenants, completely defeating multi-tenancy isolation.
--
-- SOLUTION:
--   1. Add `is_super_admin` boolean to "User" table.
--      Only users with this flag see cross-tenant data (platform maintenance).
--   2. Remove the `role = 'admin'` bypass from every business table.
--   3. New RLS rule for all business tables:
--        super_admin  → sees everything
--        regular user → sees only their company's data (via UserCompany)
--   4. User table  → scoped to own row + colleagues in same company
--   5. UserCompany → scoped to own company memberships
--   6. Company     → scoped to linked companies only
-- ============================================================================

-- ============================================================================
-- STEP 1: Add is_super_admin flag to User table
-- ============================================================================
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- STEP 2: Reusable helper view for super-admin check
-- (Used inline in policies for performance — Supabase evaluates per-row)
-- ============================================================================

-- ============================================================================
-- STEP 3: Fix "User" table RLS
-- New rule:
--   SELECT → own row  OR  colleagues in same company  OR  super_admin
--   INSERT → self-registration (id = auth.uid()) OR admin in a company
--   UPDATE → own row only (profile edit)
--   DELETE → own row only OR super_admin
-- ============================================================================
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "User";
DROP POLICY IF EXISTS "select_User" ON "User";
DROP POLICY IF EXISTS "insert_User" ON "User";
DROP POLICY IF EXISTS "update_User" ON "User";
DROP POLICY IF EXISTS "delete_User" ON "User";

CREATE POLICY "select_User" ON "User"
  FOR SELECT TO authenticated
  USING (
    -- Super admin sees all users
    EXISTS (SELECT 1 FROM "User" u WHERE u.id = auth.uid() AND u.is_super_admin = true)
    -- Own profile
    OR id = auth.uid()
    -- Colleagues in any shared company (for Users & Roles settings page)
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
    -- Super admin can create any user
    EXISTS (SELECT 1 FROM "User" u WHERE u.id = auth.uid() AND u.is_super_admin = true)
    -- Self-registration (new signup creating their own profile)
    OR id = auth.uid()
    -- Admin creating a sub-user within their company
    -- (allows creating user rows for invited users)
    OR EXISTS (
      SELECT 1 FROM "UserCompany" WHERE user_id::uuid = auth.uid()
    )
  );

CREATE POLICY "update_User" ON "User"
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "User" u WHERE u.id = auth.uid() AND u.is_super_admin = true)
    OR id = auth.uid()
    -- Admins in same company can update user profiles
    OR id::uuid IN (
      SELECT uc2.user_id::uuid
      FROM "UserCompany" uc1
      JOIN "UserCompany" uc2 ON uc1.company_id = uc2.company_id
      WHERE uc1.user_id::uuid = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "User" u WHERE u.id = auth.uid() AND u.is_super_admin = true)
    OR id = auth.uid()
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
    EXISTS (SELECT 1 FROM "User" u WHERE u.id = auth.uid() AND u.is_super_admin = true)
    OR id = auth.uid()
  );

-- ============================================================================
-- STEP 4: Fix "Company" table RLS
-- ============================================================================
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "Company";
DROP POLICY IF EXISTS "select_Company" ON "Company";
DROP POLICY IF EXISTS "insert_Company" ON "Company";
DROP POLICY IF EXISTS "update_Company" ON "Company";
DROP POLICY IF EXISTS "delete_Company" ON "Company";

CREATE POLICY "select_Company" ON "Company"
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND is_super_admin = true)
    OR id IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid = auth.uid())
  );

-- Any authenticated user can create a new company (they immediately get linked via UserCompany)
CREATE POLICY "insert_Company" ON "Company"
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "update_Company" ON "Company"
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND is_super_admin = true)
    OR id IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND is_super_admin = true)
    OR id IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid = auth.uid())
  );

CREATE POLICY "delete_Company" ON "Company"
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND is_super_admin = true)
    OR id IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid = auth.uid())
  );

-- ============================================================================
-- STEP 5: Fix "UserCompany" table RLS
-- ============================================================================
ALTER TABLE "UserCompany" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "UserCompany";
DROP POLICY IF EXISTS "select_UserCompany" ON "UserCompany";
DROP POLICY IF EXISTS "insert_UserCompany" ON "UserCompany";
DROP POLICY IF EXISTS "update_UserCompany" ON "UserCompany";
DROP POLICY IF EXISTS "delete_UserCompany" ON "UserCompany";

-- Users can see all UserCompany rows for companies they belong to
-- (needed so admins can list staff in their company)
CREATE POLICY "select_UserCompany" ON "UserCompany"
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND is_super_admin = true)
    OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid = auth.uid())
    OR user_id::uuid = auth.uid()
  );

-- Allow: self-linking (first company creation) OR admin adding user to their company
CREATE POLICY "insert_UserCompany" ON "UserCompany"
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND is_super_admin = true)
    OR user_id::uuid = auth.uid()
    OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid = auth.uid())
  );

CREATE POLICY "update_UserCompany" ON "UserCompany"
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND is_super_admin = true)
    OR user_id::uuid = auth.uid()
    OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND is_super_admin = true)
    OR user_id::uuid = auth.uid()
    OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid = auth.uid())
  );

CREATE POLICY "delete_UserCompany" ON "UserCompany"
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND is_super_admin = true)
    OR user_id::uuid = auth.uid()
    OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid = auth.uid())
  );

-- ============================================================================
-- STEP 6: Fix all business tables — remove role = 'admin' bypass
-- New pattern: super_admin OR UserCompany membership
-- ============================================================================

-- Helper macro pattern (repeated per table):
--   USING (
--     EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND is_super_admin = true)
--     OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid = auth.uid())
--   )

-- ---------- AssetComplianceSchedule ----------
DROP POLICY IF EXISTS "select_AssetComplianceSchedule" ON "AssetComplianceSchedule";
DROP POLICY IF EXISTS "insert_AssetComplianceSchedule" ON "AssetComplianceSchedule";
DROP POLICY IF EXISTS "update_AssetComplianceSchedule" ON "AssetComplianceSchedule";
DROP POLICY IF EXISTS "delete_AssetComplianceSchedule" ON "AssetComplianceSchedule";
CREATE POLICY "select_AssetComplianceSchedule" ON "AssetComplianceSchedule" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_AssetComplianceSchedule" ON "AssetComplianceSchedule" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_AssetComplianceSchedule" ON "AssetComplianceSchedule" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_AssetComplianceSchedule" ON "AssetComplianceSchedule" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- BankAccount ----------
DROP POLICY IF EXISTS "select_BankAccount" ON "BankAccount";
DROP POLICY IF EXISTS "insert_BankAccount" ON "BankAccount";
DROP POLICY IF EXISTS "update_BankAccount" ON "BankAccount";
DROP POLICY IF EXISTS "delete_BankAccount" ON "BankAccount";
CREATE POLICY "select_BankAccount" ON "BankAccount" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_BankAccount" ON "BankAccount" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_BankAccount" ON "BankAccount" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_BankAccount" ON "BankAccount" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- BusinessPartner ----------
DROP POLICY IF EXISTS "select_BusinessPartner" ON "BusinessPartner";
DROP POLICY IF EXISTS "insert_BusinessPartner" ON "BusinessPartner";
DROP POLICY IF EXISTS "update_BusinessPartner" ON "BusinessPartner";
DROP POLICY IF EXISTS "delete_BusinessPartner" ON "BusinessPartner";
CREATE POLICY "select_BusinessPartner" ON "BusinessPartner" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_BusinessPartner" ON "BusinessPartner" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_BusinessPartner" ON "BusinessPartner" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_BusinessPartner" ON "BusinessPartner" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- ChartOfAccount ----------
DROP POLICY IF EXISTS "select_ChartOfAccount" ON "ChartOfAccount";
DROP POLICY IF EXISTS "insert_ChartOfAccount" ON "ChartOfAccount";
DROP POLICY IF EXISTS "update_ChartOfAccount" ON "ChartOfAccount";
DROP POLICY IF EXISTS "delete_ChartOfAccount" ON "ChartOfAccount";
CREATE POLICY "select_ChartOfAccount" ON "ChartOfAccount" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_ChartOfAccount" ON "ChartOfAccount" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_ChartOfAccount" ON "ChartOfAccount" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_ChartOfAccount" ON "ChartOfAccount" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- CompanySettings ----------
DROP POLICY IF EXISTS "select_CompanySettings" ON "CompanySettings";
DROP POLICY IF EXISTS "insert_CompanySettings" ON "CompanySettings";
DROP POLICY IF EXISTS "update_CompanySettings" ON "CompanySettings";
DROP POLICY IF EXISTS "delete_CompanySettings" ON "CompanySettings";
CREATE POLICY "select_CompanySettings" ON "CompanySettings" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_CompanySettings" ON "CompanySettings" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_CompanySettings" ON "CompanySettings" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_CompanySettings" ON "CompanySettings" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- DepreciationSchedule ----------
DROP POLICY IF EXISTS "select_DepreciationSchedule" ON "DepreciationSchedule";
DROP POLICY IF EXISTS "insert_DepreciationSchedule" ON "DepreciationSchedule";
DROP POLICY IF EXISTS "update_DepreciationSchedule" ON "DepreciationSchedule";
DROP POLICY IF EXISTS "delete_DepreciationSchedule" ON "DepreciationSchedule";
CREATE POLICY "select_DepreciationSchedule" ON "DepreciationSchedule" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_DepreciationSchedule" ON "DepreciationSchedule" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_DepreciationSchedule" ON "DepreciationSchedule" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_DepreciationSchedule" ON "DepreciationSchedule" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- DiscountScheme ----------
DROP POLICY IF EXISTS "select_DiscountScheme" ON "DiscountScheme";
DROP POLICY IF EXISTS "insert_DiscountScheme" ON "DiscountScheme";
DROP POLICY IF EXISTS "update_DiscountScheme" ON "DiscountScheme";
DROP POLICY IF EXISTS "delete_DiscountScheme" ON "DiscountScheme";
CREATE POLICY "select_DiscountScheme" ON "DiscountScheme" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_DiscountScheme" ON "DiscountScheme" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_DiscountScheme" ON "DiscountScheme" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_DiscountScheme" ON "DiscountScheme" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- Employee ----------
DROP POLICY IF EXISTS "select_Employee" ON "Employee";
DROP POLICY IF EXISTS "insert_Employee" ON "Employee";
DROP POLICY IF EXISTS "update_Employee" ON "Employee";
DROP POLICY IF EXISTS "delete_Employee" ON "Employee";
CREATE POLICY "select_Employee" ON "Employee" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_Employee" ON "Employee" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_Employee" ON "Employee" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_Employee" ON "Employee" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- FinancialVoucher ----------
DROP POLICY IF EXISTS "select_FinancialVoucher" ON "FinancialVoucher";
DROP POLICY IF EXISTS "insert_FinancialVoucher" ON "FinancialVoucher";
DROP POLICY IF EXISTS "update_FinancialVoucher" ON "FinancialVoucher";
DROP POLICY IF EXISTS "delete_FinancialVoucher" ON "FinancialVoucher";
CREATE POLICY "select_FinancialVoucher" ON "FinancialVoucher" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_FinancialVoucher" ON "FinancialVoucher" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_FinancialVoucher" ON "FinancialVoucher" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_FinancialVoucher" ON "FinancialVoucher" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- FinancialVoucherDeleteLog ----------
DROP POLICY IF EXISTS "select_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog";
DROP POLICY IF EXISTS "insert_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog";
DROP POLICY IF EXISTS "update_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog";
DROP POLICY IF EXISTS "delete_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog";
CREATE POLICY "select_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- FixedAsset ----------
DROP POLICY IF EXISTS "select_FixedAsset" ON "FixedAsset";
DROP POLICY IF EXISTS "insert_FixedAsset" ON "FixedAsset";
DROP POLICY IF EXISTS "update_FixedAsset" ON "FixedAsset";
DROP POLICY IF EXISTS "delete_FixedAsset" ON "FixedAsset";
CREATE POLICY "select_FixedAsset" ON "FixedAsset" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_FixedAsset" ON "FixedAsset" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_FixedAsset" ON "FixedAsset" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_FixedAsset" ON "FixedAsset" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- FixedAssetDeleteLog ----------
DROP POLICY IF EXISTS "select_FixedAssetDeleteLog" ON "FixedAssetDeleteLog";
DROP POLICY IF EXISTS "insert_FixedAssetDeleteLog" ON "FixedAssetDeleteLog";
DROP POLICY IF EXISTS "update_FixedAssetDeleteLog" ON "FixedAssetDeleteLog";
DROP POLICY IF EXISTS "delete_FixedAssetDeleteLog" ON "FixedAssetDeleteLog";
CREATE POLICY "select_FixedAssetDeleteLog" ON "FixedAssetDeleteLog" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_FixedAssetDeleteLog" ON "FixedAssetDeleteLog" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_FixedAssetDeleteLog" ON "FixedAssetDeleteLog" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_FixedAssetDeleteLog" ON "FixedAssetDeleteLog" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- GeneralLedgerJournal ----------
DROP POLICY IF EXISTS "select_GeneralLedgerJournal" ON "GeneralLedgerJournal";
DROP POLICY IF EXISTS "insert_GeneralLedgerJournal" ON "GeneralLedgerJournal";
DROP POLICY IF EXISTS "update_GeneralLedgerJournal" ON "GeneralLedgerJournal";
DROP POLICY IF EXISTS "delete_GeneralLedgerJournal" ON "GeneralLedgerJournal";
CREATE POLICY "select_GeneralLedgerJournal" ON "GeneralLedgerJournal" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_GeneralLedgerJournal" ON "GeneralLedgerJournal" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_GeneralLedgerJournal" ON "GeneralLedgerJournal" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_GeneralLedgerJournal" ON "GeneralLedgerJournal" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- GeneralLedgerLine ----------
DROP POLICY IF EXISTS "select_GeneralLedgerLine" ON "GeneralLedgerLine";
DROP POLICY IF EXISTS "insert_GeneralLedgerLine" ON "GeneralLedgerLine";
DROP POLICY IF EXISTS "update_GeneralLedgerLine" ON "GeneralLedgerLine";
DROP POLICY IF EXISTS "delete_GeneralLedgerLine" ON "GeneralLedgerLine";
CREATE POLICY "select_GeneralLedgerLine" ON "GeneralLedgerLine" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_GeneralLedgerLine" ON "GeneralLedgerLine" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_GeneralLedgerLine" ON "GeneralLedgerLine" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_GeneralLedgerLine" ON "GeneralLedgerLine" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- Item ----------
DROP POLICY IF EXISTS "select_Item" ON "Item";
DROP POLICY IF EXISTS "insert_Item" ON "Item";
DROP POLICY IF EXISTS "update_Item" ON "Item";
DROP POLICY IF EXISTS "delete_Item" ON "Item";
CREATE POLICY "select_Item" ON "Item" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_Item" ON "Item" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_Item" ON "Item" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_Item" ON "Item" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- ItemCategory ----------
DROP POLICY IF EXISTS "select_ItemCategory" ON "ItemCategory";
DROP POLICY IF EXISTS "insert_ItemCategory" ON "ItemCategory";
DROP POLICY IF EXISTS "update_ItemCategory" ON "ItemCategory";
DROP POLICY IF EXISTS "delete_ItemCategory" ON "ItemCategory";
CREATE POLICY "select_ItemCategory" ON "ItemCategory" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_ItemCategory" ON "ItemCategory" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_ItemCategory" ON "ItemCategory" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_ItemCategory" ON "ItemCategory" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- ItemDeleteLog ----------
DROP POLICY IF EXISTS "select_ItemDeleteLog" ON "ItemDeleteLog";
DROP POLICY IF EXISTS "insert_ItemDeleteLog" ON "ItemDeleteLog";
DROP POLICY IF EXISTS "update_ItemDeleteLog" ON "ItemDeleteLog";
DROP POLICY IF EXISTS "delete_ItemDeleteLog" ON "ItemDeleteLog";
CREATE POLICY "select_ItemDeleteLog" ON "ItemDeleteLog" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_ItemDeleteLog" ON "ItemDeleteLog" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_ItemDeleteLog" ON "ItemDeleteLog" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_ItemDeleteLog" ON "ItemDeleteLog" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- ItemImportLog ----------
DROP POLICY IF EXISTS "select_ItemImportLog" ON "ItemImportLog";
DROP POLICY IF EXISTS "insert_ItemImportLog" ON "ItemImportLog";
DROP POLICY IF EXISTS "update_ItemImportLog" ON "ItemImportLog";
DROP POLICY IF EXISTS "delete_ItemImportLog" ON "ItemImportLog";
CREATE POLICY "select_ItemImportLog" ON "ItemImportLog" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_ItemImportLog" ON "ItemImportLog" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_ItemImportLog" ON "ItemImportLog" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_ItemImportLog" ON "ItemImportLog" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- ManufacturingOrder ----------
DROP POLICY IF EXISTS "select_ManufacturingOrder" ON "ManufacturingOrder";
DROP POLICY IF EXISTS "insert_ManufacturingOrder" ON "ManufacturingOrder";
DROP POLICY IF EXISTS "update_ManufacturingOrder" ON "ManufacturingOrder";
DROP POLICY IF EXISTS "delete_ManufacturingOrder" ON "ManufacturingOrder";
CREATE POLICY "select_ManufacturingOrder" ON "ManufacturingOrder" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_ManufacturingOrder" ON "ManufacturingOrder" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_ManufacturingOrder" ON "ManufacturingOrder" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_ManufacturingOrder" ON "ManufacturingOrder" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- OpeningBalanceLog ----------
DROP POLICY IF EXISTS "select_OpeningBalanceLog" ON "OpeningBalanceLog";
DROP POLICY IF EXISTS "insert_OpeningBalanceLog" ON "OpeningBalanceLog";
DROP POLICY IF EXISTS "update_OpeningBalanceLog" ON "OpeningBalanceLog";
DROP POLICY IF EXISTS "delete_OpeningBalanceLog" ON "OpeningBalanceLog";
CREATE POLICY "select_OpeningBalanceLog" ON "OpeningBalanceLog" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_OpeningBalanceLog" ON "OpeningBalanceLog" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_OpeningBalanceLog" ON "OpeningBalanceLog" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_OpeningBalanceLog" ON "OpeningBalanceLog" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- PartnerDeleteLog ----------
DROP POLICY IF EXISTS "select_PartnerDeleteLog" ON "PartnerDeleteLog";
DROP POLICY IF EXISTS "insert_PartnerDeleteLog" ON "PartnerDeleteLog";
DROP POLICY IF EXISTS "update_PartnerDeleteLog" ON "PartnerDeleteLog";
DROP POLICY IF EXISTS "delete_PartnerDeleteLog" ON "PartnerDeleteLog";
CREATE POLICY "select_PartnerDeleteLog" ON "PartnerDeleteLog" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_PartnerDeleteLog" ON "PartnerDeleteLog" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_PartnerDeleteLog" ON "PartnerDeleteLog" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_PartnerDeleteLog" ON "PartnerDeleteLog" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- PartnerImportLog ----------
DROP POLICY IF EXISTS "select_PartnerImportLog" ON "PartnerImportLog";
DROP POLICY IF EXISTS "insert_PartnerImportLog" ON "PartnerImportLog";
DROP POLICY IF EXISTS "update_PartnerImportLog" ON "PartnerImportLog";
DROP POLICY IF EXISTS "delete_PartnerImportLog" ON "PartnerImportLog";
CREATE POLICY "select_PartnerImportLog" ON "PartnerImportLog" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_PartnerImportLog" ON "PartnerImportLog" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_PartnerImportLog" ON "PartnerImportLog" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_PartnerImportLog" ON "PartnerImportLog" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- PayrollRun ----------
DROP POLICY IF EXISTS "select_PayrollRun" ON "PayrollRun";
DROP POLICY IF EXISTS "insert_PayrollRun" ON "PayrollRun";
DROP POLICY IF EXISTS "update_PayrollRun" ON "PayrollRun";
DROP POLICY IF EXISTS "delete_PayrollRun" ON "PayrollRun";
CREATE POLICY "select_PayrollRun" ON "PayrollRun" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_PayrollRun" ON "PayrollRun" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_PayrollRun" ON "PayrollRun" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_PayrollRun" ON "PayrollRun" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- POSSale ----------
DROP POLICY IF EXISTS "select_POSSale" ON "POSSale";
DROP POLICY IF EXISTS "insert_POSSale" ON "POSSale";
DROP POLICY IF EXISTS "update_POSSale" ON "POSSale";
DROP POLICY IF EXISTS "delete_POSSale" ON "POSSale";
CREATE POLICY "select_POSSale" ON "POSSale" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_POSSale" ON "POSSale" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_POSSale" ON "POSSale" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_POSSale" ON "POSSale" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- PurchaseInvoice ----------
DROP POLICY IF EXISTS "select_PurchaseInvoice" ON "PurchaseInvoice";
DROP POLICY IF EXISTS "insert_PurchaseInvoice" ON "PurchaseInvoice";
DROP POLICY IF EXISTS "update_PurchaseInvoice" ON "PurchaseInvoice";
DROP POLICY IF EXISTS "delete_PurchaseInvoice" ON "PurchaseInvoice";
CREATE POLICY "select_PurchaseInvoice" ON "PurchaseInvoice" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_PurchaseInvoice" ON "PurchaseInvoice" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_PurchaseInvoice" ON "PurchaseInvoice" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_PurchaseInvoice" ON "PurchaseInvoice" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- PurchaseOrder ----------
DROP POLICY IF EXISTS "select_PurchaseOrder" ON "PurchaseOrder";
DROP POLICY IF EXISTS "insert_PurchaseOrder" ON "PurchaseOrder";
DROP POLICY IF EXISTS "update_PurchaseOrder" ON "PurchaseOrder";
DROP POLICY IF EXISTS "delete_PurchaseOrder" ON "PurchaseOrder";
CREATE POLICY "select_PurchaseOrder" ON "PurchaseOrder" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_PurchaseOrder" ON "PurchaseOrder" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_PurchaseOrder" ON "PurchaseOrder" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_PurchaseOrder" ON "PurchaseOrder" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- PurchaseReturn ----------
DROP POLICY IF EXISTS "select_PurchaseReturn" ON "PurchaseReturn";
DROP POLICY IF EXISTS "insert_PurchaseReturn" ON "PurchaseReturn";
DROP POLICY IF EXISTS "update_PurchaseReturn" ON "PurchaseReturn";
DROP POLICY IF EXISTS "delete_PurchaseReturn" ON "PurchaseReturn";
CREATE POLICY "select_PurchaseReturn" ON "PurchaseReturn" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_PurchaseReturn" ON "PurchaseReturn" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_PurchaseReturn" ON "PurchaseReturn" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_PurchaseReturn" ON "PurchaseReturn" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- Quotation ----------
DROP POLICY IF EXISTS "select_Quotation" ON "Quotation";
DROP POLICY IF EXISTS "insert_Quotation" ON "Quotation";
DROP POLICY IF EXISTS "update_Quotation" ON "Quotation";
DROP POLICY IF EXISTS "delete_Quotation" ON "Quotation";
CREATE POLICY "select_Quotation" ON "Quotation" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_Quotation" ON "Quotation" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_Quotation" ON "Quotation" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_Quotation" ON "Quotation" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- SalesInvoice ----------
DROP POLICY IF EXISTS "select_SalesInvoice" ON "SalesInvoice";
DROP POLICY IF EXISTS "insert_SalesInvoice" ON "SalesInvoice";
DROP POLICY IF EXISTS "update_SalesInvoice" ON "SalesInvoice";
DROP POLICY IF EXISTS "delete_SalesInvoice" ON "SalesInvoice";
CREATE POLICY "select_SalesInvoice" ON "SalesInvoice" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_SalesInvoice" ON "SalesInvoice" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_SalesInvoice" ON "SalesInvoice" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_SalesInvoice" ON "SalesInvoice" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- SalesOrder ----------
DROP POLICY IF EXISTS "select_SalesOrder" ON "SalesOrder";
DROP POLICY IF EXISTS "insert_SalesOrder" ON "SalesOrder";
DROP POLICY IF EXISTS "update_SalesOrder" ON "SalesOrder";
DROP POLICY IF EXISTS "delete_SalesOrder" ON "SalesOrder";
CREATE POLICY "select_SalesOrder" ON "SalesOrder" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_SalesOrder" ON "SalesOrder" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_SalesOrder" ON "SalesOrder" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_SalesOrder" ON "SalesOrder" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- SalesReturn ----------
DROP POLICY IF EXISTS "select_SalesReturn" ON "SalesReturn";
DROP POLICY IF EXISTS "insert_SalesReturn" ON "SalesReturn";
DROP POLICY IF EXISTS "update_SalesReturn" ON "SalesReturn";
DROP POLICY IF EXISTS "delete_SalesReturn" ON "SalesReturn";
CREATE POLICY "select_SalesReturn" ON "SalesReturn" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_SalesReturn" ON "SalesReturn" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_SalesReturn" ON "SalesReturn" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_SalesReturn" ON "SalesReturn" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- ServiceContract ----------
DROP POLICY IF EXISTS "select_ServiceContract" ON "ServiceContract";
DROP POLICY IF EXISTS "insert_ServiceContract" ON "ServiceContract";
DROP POLICY IF EXISTS "update_ServiceContract" ON "ServiceContract";
DROP POLICY IF EXISTS "delete_ServiceContract" ON "ServiceContract";
CREATE POLICY "select_ServiceContract" ON "ServiceContract" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_ServiceContract" ON "ServiceContract" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_ServiceContract" ON "ServiceContract" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_ServiceContract" ON "ServiceContract" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- StockAdjustment ----------
DROP POLICY IF EXISTS "select_StockAdjustment" ON "StockAdjustment";
DROP POLICY IF EXISTS "insert_StockAdjustment" ON "StockAdjustment";
DROP POLICY IF EXISTS "update_StockAdjustment" ON "StockAdjustment";
DROP POLICY IF EXISTS "delete_StockAdjustment" ON "StockAdjustment";
CREATE POLICY "select_StockAdjustment" ON "StockAdjustment" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_StockAdjustment" ON "StockAdjustment" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_StockAdjustment" ON "StockAdjustment" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_StockAdjustment" ON "StockAdjustment" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- UnitOfMeasure ----------
DROP POLICY IF EXISTS "select_UnitOfMeasure" ON "UnitOfMeasure";
DROP POLICY IF EXISTS "insert_UnitOfMeasure" ON "UnitOfMeasure";
DROP POLICY IF EXISTS "update_UnitOfMeasure" ON "UnitOfMeasure";
DROP POLICY IF EXISTS "delete_UnitOfMeasure" ON "UnitOfMeasure";
CREATE POLICY "select_UnitOfMeasure" ON "UnitOfMeasure" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_UnitOfMeasure" ON "UnitOfMeasure" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_UnitOfMeasure" ON "UnitOfMeasure" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_UnitOfMeasure" ON "UnitOfMeasure" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ============================================================================
-- STEP 7: Fix tables from additional migrations
-- ============================================================================

-- ---------- FiscalYear (from migration_add_fiscal_year.sql) ----------
DROP POLICY IF EXISTS "select_FiscalYear" ON "FiscalYear";
DROP POLICY IF EXISTS "insert_FiscalYear" ON "FiscalYear";
DROP POLICY IF EXISTS "update_FiscalYear" ON "FiscalYear";
DROP POLICY IF EXISTS "delete_FiscalYear" ON "FiscalYear";
CREATE POLICY "select_FiscalYear" ON "FiscalYear" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_FiscalYear" ON "FiscalYear" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_FiscalYear" ON "FiscalYear" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_FiscalYear" ON "FiscalYear" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- VoucherSequence (from migration_fiscal_engine.sql) ----------
DROP POLICY IF EXISTS "all_VoucherSequence" ON "VoucherSequence";
DROP POLICY IF EXISTS "select_VoucherSequence" ON "VoucherSequence";
DROP POLICY IF EXISTS "insert_VoucherSequence" ON "VoucherSequence";
DROP POLICY IF EXISTS "update_VoucherSequence" ON "VoucherSequence";
DROP POLICY IF EXISTS "delete_VoucherSequence" ON "VoucherSequence";
CREATE POLICY "select_VoucherSequence" ON "VoucherSequence" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_VoucherSequence" ON "VoucherSequence" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_VoucherSequence" ON "VoucherSequence" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_VoucherSequence" ON "VoucherSequence" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- CompanyCommunicationSetting (from 033_communication_framework.sql) ----------
DROP POLICY IF EXISTS "select_CompanyCommunicationSetting" ON "CompanyCommunicationSetting";
DROP POLICY IF EXISTS "insert_CompanyCommunicationSetting" ON "CompanyCommunicationSetting";
DROP POLICY IF EXISTS "update_CompanyCommunicationSetting" ON "CompanyCommunicationSetting";
DROP POLICY IF EXISTS "delete_CompanyCommunicationSetting" ON "CompanyCommunicationSetting";
-- Also drop any unnamed policies from 033 migration
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "CompanyCommunicationSetting";
CREATE POLICY "select_CompanyCommunicationSetting" ON "CompanyCommunicationSetting" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_CompanyCommunicationSetting" ON "CompanyCommunicationSetting" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_CompanyCommunicationSetting" ON "CompanyCommunicationSetting" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_CompanyCommunicationSetting" ON "CompanyCommunicationSetting" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- CommunicationOutbox (from 033_communication_framework.sql) ----------
DROP POLICY IF EXISTS "select_CommunicationOutbox" ON "CommunicationOutbox";
DROP POLICY IF EXISTS "insert_CommunicationOutbox" ON "CommunicationOutbox";
DROP POLICY IF EXISTS "update_CommunicationOutbox" ON "CommunicationOutbox";
DROP POLICY IF EXISTS "delete_CommunicationOutbox" ON "CommunicationOutbox";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "CommunicationOutbox";
CREATE POLICY "select_CommunicationOutbox" ON "CommunicationOutbox" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_CommunicationOutbox" ON "CommunicationOutbox" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_CommunicationOutbox" ON "CommunicationOutbox" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_CommunicationOutbox" ON "CommunicationOutbox" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- PayrollRunDetail (from migration_hr_payroll_engine.sql) ----------
DROP POLICY IF EXISTS "all_PayrollRunDetail" ON "PayrollRunDetail";
DROP POLICY IF EXISTS "select_PayrollRunDetail" ON "PayrollRunDetail";
DROP POLICY IF EXISTS "insert_PayrollRunDetail" ON "PayrollRunDetail";
DROP POLICY IF EXISTS "update_PayrollRunDetail" ON "PayrollRunDetail";
DROP POLICY IF EXISTS "delete_PayrollRunDetail" ON "PayrollRunDetail";
CREATE POLICY "select_PayrollRunDetail" ON "PayrollRunDetail" FOR SELECT USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "insert_PayrollRunDetail" ON "PayrollRunDetail" FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "update_PayrollRunDetail" ON "PayrollRunDetail" FOR UPDATE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())) WITH CHECK (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));
CREATE POLICY "delete_PayrollRunDetail" ON "PayrollRunDetail" FOR DELETE USING (EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true) OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid()));

-- ---------- CompanyRole (from 019_rbac_engine.sql) ----------
-- Global templates (company_id IS NULL) are visible to all authenticated users
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "CompanyRole";
DROP POLICY IF EXISTS "select_CompanyRole" ON "CompanyRole";
DROP POLICY IF EXISTS "insert_CompanyRole" ON "CompanyRole";
DROP POLICY IF EXISTS "update_CompanyRole" ON "CompanyRole";
DROP POLICY IF EXISTS "delete_CompanyRole" ON "CompanyRole";
CREATE POLICY "select_CompanyRole" ON "CompanyRole" FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR company_id IS NULL  -- global templates visible to everyone
  OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
);
CREATE POLICY "insert_CompanyRole" ON "CompanyRole" FOR INSERT TO authenticated WITH CHECK (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
);
CREATE POLICY "update_CompanyRole" ON "CompanyRole" FOR UPDATE TO authenticated USING (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
) WITH CHECK (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
);
CREATE POLICY "delete_CompanyRole" ON "CompanyRole" FOR DELETE TO authenticated USING (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
);

-- ---------- UserPermissionOverride (from 019_rbac_engine.sql) ----------
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "UserPermissionOverride";
DROP POLICY IF EXISTS "select_UserPermissionOverride" ON "UserPermissionOverride";
DROP POLICY IF EXISTS "insert_UserPermissionOverride" ON "UserPermissionOverride";
DROP POLICY IF EXISTS "update_UserPermissionOverride" ON "UserPermissionOverride";
DROP POLICY IF EXISTS "delete_UserPermissionOverride" ON "UserPermissionOverride";
CREATE POLICY "select_UserPermissionOverride" ON "UserPermissionOverride" FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR user_id = auth.uid()
  OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
);
CREATE POLICY "insert_UserPermissionOverride" ON "UserPermissionOverride" FOR INSERT TO authenticated WITH CHECK (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
);
CREATE POLICY "update_UserPermissionOverride" ON "UserPermissionOverride" FOR UPDATE TO authenticated USING (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
) WITH CHECK (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
);
CREATE POLICY "delete_UserPermissionOverride" ON "UserPermissionOverride" FOR DELETE TO authenticated USING (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
);

-- ---------- SalesInvoiceLine / PurchaseInvoiceLine (from 029_fix_rls_item_history.sql) ----------
DROP POLICY IF EXISTS "select_SalesInvoiceLine" ON "SalesInvoiceLine";
DROP POLICY IF EXISTS "select_PurchaseInvoiceLine" ON "PurchaseInvoiceLine";
CREATE POLICY "select_SalesInvoiceLine" ON "SalesInvoiceLine" FOR SELECT USING (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
);
CREATE POLICY "select_PurchaseInvoiceLine" ON "PurchaseInvoiceLine" FOR SELECT USING (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR company_id::uuid IN (SELECT company_id::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
);

-- ---------- SystemSupportTicket (from 034_help_support_system.sql) ----------
-- Already correctly scoped to UserCompany — just add super_admin bypass
DROP POLICY IF EXISTS "Users can view tickets for their company" ON "SystemSupportTicket";
DROP POLICY IF EXISTS "Users can insert tickets for their company" ON "SystemSupportTicket";
CREATE POLICY "select_SystemSupportTicket" ON "SystemSupportTicket" FOR SELECT USING (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR company_id::uuid IN (SELECT company_id::uuid::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
);
CREATE POLICY "insert_SystemSupportTicket" ON "SystemSupportTicket" FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM "User" WHERE id::uuid=auth.uid() AND is_super_admin=true)
  OR (
    company_id::uuid IN (SELECT company_id::uuid::uuid FROM "UserCompany" WHERE user_id::uuid::uuid=auth.uid())
    AND user_id = auth.uid()
  )
);

-- ============================================================================
-- STEP 8: Grant your personal account super admin access
-- Replace 'your-email@example.com' with your actual Supabase Auth email.
-- ============================================================================
UPDATE "User"
SET is_super_admin = true
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'manishkoirala74@gmail.com'
);

-- ============================================================================
-- DONE.
-- After running this migration:
--   1. New users will see zero data until they create and link to a company
--   2. Existing users continue to see only their linked companies' data
--   3. Your super admin account sees all data for platform maintenance
-- ============================================================================
