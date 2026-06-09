-- Multi-tenant Migration Script

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS "Company" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "name" TEXT NOT NULL,
  "tax_id" TEXT,
  "registration_number" TEXT,
  "address" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "logo_url" TEXT,
  "is_active" BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for authenticated users" ON "Company";
CREATE POLICY "Enable all for authenticated users" ON "Company" FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS "UserCompany" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  "user_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "is_default" BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

ALTER TABLE "UserCompany" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for authenticated users" ON "UserCompany";
CREATE POLICY "Enable all for authenticated users" ON "UserCompany" FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add company_id to existing tables
ALTER TABLE "AssetComplianceSchedule" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "BankAccount" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "BusinessPartner" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "ChartOfAccount" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "DepreciationSchedule" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "DiscountScheme" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "FinancialVoucher" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "FinancialVoucherDeleteLog" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "FixedAsset" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "FixedAssetDeleteLog" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "GeneralLedgerJournal" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "GeneralLedgerLine" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "ItemCategory" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "ItemDeleteLog" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "ItemImportLog" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "ManufacturingOrder" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "OpeningBalanceLog" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "PartnerDeleteLog" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "PartnerImportLog" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "PayrollRun" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "POSSale" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "PurchaseInvoice" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "PurchaseReturn" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "SalesReturn" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "ServiceContract" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "StockAdjustment" ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE "UnitOfMeasure" ADD COLUMN IF NOT EXISTS company_id UUID;


-- Migrate Data: Create default company, assign to all users, and update all existing rows
DO $$
DECLARE
    default_company_id UUID;
    usr RECORD;
BEGIN
    -- Check if a company exists, otherwise create one
    SELECT id INTO default_company_id FROM "Company" LIMIT 1;
    IF default_company_id IS NULL THEN
        INSERT INTO "Company" (name) VALUES ('Default Company') RETURNING id INTO default_company_id;
    END IF;

    -- Assign all existing users to this company
    FOR usr IN SELECT id FROM "User" LOOP
        IF NOT EXISTS (SELECT 1 FROM "UserCompany" WHERE user_id = usr.id::text AND company_id = default_company_id::text) THEN
            INSERT INTO "UserCompany" (user_id, company_id, is_default) VALUES (usr.id::text, default_company_id::text, true);
        END IF;
    END LOOP;

    -- Set the company_id for all existing records
    UPDATE "AssetComplianceSchedule" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "BankAccount" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "BusinessPartner" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "ChartOfAccount" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "CompanySettings" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "DepreciationSchedule" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "DiscountScheme" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "Employee" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "FinancialVoucher" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "FinancialVoucherDeleteLog" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "FixedAsset" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "FixedAssetDeleteLog" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "GeneralLedgerJournal" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "GeneralLedgerLine" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "Item" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "ItemCategory" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "ItemDeleteLog" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "ItemImportLog" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "ManufacturingOrder" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "OpeningBalanceLog" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "PartnerDeleteLog" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "PartnerImportLog" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "PayrollRun" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "POSSale" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "PurchaseInvoice" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "PurchaseOrder" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "PurchaseReturn" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "Quotation" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "SalesInvoice" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "SalesOrder" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "SalesReturn" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "ServiceContract" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "StockAdjustment" SET company_id = default_company_id WHERE company_id IS NULL;
    UPDATE "UnitOfMeasure" SET company_id = default_company_id WHERE company_id IS NULL;

END $$;


-- Update RLS Policies
DROP POLICY IF EXISTS "select_AssetComplianceSchedule" ON "AssetComplianceSchedule";
DROP POLICY IF EXISTS "insert_AssetComplianceSchedule" ON "AssetComplianceSchedule";
DROP POLICY IF EXISTS "update_AssetComplianceSchedule" ON "AssetComplianceSchedule";
DROP POLICY IF EXISTS "delete_AssetComplianceSchedule" ON "AssetComplianceSchedule";
CREATE POLICY "select_AssetComplianceSchedule" ON "AssetComplianceSchedule" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_AssetComplianceSchedule" ON "AssetComplianceSchedule" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_AssetComplianceSchedule" ON "AssetComplianceSchedule" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_AssetComplianceSchedule" ON "AssetComplianceSchedule" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_BankAccount" ON "BankAccount";
DROP POLICY IF EXISTS "insert_BankAccount" ON "BankAccount";
DROP POLICY IF EXISTS "update_BankAccount" ON "BankAccount";
DROP POLICY IF EXISTS "delete_BankAccount" ON "BankAccount";
CREATE POLICY "select_BankAccount" ON "BankAccount" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_BankAccount" ON "BankAccount" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_BankAccount" ON "BankAccount" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_BankAccount" ON "BankAccount" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_BusinessPartner" ON "BusinessPartner";
DROP POLICY IF EXISTS "insert_BusinessPartner" ON "BusinessPartner";
DROP POLICY IF EXISTS "update_BusinessPartner" ON "BusinessPartner";
DROP POLICY IF EXISTS "delete_BusinessPartner" ON "BusinessPartner";
CREATE POLICY "select_BusinessPartner" ON "BusinessPartner" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_BusinessPartner" ON "BusinessPartner" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_BusinessPartner" ON "BusinessPartner" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_BusinessPartner" ON "BusinessPartner" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_ChartOfAccount" ON "ChartOfAccount";
DROP POLICY IF EXISTS "insert_ChartOfAccount" ON "ChartOfAccount";
DROP POLICY IF EXISTS "update_ChartOfAccount" ON "ChartOfAccount";
DROP POLICY IF EXISTS "delete_ChartOfAccount" ON "ChartOfAccount";
CREATE POLICY "select_ChartOfAccount" ON "ChartOfAccount" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_ChartOfAccount" ON "ChartOfAccount" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_ChartOfAccount" ON "ChartOfAccount" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_ChartOfAccount" ON "ChartOfAccount" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_CompanySettings" ON "CompanySettings";
DROP POLICY IF EXISTS "insert_CompanySettings" ON "CompanySettings";
DROP POLICY IF EXISTS "update_CompanySettings" ON "CompanySettings";
DROP POLICY IF EXISTS "delete_CompanySettings" ON "CompanySettings";
CREATE POLICY "select_CompanySettings" ON "CompanySettings" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_CompanySettings" ON "CompanySettings" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_CompanySettings" ON "CompanySettings" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_CompanySettings" ON "CompanySettings" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_DepreciationSchedule" ON "DepreciationSchedule";
DROP POLICY IF EXISTS "insert_DepreciationSchedule" ON "DepreciationSchedule";
DROP POLICY IF EXISTS "update_DepreciationSchedule" ON "DepreciationSchedule";
DROP POLICY IF EXISTS "delete_DepreciationSchedule" ON "DepreciationSchedule";
CREATE POLICY "select_DepreciationSchedule" ON "DepreciationSchedule" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_DepreciationSchedule" ON "DepreciationSchedule" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_DepreciationSchedule" ON "DepreciationSchedule" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_DepreciationSchedule" ON "DepreciationSchedule" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_DiscountScheme" ON "DiscountScheme";
DROP POLICY IF EXISTS "insert_DiscountScheme" ON "DiscountScheme";
DROP POLICY IF EXISTS "update_DiscountScheme" ON "DiscountScheme";
DROP POLICY IF EXISTS "delete_DiscountScheme" ON "DiscountScheme";
CREATE POLICY "select_DiscountScheme" ON "DiscountScheme" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_DiscountScheme" ON "DiscountScheme" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_DiscountScheme" ON "DiscountScheme" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_DiscountScheme" ON "DiscountScheme" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_Employee" ON "Employee";
DROP POLICY IF EXISTS "insert_Employee" ON "Employee";
DROP POLICY IF EXISTS "update_Employee" ON "Employee";
DROP POLICY IF EXISTS "delete_Employee" ON "Employee";
CREATE POLICY "select_Employee" ON "Employee" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_Employee" ON "Employee" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_Employee" ON "Employee" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_Employee" ON "Employee" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_FinancialVoucher" ON "FinancialVoucher";
DROP POLICY IF EXISTS "insert_FinancialVoucher" ON "FinancialVoucher";
DROP POLICY IF EXISTS "update_FinancialVoucher" ON "FinancialVoucher";
DROP POLICY IF EXISTS "delete_FinancialVoucher" ON "FinancialVoucher";
CREATE POLICY "select_FinancialVoucher" ON "FinancialVoucher" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_FinancialVoucher" ON "FinancialVoucher" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_FinancialVoucher" ON "FinancialVoucher" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_FinancialVoucher" ON "FinancialVoucher" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog";
DROP POLICY IF EXISTS "insert_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog";
DROP POLICY IF EXISTS "update_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog";
DROP POLICY IF EXISTS "delete_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog";
CREATE POLICY "select_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_FixedAsset" ON "FixedAsset";
DROP POLICY IF EXISTS "insert_FixedAsset" ON "FixedAsset";
DROP POLICY IF EXISTS "update_FixedAsset" ON "FixedAsset";
DROP POLICY IF EXISTS "delete_FixedAsset" ON "FixedAsset";
CREATE POLICY "select_FixedAsset" ON "FixedAsset" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_FixedAsset" ON "FixedAsset" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_FixedAsset" ON "FixedAsset" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_FixedAsset" ON "FixedAsset" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_FixedAssetDeleteLog" ON "FixedAssetDeleteLog";
DROP POLICY IF EXISTS "insert_FixedAssetDeleteLog" ON "FixedAssetDeleteLog";
DROP POLICY IF EXISTS "update_FixedAssetDeleteLog" ON "FixedAssetDeleteLog";
DROP POLICY IF EXISTS "delete_FixedAssetDeleteLog" ON "FixedAssetDeleteLog";
CREATE POLICY "select_FixedAssetDeleteLog" ON "FixedAssetDeleteLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_FixedAssetDeleteLog" ON "FixedAssetDeleteLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_FixedAssetDeleteLog" ON "FixedAssetDeleteLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_FixedAssetDeleteLog" ON "FixedAssetDeleteLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_GeneralLedgerJournal" ON "GeneralLedgerJournal";
DROP POLICY IF EXISTS "insert_GeneralLedgerJournal" ON "GeneralLedgerJournal";
DROP POLICY IF EXISTS "update_GeneralLedgerJournal" ON "GeneralLedgerJournal";
DROP POLICY IF EXISTS "delete_GeneralLedgerJournal" ON "GeneralLedgerJournal";
CREATE POLICY "select_GeneralLedgerJournal" ON "GeneralLedgerJournal" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_GeneralLedgerJournal" ON "GeneralLedgerJournal" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_GeneralLedgerJournal" ON "GeneralLedgerJournal" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_GeneralLedgerJournal" ON "GeneralLedgerJournal" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_GeneralLedgerLine" ON "GeneralLedgerLine";
DROP POLICY IF EXISTS "insert_GeneralLedgerLine" ON "GeneralLedgerLine";
DROP POLICY IF EXISTS "update_GeneralLedgerLine" ON "GeneralLedgerLine";
DROP POLICY IF EXISTS "delete_GeneralLedgerLine" ON "GeneralLedgerLine";
CREATE POLICY "select_GeneralLedgerLine" ON "GeneralLedgerLine" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_GeneralLedgerLine" ON "GeneralLedgerLine" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_GeneralLedgerLine" ON "GeneralLedgerLine" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_GeneralLedgerLine" ON "GeneralLedgerLine" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_Item" ON "Item";
DROP POLICY IF EXISTS "insert_Item" ON "Item";
DROP POLICY IF EXISTS "update_Item" ON "Item";
DROP POLICY IF EXISTS "delete_Item" ON "Item";
CREATE POLICY "select_Item" ON "Item" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_Item" ON "Item" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_Item" ON "Item" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_Item" ON "Item" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_ItemCategory" ON "ItemCategory";
DROP POLICY IF EXISTS "insert_ItemCategory" ON "ItemCategory";
DROP POLICY IF EXISTS "update_ItemCategory" ON "ItemCategory";
DROP POLICY IF EXISTS "delete_ItemCategory" ON "ItemCategory";
CREATE POLICY "select_ItemCategory" ON "ItemCategory" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_ItemCategory" ON "ItemCategory" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_ItemCategory" ON "ItemCategory" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_ItemCategory" ON "ItemCategory" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_ItemDeleteLog" ON "ItemDeleteLog";
DROP POLICY IF EXISTS "insert_ItemDeleteLog" ON "ItemDeleteLog";
DROP POLICY IF EXISTS "update_ItemDeleteLog" ON "ItemDeleteLog";
DROP POLICY IF EXISTS "delete_ItemDeleteLog" ON "ItemDeleteLog";
CREATE POLICY "select_ItemDeleteLog" ON "ItemDeleteLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_ItemDeleteLog" ON "ItemDeleteLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_ItemDeleteLog" ON "ItemDeleteLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_ItemDeleteLog" ON "ItemDeleteLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_ItemImportLog" ON "ItemImportLog";
DROP POLICY IF EXISTS "insert_ItemImportLog" ON "ItemImportLog";
DROP POLICY IF EXISTS "update_ItemImportLog" ON "ItemImportLog";
DROP POLICY IF EXISTS "delete_ItemImportLog" ON "ItemImportLog";
CREATE POLICY "select_ItemImportLog" ON "ItemImportLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_ItemImportLog" ON "ItemImportLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_ItemImportLog" ON "ItemImportLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_ItemImportLog" ON "ItemImportLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_ManufacturingOrder" ON "ManufacturingOrder";
DROP POLICY IF EXISTS "insert_ManufacturingOrder" ON "ManufacturingOrder";
DROP POLICY IF EXISTS "update_ManufacturingOrder" ON "ManufacturingOrder";
DROP POLICY IF EXISTS "delete_ManufacturingOrder" ON "ManufacturingOrder";
CREATE POLICY "select_ManufacturingOrder" ON "ManufacturingOrder" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_ManufacturingOrder" ON "ManufacturingOrder" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_ManufacturingOrder" ON "ManufacturingOrder" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_ManufacturingOrder" ON "ManufacturingOrder" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_OpeningBalanceLog" ON "OpeningBalanceLog";
DROP POLICY IF EXISTS "insert_OpeningBalanceLog" ON "OpeningBalanceLog";
DROP POLICY IF EXISTS "update_OpeningBalanceLog" ON "OpeningBalanceLog";
DROP POLICY IF EXISTS "delete_OpeningBalanceLog" ON "OpeningBalanceLog";
CREATE POLICY "select_OpeningBalanceLog" ON "OpeningBalanceLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_OpeningBalanceLog" ON "OpeningBalanceLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_OpeningBalanceLog" ON "OpeningBalanceLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_OpeningBalanceLog" ON "OpeningBalanceLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_PartnerDeleteLog" ON "PartnerDeleteLog";
DROP POLICY IF EXISTS "insert_PartnerDeleteLog" ON "PartnerDeleteLog";
DROP POLICY IF EXISTS "update_PartnerDeleteLog" ON "PartnerDeleteLog";
DROP POLICY IF EXISTS "delete_PartnerDeleteLog" ON "PartnerDeleteLog";
CREATE POLICY "select_PartnerDeleteLog" ON "PartnerDeleteLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_PartnerDeleteLog" ON "PartnerDeleteLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_PartnerDeleteLog" ON "PartnerDeleteLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_PartnerDeleteLog" ON "PartnerDeleteLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_PartnerImportLog" ON "PartnerImportLog";
DROP POLICY IF EXISTS "insert_PartnerImportLog" ON "PartnerImportLog";
DROP POLICY IF EXISTS "update_PartnerImportLog" ON "PartnerImportLog";
DROP POLICY IF EXISTS "delete_PartnerImportLog" ON "PartnerImportLog";
CREATE POLICY "select_PartnerImportLog" ON "PartnerImportLog" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_PartnerImportLog" ON "PartnerImportLog" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_PartnerImportLog" ON "PartnerImportLog" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_PartnerImportLog" ON "PartnerImportLog" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_PayrollRun" ON "PayrollRun";
DROP POLICY IF EXISTS "insert_PayrollRun" ON "PayrollRun";
DROP POLICY IF EXISTS "update_PayrollRun" ON "PayrollRun";
DROP POLICY IF EXISTS "delete_PayrollRun" ON "PayrollRun";
CREATE POLICY "select_PayrollRun" ON "PayrollRun" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_PayrollRun" ON "PayrollRun" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_PayrollRun" ON "PayrollRun" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_PayrollRun" ON "PayrollRun" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_POSSale" ON "POSSale";
DROP POLICY IF EXISTS "insert_POSSale" ON "POSSale";
DROP POLICY IF EXISTS "update_POSSale" ON "POSSale";
DROP POLICY IF EXISTS "delete_POSSale" ON "POSSale";
CREATE POLICY "select_POSSale" ON "POSSale" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_POSSale" ON "POSSale" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_POSSale" ON "POSSale" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_POSSale" ON "POSSale" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_PurchaseInvoice" ON "PurchaseInvoice";
DROP POLICY IF EXISTS "insert_PurchaseInvoice" ON "PurchaseInvoice";
DROP POLICY IF EXISTS "update_PurchaseInvoice" ON "PurchaseInvoice";
DROP POLICY IF EXISTS "delete_PurchaseInvoice" ON "PurchaseInvoice";
CREATE POLICY "select_PurchaseInvoice" ON "PurchaseInvoice" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_PurchaseInvoice" ON "PurchaseInvoice" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_PurchaseInvoice" ON "PurchaseInvoice" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_PurchaseInvoice" ON "PurchaseInvoice" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_PurchaseOrder" ON "PurchaseOrder";
DROP POLICY IF EXISTS "insert_PurchaseOrder" ON "PurchaseOrder";
DROP POLICY IF EXISTS "update_PurchaseOrder" ON "PurchaseOrder";
DROP POLICY IF EXISTS "delete_PurchaseOrder" ON "PurchaseOrder";
CREATE POLICY "select_PurchaseOrder" ON "PurchaseOrder" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_PurchaseOrder" ON "PurchaseOrder" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_PurchaseOrder" ON "PurchaseOrder" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_PurchaseOrder" ON "PurchaseOrder" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_PurchaseReturn" ON "PurchaseReturn";
DROP POLICY IF EXISTS "insert_PurchaseReturn" ON "PurchaseReturn";
DROP POLICY IF EXISTS "update_PurchaseReturn" ON "PurchaseReturn";
DROP POLICY IF EXISTS "delete_PurchaseReturn" ON "PurchaseReturn";
CREATE POLICY "select_PurchaseReturn" ON "PurchaseReturn" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_PurchaseReturn" ON "PurchaseReturn" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_PurchaseReturn" ON "PurchaseReturn" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_PurchaseReturn" ON "PurchaseReturn" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_Quotation" ON "Quotation";
DROP POLICY IF EXISTS "insert_Quotation" ON "Quotation";
DROP POLICY IF EXISTS "update_Quotation" ON "Quotation";
DROP POLICY IF EXISTS "delete_Quotation" ON "Quotation";
CREATE POLICY "select_Quotation" ON "Quotation" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_Quotation" ON "Quotation" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_Quotation" ON "Quotation" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_Quotation" ON "Quotation" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_SalesInvoice" ON "SalesInvoice";
DROP POLICY IF EXISTS "insert_SalesInvoice" ON "SalesInvoice";
DROP POLICY IF EXISTS "update_SalesInvoice" ON "SalesInvoice";
DROP POLICY IF EXISTS "delete_SalesInvoice" ON "SalesInvoice";
CREATE POLICY "select_SalesInvoice" ON "SalesInvoice" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_SalesInvoice" ON "SalesInvoice" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_SalesInvoice" ON "SalesInvoice" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_SalesInvoice" ON "SalesInvoice" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_SalesOrder" ON "SalesOrder";
DROP POLICY IF EXISTS "insert_SalesOrder" ON "SalesOrder";
DROP POLICY IF EXISTS "update_SalesOrder" ON "SalesOrder";
DROP POLICY IF EXISTS "delete_SalesOrder" ON "SalesOrder";
CREATE POLICY "select_SalesOrder" ON "SalesOrder" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_SalesOrder" ON "SalesOrder" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_SalesOrder" ON "SalesOrder" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_SalesOrder" ON "SalesOrder" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_SalesReturn" ON "SalesReturn";
DROP POLICY IF EXISTS "insert_SalesReturn" ON "SalesReturn";
DROP POLICY IF EXISTS "update_SalesReturn" ON "SalesReturn";
DROP POLICY IF EXISTS "delete_SalesReturn" ON "SalesReturn";
CREATE POLICY "select_SalesReturn" ON "SalesReturn" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_SalesReturn" ON "SalesReturn" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_SalesReturn" ON "SalesReturn" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_SalesReturn" ON "SalesReturn" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_ServiceContract" ON "ServiceContract";
DROP POLICY IF EXISTS "insert_ServiceContract" ON "ServiceContract";
DROP POLICY IF EXISTS "update_ServiceContract" ON "ServiceContract";
DROP POLICY IF EXISTS "delete_ServiceContract" ON "ServiceContract";
CREATE POLICY "select_ServiceContract" ON "ServiceContract" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_ServiceContract" ON "ServiceContract" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_ServiceContract" ON "ServiceContract" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_ServiceContract" ON "ServiceContract" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_StockAdjustment" ON "StockAdjustment";
DROP POLICY IF EXISTS "insert_StockAdjustment" ON "StockAdjustment";
DROP POLICY IF EXISTS "update_StockAdjustment" ON "StockAdjustment";
DROP POLICY IF EXISTS "delete_StockAdjustment" ON "StockAdjustment";
CREATE POLICY "select_StockAdjustment" ON "StockAdjustment" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_StockAdjustment" ON "StockAdjustment" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_StockAdjustment" ON "StockAdjustment" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_StockAdjustment" ON "StockAdjustment" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

DROP POLICY IF EXISTS "select_UnitOfMeasure" ON "UnitOfMeasure";
DROP POLICY IF EXISTS "insert_UnitOfMeasure" ON "UnitOfMeasure";
DROP POLICY IF EXISTS "update_UnitOfMeasure" ON "UnitOfMeasure";
DROP POLICY IF EXISTS "delete_UnitOfMeasure" ON "UnitOfMeasure";
CREATE POLICY "select_UnitOfMeasure" ON "UnitOfMeasure" FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_UnitOfMeasure" ON "UnitOfMeasure" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_UnitOfMeasure" ON "UnitOfMeasure" FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_UnitOfMeasure" ON "UnitOfMeasure" FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid())));

