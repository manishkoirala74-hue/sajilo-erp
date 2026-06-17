-- =========================================================================================
-- 038_ledger_hardening_core_v3.sql - AGGRESSIVE RLS HANDLING
-- =========================================================================================

BEGIN;

-- 1. DROP ALL POTENTIALLY CONFLICTING RLS POLICIES
DROP POLICY IF EXISTS "select_SalesInvoiceLine" ON "SalesInvoiceLine";
DROP POLICY IF EXISTS "select_PurchaseInvoiceLine" ON "PurchaseInvoiceLine";
DROP POLICY IF EXISTS "select_CompanyCommunicationSetting" ON "public";
DROP POLICY IF EXISTS "insert_CompanyCommunicationSetting" ON "public";
DROP POLICY IF EXISTS "update_CompanyCommunicationSetting" ON "public";
DROP POLICY IF EXISTS "delete_CompanyCommunicationSetting" ON "public";
DROP POLICY IF EXISTS "select_CommunicationOutbox" ON "public";
DROP POLICY IF EXISTS "insert_CommunicationOutbox" ON "public";
DROP POLICY IF EXISTS "update_CommunicationOutbox" ON "public";
DROP POLICY IF EXISTS "delete_CommunicationOutbox" ON "public";
DROP POLICY IF EXISTS "select_AssetComplianceSchedule" ON "AssetComplianceSchedule";
DROP POLICY IF EXISTS "insert_AssetComplianceSchedule" ON "AssetComplianceSchedule";
DROP POLICY IF EXISTS "update_AssetComplianceSchedule" ON "AssetComplianceSchedule";
DROP POLICY IF EXISTS "delete_AssetComplianceSchedule" ON "AssetComplianceSchedule";
DROP POLICY IF EXISTS "select_BankAccount" ON "BankAccount";
DROP POLICY IF EXISTS "insert_BankAccount" ON "BankAccount";
DROP POLICY IF EXISTS "update_BankAccount" ON "BankAccount";
DROP POLICY IF EXISTS "delete_BankAccount" ON "BankAccount";
DROP POLICY IF EXISTS "select_BusinessPartner" ON "BusinessPartner";
DROP POLICY IF EXISTS "insert_BusinessPartner" ON "BusinessPartner";
DROP POLICY IF EXISTS "update_BusinessPartner" ON "BusinessPartner";
DROP POLICY IF EXISTS "delete_BusinessPartner" ON "BusinessPartner";
DROP POLICY IF EXISTS "select_ChartOfAccount" ON "ChartOfAccount";
DROP POLICY IF EXISTS "insert_ChartOfAccount" ON "ChartOfAccount";
DROP POLICY IF EXISTS "update_ChartOfAccount" ON "ChartOfAccount";
DROP POLICY IF EXISTS "delete_ChartOfAccount" ON "ChartOfAccount";
DROP POLICY IF EXISTS "select_CompanySettings" ON "CompanySettings";
DROP POLICY IF EXISTS "insert_CompanySettings" ON "CompanySettings";
DROP POLICY IF EXISTS "update_CompanySettings" ON "CompanySettings";
DROP POLICY IF EXISTS "delete_CompanySettings" ON "CompanySettings";
DROP POLICY IF EXISTS "select_DepreciationSchedule" ON "DepreciationSchedule";
DROP POLICY IF EXISTS "insert_DepreciationSchedule" ON "DepreciationSchedule";
DROP POLICY IF EXISTS "update_DepreciationSchedule" ON "DepreciationSchedule";
DROP POLICY IF EXISTS "delete_DepreciationSchedule" ON "DepreciationSchedule";
DROP POLICY IF EXISTS "select_DiscountScheme" ON "DiscountScheme";
DROP POLICY IF EXISTS "insert_DiscountScheme" ON "DiscountScheme";
DROP POLICY IF EXISTS "update_DiscountScheme" ON "DiscountScheme";
DROP POLICY IF EXISTS "delete_DiscountScheme" ON "DiscountScheme";
DROP POLICY IF EXISTS "select_Employee" ON "Employee";
DROP POLICY IF EXISTS "insert_Employee" ON "Employee";
DROP POLICY IF EXISTS "update_Employee" ON "Employee";
DROP POLICY IF EXISTS "delete_Employee" ON "Employee";
DROP POLICY IF EXISTS "select_FinancialVoucher" ON "FinancialVoucher";
DROP POLICY IF EXISTS "insert_FinancialVoucher" ON "FinancialVoucher";
DROP POLICY IF EXISTS "update_FinancialVoucher" ON "FinancialVoucher";
DROP POLICY IF EXISTS "delete_FinancialVoucher" ON "FinancialVoucher";
DROP POLICY IF EXISTS "select_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog";
DROP POLICY IF EXISTS "insert_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog";
DROP POLICY IF EXISTS "update_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog";
DROP POLICY IF EXISTS "delete_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog";
DROP POLICY IF EXISTS "select_FixedAsset" ON "FixedAsset";
DROP POLICY IF EXISTS "insert_FixedAsset" ON "FixedAsset";
DROP POLICY IF EXISTS "update_FixedAsset" ON "FixedAsset";
DROP POLICY IF EXISTS "delete_FixedAsset" ON "FixedAsset";
DROP POLICY IF EXISTS "select_FixedAssetDeleteLog" ON "FixedAssetDeleteLog";
DROP POLICY IF EXISTS "insert_FixedAssetDeleteLog" ON "FixedAssetDeleteLog";
DROP POLICY IF EXISTS "update_FixedAssetDeleteLog" ON "FixedAssetDeleteLog";
DROP POLICY IF EXISTS "delete_FixedAssetDeleteLog" ON "FixedAssetDeleteLog";
DROP POLICY IF EXISTS "select_GeneralLedgerJournal" ON "GeneralLedgerJournal";
DROP POLICY IF EXISTS "insert_GeneralLedgerJournal" ON "GeneralLedgerJournal";
DROP POLICY IF EXISTS "update_GeneralLedgerJournal" ON "GeneralLedgerJournal";
DROP POLICY IF EXISTS "delete_GeneralLedgerJournal" ON "GeneralLedgerJournal";
DROP POLICY IF EXISTS "select_GeneralLedgerLine" ON "GeneralLedgerLine";
DROP POLICY IF EXISTS "insert_GeneralLedgerLine" ON "GeneralLedgerLine";
DROP POLICY IF EXISTS "update_GeneralLedgerLine" ON "GeneralLedgerLine";
DROP POLICY IF EXISTS "delete_GeneralLedgerLine" ON "GeneralLedgerLine";
DROP POLICY IF EXISTS "select_Item" ON "Item";
DROP POLICY IF EXISTS "insert_Item" ON "Item";
DROP POLICY IF EXISTS "update_Item" ON "Item";
DROP POLICY IF EXISTS "delete_Item" ON "Item";
DROP POLICY IF EXISTS "select_ItemCategory" ON "ItemCategory";
DROP POLICY IF EXISTS "insert_ItemCategory" ON "ItemCategory";
DROP POLICY IF EXISTS "update_ItemCategory" ON "ItemCategory";
DROP POLICY IF EXISTS "delete_ItemCategory" ON "ItemCategory";
DROP POLICY IF EXISTS "select_ItemDeleteLog" ON "ItemDeleteLog";
DROP POLICY IF EXISTS "insert_ItemDeleteLog" ON "ItemDeleteLog";
DROP POLICY IF EXISTS "update_ItemDeleteLog" ON "ItemDeleteLog";
DROP POLICY IF EXISTS "delete_ItemDeleteLog" ON "ItemDeleteLog";
DROP POLICY IF EXISTS "select_ItemImportLog" ON "ItemImportLog";
DROP POLICY IF EXISTS "insert_ItemImportLog" ON "ItemImportLog";
DROP POLICY IF EXISTS "update_ItemImportLog" ON "ItemImportLog";
DROP POLICY IF EXISTS "delete_ItemImportLog" ON "ItemImportLog";
DROP POLICY IF EXISTS "select_ManufacturingOrder" ON "ManufacturingOrder";
DROP POLICY IF EXISTS "insert_ManufacturingOrder" ON "ManufacturingOrder";
DROP POLICY IF EXISTS "update_ManufacturingOrder" ON "ManufacturingOrder";
DROP POLICY IF EXISTS "delete_ManufacturingOrder" ON "ManufacturingOrder";
DROP POLICY IF EXISTS "select_OpeningBalanceLog" ON "OpeningBalanceLog";
DROP POLICY IF EXISTS "insert_OpeningBalanceLog" ON "OpeningBalanceLog";
DROP POLICY IF EXISTS "update_OpeningBalanceLog" ON "OpeningBalanceLog";
DROP POLICY IF EXISTS "delete_OpeningBalanceLog" ON "OpeningBalanceLog";
DROP POLICY IF EXISTS "select_PartnerDeleteLog" ON "PartnerDeleteLog";
DROP POLICY IF EXISTS "insert_PartnerDeleteLog" ON "PartnerDeleteLog";
DROP POLICY IF EXISTS "update_PartnerDeleteLog" ON "PartnerDeleteLog";
DROP POLICY IF EXISTS "delete_PartnerDeleteLog" ON "PartnerDeleteLog";
DROP POLICY IF EXISTS "select_PartnerImportLog" ON "PartnerImportLog";
DROP POLICY IF EXISTS "insert_PartnerImportLog" ON "PartnerImportLog";
DROP POLICY IF EXISTS "update_PartnerImportLog" ON "PartnerImportLog";
DROP POLICY IF EXISTS "delete_PartnerImportLog" ON "PartnerImportLog";
DROP POLICY IF EXISTS "select_PayrollRun" ON "PayrollRun";
DROP POLICY IF EXISTS "insert_PayrollRun" ON "PayrollRun";
DROP POLICY IF EXISTS "update_PayrollRun" ON "PayrollRun";
DROP POLICY IF EXISTS "delete_PayrollRun" ON "PayrollRun";
DROP POLICY IF EXISTS "select_POSSale" ON "POSSale";
DROP POLICY IF EXISTS "insert_POSSale" ON "POSSale";
DROP POLICY IF EXISTS "update_POSSale" ON "POSSale";
DROP POLICY IF EXISTS "delete_POSSale" ON "POSSale";
DROP POLICY IF EXISTS "select_PurchaseInvoice" ON "PurchaseInvoice";
DROP POLICY IF EXISTS "insert_PurchaseInvoice" ON "PurchaseInvoice";
DROP POLICY IF EXISTS "update_PurchaseInvoice" ON "PurchaseInvoice";
DROP POLICY IF EXISTS "delete_PurchaseInvoice" ON "PurchaseInvoice";
DROP POLICY IF EXISTS "select_PurchaseOrder" ON "PurchaseOrder";
DROP POLICY IF EXISTS "insert_PurchaseOrder" ON "PurchaseOrder";
DROP POLICY IF EXISTS "update_PurchaseOrder" ON "PurchaseOrder";
DROP POLICY IF EXISTS "delete_PurchaseOrder" ON "PurchaseOrder";
DROP POLICY IF EXISTS "select_PurchaseReturn" ON "PurchaseReturn";
DROP POLICY IF EXISTS "insert_PurchaseReturn" ON "PurchaseReturn";
DROP POLICY IF EXISTS "update_PurchaseReturn" ON "PurchaseReturn";
DROP POLICY IF EXISTS "delete_PurchaseReturn" ON "PurchaseReturn";
DROP POLICY IF EXISTS "select_Quotation" ON "Quotation";
DROP POLICY IF EXISTS "insert_Quotation" ON "Quotation";
DROP POLICY IF EXISTS "update_Quotation" ON "Quotation";
DROP POLICY IF EXISTS "delete_Quotation" ON "Quotation";
DROP POLICY IF EXISTS "select_SalesInvoice" ON "SalesInvoice";
DROP POLICY IF EXISTS "insert_SalesInvoice" ON "SalesInvoice";
DROP POLICY IF EXISTS "update_SalesInvoice" ON "SalesInvoice";
DROP POLICY IF EXISTS "delete_SalesInvoice" ON "SalesInvoice";
DROP POLICY IF EXISTS "select_SalesOrder" ON "SalesOrder";
DROP POLICY IF EXISTS "insert_SalesOrder" ON "SalesOrder";
DROP POLICY IF EXISTS "update_SalesOrder" ON "SalesOrder";
DROP POLICY IF EXISTS "delete_SalesOrder" ON "SalesOrder";
DROP POLICY IF EXISTS "select_SalesReturn" ON "SalesReturn";
DROP POLICY IF EXISTS "insert_SalesReturn" ON "SalesReturn";
DROP POLICY IF EXISTS "update_SalesReturn" ON "SalesReturn";
DROP POLICY IF EXISTS "delete_SalesReturn" ON "SalesReturn";
DROP POLICY IF EXISTS "select_ServiceContract" ON "ServiceContract";
DROP POLICY IF EXISTS "insert_ServiceContract" ON "ServiceContract";
DROP POLICY IF EXISTS "update_ServiceContract" ON "ServiceContract";
DROP POLICY IF EXISTS "delete_ServiceContract" ON "ServiceContract";
DROP POLICY IF EXISTS "select_StockAdjustment" ON "StockAdjustment";
DROP POLICY IF EXISTS "insert_StockAdjustment" ON "StockAdjustment";
DROP POLICY IF EXISTS "update_StockAdjustment" ON "StockAdjustment";
DROP POLICY IF EXISTS "delete_StockAdjustment" ON "StockAdjustment";
DROP POLICY IF EXISTS "select_UnitOfMeasure" ON "UnitOfMeasure";
DROP POLICY IF EXISTS "insert_UnitOfMeasure" ON "UnitOfMeasure";
DROP POLICY IF EXISTS "update_UnitOfMeasure" ON "UnitOfMeasure";
DROP POLICY IF EXISTS "delete_UnitOfMeasure" ON "UnitOfMeasure";
DROP POLICY IF EXISTS "select_FiscalYear" ON "FiscalYear";
DROP POLICY IF EXISTS "insert_FiscalYear" ON "FiscalYear";
DROP POLICY IF EXISTS "update_FiscalYear" ON "FiscalYear";
DROP POLICY IF EXISTS "delete_FiscalYear" ON "FiscalYear";
DROP POLICY IF EXISTS "all_VoucherSequence" ON "VoucherSequence";
DROP POLICY IF EXISTS "all_PayrollRunDetail" ON "PayrollRunDetail";
DROP POLICY IF EXISTS "company_isolation" ON "TaxType";
DROP POLICY IF EXISTS "Enable all for authenticated users" ON "UserCompany";

-- 2. STRUCTURAL ALTER TABLES (TEXT -> UUID)


ALTER TABLE "GeneralLedgerLine"
  ALTER COLUMN journal_id TYPE UUID USING NULLIF(TRIM(journal_id), '')::UUID,
  ALTER COLUMN account_id TYPE UUID USING NULLIF(TRIM(account_id), '')::UUID,
  ALTER COLUMN entity_id TYPE UUID USING NULLIF(TRIM(entity_id), '')::UUID;

ALTER TABLE "GeneralLedgerJournal"
  ALTER COLUMN source_document_id TYPE UUID USING NULLIF(TRIM(source_document_id), '')::UUID;

ALTER TABLE "ChartOfAccount"
  ALTER COLUMN parent_account_id TYPE UUID USING NULLIF(TRIM(parent_account_id), '')::UUID;

ALTER TABLE "BusinessPartner"
  ALTER COLUMN receivable_account_id TYPE UUID USING NULLIF(TRIM(receivable_account_id), '')::UUID,
  ALTER COLUMN payable_account_id TYPE UUID USING NULLIF(TRIM(payable_account_id), '')::UUID;

ALTER TABLE "BankAccount"
  ALTER COLUMN gl_account_id TYPE UUID USING NULLIF(TRIM(gl_account_id), '')::UUID,
  ALTER COLUMN ledger_group_id TYPE UUID USING NULLIF(TRIM(ledger_group_id), '')::UUID;

ALTER TABLE "CompanySettings"
  ALTER COLUMN dep_factory_expense_account_id TYPE UUID USING NULLIF(TRIM(dep_factory_expense_account_id), '')::UUID,
  ALTER COLUMN dep_admin_expense_account_id TYPE UUID USING NULLIF(TRIM(dep_admin_expense_account_id), '')::UUID,
  ALTER COLUMN dep_accumulated_machinery_account_id TYPE UUID USING NULLIF(TRIM(dep_accumulated_machinery_account_id), '')::UUID,
  ALTER COLUMN dep_accumulated_office_account_id TYPE UUID USING NULLIF(TRIM(dep_accumulated_office_account_id), '')::UUID,
  ALTER COLUMN dep_accumulated_vehicle_account_id TYPE UUID USING NULLIF(TRIM(dep_accumulated_vehicle_account_id), '')::UUID,
  ALTER COLUMN gl_cash_account_id TYPE UUID USING NULLIF(TRIM(gl_cash_account_id), '')::UUID,
  ALTER COLUMN gl_bank_account_id TYPE UUID USING NULLIF(TRIM(gl_bank_account_id), '')::UUID,
  ALTER COLUMN gl_accounts_receivable_id TYPE UUID USING NULLIF(TRIM(gl_accounts_receivable_id), '')::UUID,
  ALTER COLUMN gl_accounts_payable_id TYPE UUID USING NULLIF(TRIM(gl_accounts_payable_id), '')::UUID,
  ALTER COLUMN gl_vat_payable_id TYPE UUID USING NULLIF(TRIM(gl_vat_payable_id), '')::UUID,
  ALTER COLUMN gl_sales_return_account_id TYPE UUID USING NULLIF(TRIM(gl_sales_return_account_id), '')::UUID,
  ALTER COLUMN gl_purchase_return_account_id TYPE UUID USING NULLIF(TRIM(gl_purchase_return_account_id), '')::UUID,
  ALTER COLUMN gl_default_sales_account_id TYPE UUID USING NULLIF(TRIM(gl_default_sales_account_id), '')::UUID,
  ALTER COLUMN gl_default_cogs_account_id TYPE UUID USING NULLIF(TRIM(gl_default_cogs_account_id), '')::UUID,
  ALTER COLUMN gl_default_inventory_account_id TYPE UUID USING NULLIF(TRIM(gl_default_inventory_account_id), '')::UUID,
  ALTER COLUMN gl_stock_variance_account_id TYPE UUID USING NULLIF(TRIM(gl_stock_variance_account_id), '')::UUID,
  ALTER COLUMN gl_opening_equity_account_id TYPE UUID USING NULLIF(TRIM(gl_opening_equity_account_id), '')::UUID,
  ALTER COLUMN gl_customer_ledger_group_id TYPE UUID USING NULLIF(TRIM(gl_customer_ledger_group_id), '')::UUID,
  ALTER COLUMN gl_supplier_ledger_group_id TYPE UUID USING NULLIF(TRIM(gl_supplier_ledger_group_id), '')::UUID,
  ALTER COLUMN gl_dual_ledger_group_id TYPE UUID USING NULLIF(TRIM(gl_dual_ledger_group_id), '')::UUID;

ALTER TABLE "UserCompany"
  ALTER COLUMN user_id TYPE UUID USING NULLIF(TRIM(user_id), '')::UUID,
  ALTER COLUMN company_id TYPE UUID USING NULLIF(TRIM(company_id), '')::UUID;

ALTER TABLE "Item"
  ALTER COLUMN category_id TYPE UUID USING NULLIF(TRIM(category_id), '')::UUID,
  ALTER COLUMN purchase_account_id TYPE UUID USING NULLIF(TRIM(purchase_account_id), '')::UUID,
  ALTER COLUMN sales_account_id TYPE UUID USING NULLIF(TRIM(sales_account_id), '')::UUID,
  ALTER COLUMN inventory_account_id TYPE UUID USING NULLIF(TRIM(inventory_account_id), '')::UUID,
  ALTER COLUMN discount_scheme_id TYPE UUID USING NULLIF(TRIM(discount_scheme_id), '')::UUID;

ALTER TABLE "ItemCategory"
  ALTER COLUMN parent_category_id TYPE UUID USING NULLIF(TRIM(parent_category_id), '')::UUID,
  ALTER COLUMN purchase_account_id TYPE UUID USING NULLIF(TRIM(purchase_account_id), '')::UUID,
  ALTER COLUMN sales_account_id TYPE UUID USING NULLIF(TRIM(sales_account_id), '')::UUID,
  ALTER COLUMN discount_scheme_id TYPE UUID USING NULLIF(TRIM(discount_scheme_id), '')::UUID;

ALTER TABLE "DiscountScheme"
  ALTER COLUMN item_id TYPE UUID USING NULLIF(TRIM(item_id), '')::UUID,
  ALTER COLUMN category_id TYPE UUID USING NULLIF(TRIM(category_id), '')::UUID;

ALTER TABLE "SalesInvoice"
  ALTER COLUMN customer_id TYPE UUID USING NULLIF(TRIM(customer_id), '')::UUID,
  ALTER COLUMN sales_order_id TYPE UUID USING NULLIF(TRIM(sales_order_id), '')::UUID;

ALTER TABLE "SalesReturn"
  ALTER COLUMN customer_id TYPE UUID USING NULLIF(TRIM(customer_id), '')::UUID,
  ALTER COLUMN sales_invoice_id TYPE UUID USING NULLIF(TRIM(sales_invoice_id), '')::UUID,
  ALTER COLUMN pos_sale_id TYPE UUID USING NULLIF(TRIM(pos_sale_id), '')::UUID;

ALTER TABLE "SalesOrder"
  ALTER COLUMN customer_id TYPE UUID USING NULLIF(TRIM(customer_id), '')::UUID;

ALTER TABLE "POSSale"
  ALTER COLUMN customer_id TYPE UUID USING NULLIF(TRIM(customer_id), '')::UUID;

ALTER TABLE "Quotation"
  ALTER COLUMN customer_id TYPE UUID USING NULLIF(TRIM(customer_id), '')::UUID,
  ALTER COLUMN converted_to_order_id TYPE UUID USING NULLIF(TRIM(converted_to_order_id), '')::UUID,
  ALTER COLUMN converted_to_invoice_id TYPE UUID USING NULLIF(TRIM(converted_to_invoice_id), '')::UUID;

ALTER TABLE "PurchaseInvoice"
  ALTER COLUMN vendor_id TYPE UUID USING NULLIF(TRIM(vendor_id), '')::UUID,
  ALTER COLUMN po_reference_id TYPE UUID USING NULLIF(TRIM(po_reference_id), '')::UUID;

ALTER TABLE "PurchaseReturn"
  ALTER COLUMN vendor_id TYPE UUID USING NULLIF(TRIM(vendor_id), '')::UUID,
  ALTER COLUMN purchase_invoice_id TYPE UUID USING NULLIF(TRIM(purchase_invoice_id), '')::UUID;

ALTER TABLE "PurchaseOrder"
  ALTER COLUMN vendor_id TYPE UUID USING NULLIF(TRIM(vendor_id), '')::UUID;

ALTER TABLE "SalesInvoiceLine"
  ALTER COLUMN item_id TYPE UUID USING NULLIF(TRIM(item_id), '')::UUID;

ALTER TABLE "PurchaseInvoiceLine"
  ALTER COLUMN item_id TYPE UUID USING NULLIF(TRIM(item_id), '')::UUID;

ALTER TABLE "ManufacturingOrder"
  ALTER COLUMN product_item_id TYPE UUID USING NULLIF(TRIM(product_item_id), '')::UUID;

ALTER TABLE "FinancialVoucher"
  ALTER COLUMN contact_id TYPE UUID USING NULLIF(TRIM(contact_id), '')::UUID;

ALTER TABLE "FixedAsset"
  ALTER COLUMN parent_asset_id TYPE UUID USING NULLIF(TRIM(parent_asset_id), '')::UUID,
  ALTER COLUMN asset_ledger_id TYPE UUID USING NULLIF(TRIM(asset_ledger_id), '')::UUID,
  ALTER COLUMN accumulated_dep_ledger_id TYPE UUID USING NULLIF(TRIM(accumulated_dep_ledger_id), '')::UUID,
  ALTER COLUMN dep_expense_ledger_id TYPE UUID USING NULLIF(TRIM(dep_expense_ledger_id), '')::UUID,
  ALTER COLUMN payment_account_id TYPE UUID USING NULLIF(TRIM(payment_account_id), '')::UUID;

ALTER TABLE "AssetComplianceSchedule"
  ALTER COLUMN asset_id TYPE UUID USING NULLIF(TRIM(asset_id), '')::UUID;

ALTER TABLE "DepreciationSchedule"
  ALTER COLUMN asset_id TYPE UUID USING NULLIF(TRIM(asset_id), '')::UUID;

ALTER TABLE "FinancialVoucherDeleteLog"
  ALTER COLUMN voucher_id TYPE UUID USING NULLIF(TRIM(voucher_id), '')::UUID;

ALTER TABLE "ItemDeleteLog"
  ALTER COLUMN item_id TYPE UUID USING NULLIF(TRIM(item_id), '')::UUID;

ALTER TABLE "PartnerDeleteLog"
  ALTER COLUMN partner_id TYPE UUID USING NULLIF(TRIM(partner_id), '')::UUID;

ALTER TABLE "FixedAssetDeleteLog"
  ALTER COLUMN asset_id TYPE UUID USING NULLIF(TRIM(asset_id), '')::UUID;

ALTER TABLE "OpeningBalanceLog"
  ALTER COLUMN account_id TYPE UUID USING NULLIF(TRIM(account_id), '')::UUID;

-- Adding Strict Foreign Key Constraints for Core Ledger
ALTER TABLE "GeneralLedgerLine"
  ADD CONSTRAINT fk_gll_journal FOREIGN KEY (journal_id) REFERENCES "GeneralLedgerJournal"(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_gll_account FOREIGN KEY (account_id) REFERENCES "ChartOfAccount"(id) ON DELETE RESTRICT;


-- 3. RECREATE RLS POLICIES
CREATE POLICY "select_SalesInvoiceLine" ON "SalesInvoiceLine"  
FOR SELECT 
USING (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))
);
CREATE POLICY "select_PurchaseInvoiceLine" ON "PurchaseInvoiceLine"  
FOR SELECT 
USING (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))
);
CREATE POLICY "select_CompanyCommunicationSetting" ON "public" ."CompanyCommunicationSetting" FOR SELECT 
USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_CompanyCommunicationSetting" ON "public" ."CompanyCommunicationSetting" FOR INSERT 
WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_CompanyCommunicationSetting" ON "public" ."CompanyCommunicationSetting" FOR UPDATE 
USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) 
WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_CompanyCommunicationSetting" ON "public" ."CompanyCommunicationSetting" FOR DELETE 
USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_CommunicationOutbox" ON "public" ."CommunicationOutbox" FOR SELECT 
USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_CommunicationOutbox" ON "public" ."CommunicationOutbox" FOR INSERT 
WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_CommunicationOutbox" ON "public" ."CommunicationOutbox" FOR UPDATE 
USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) 
WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_CommunicationOutbox" ON "public" ."CommunicationOutbox" FOR DELETE 
USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_AssetComplianceSchedule" ON "AssetComplianceSchedule"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_AssetComplianceSchedule" ON "AssetComplianceSchedule"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_AssetComplianceSchedule" ON "AssetComplianceSchedule"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_AssetComplianceSchedule" ON "AssetComplianceSchedule"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_BankAccount" ON "BankAccount"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_BankAccount" ON "BankAccount"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_BankAccount" ON "BankAccount"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_BankAccount" ON "BankAccount"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_BusinessPartner" ON "BusinessPartner"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_BusinessPartner" ON "BusinessPartner"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_BusinessPartner" ON "BusinessPartner"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_BusinessPartner" ON "BusinessPartner"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_ChartOfAccount" ON "ChartOfAccount"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_ChartOfAccount" ON "ChartOfAccount"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_ChartOfAccount" ON "ChartOfAccount"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_ChartOfAccount" ON "ChartOfAccount"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_CompanySettings" ON "CompanySettings"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_CompanySettings" ON "CompanySettings"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_CompanySettings" ON "CompanySettings"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_CompanySettings" ON "CompanySettings"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_DepreciationSchedule" ON "DepreciationSchedule"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_DepreciationSchedule" ON "DepreciationSchedule"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_DepreciationSchedule" ON "DepreciationSchedule"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_DepreciationSchedule" ON "DepreciationSchedule"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_DiscountScheme" ON "DiscountScheme"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_DiscountScheme" ON "DiscountScheme"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_DiscountScheme" ON "DiscountScheme"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_DiscountScheme" ON "DiscountScheme"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_Employee" ON "Employee"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_Employee" ON "Employee"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_Employee" ON "Employee"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_Employee" ON "Employee"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_FinancialVoucher" ON "FinancialVoucher"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_FinancialVoucher" ON "FinancialVoucher"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_FinancialVoucher" ON "FinancialVoucher"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_FinancialVoucher" ON "FinancialVoucher"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_FinancialVoucherDeleteLog" ON "FinancialVoucherDeleteLog"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_FixedAsset" ON "FixedAsset"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_FixedAsset" ON "FixedAsset"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_FixedAsset" ON "FixedAsset"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_FixedAsset" ON "FixedAsset"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_FixedAssetDeleteLog" ON "FixedAssetDeleteLog"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_FixedAssetDeleteLog" ON "FixedAssetDeleteLog"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_FixedAssetDeleteLog" ON "FixedAssetDeleteLog"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_FixedAssetDeleteLog" ON "FixedAssetDeleteLog"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_GeneralLedgerJournal" ON "GeneralLedgerJournal"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_GeneralLedgerJournal" ON "GeneralLedgerJournal"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_GeneralLedgerJournal" ON "GeneralLedgerJournal"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_GeneralLedgerJournal" ON "GeneralLedgerJournal"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_GeneralLedgerLine" ON "GeneralLedgerLine"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_GeneralLedgerLine" ON "GeneralLedgerLine"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_GeneralLedgerLine" ON "GeneralLedgerLine"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_GeneralLedgerLine" ON "GeneralLedgerLine"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_Item" ON "Item"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_Item" ON "Item"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_Item" ON "Item"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_Item" ON "Item"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_ItemCategory" ON "ItemCategory"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_ItemCategory" ON "ItemCategory"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_ItemCategory" ON "ItemCategory"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_ItemCategory" ON "ItemCategory"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_ItemDeleteLog" ON "ItemDeleteLog"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_ItemDeleteLog" ON "ItemDeleteLog"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_ItemDeleteLog" ON "ItemDeleteLog"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_ItemDeleteLog" ON "ItemDeleteLog"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_ItemImportLog" ON "ItemImportLog"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_ItemImportLog" ON "ItemImportLog"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_ItemImportLog" ON "ItemImportLog"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_ItemImportLog" ON "ItemImportLog"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_ManufacturingOrder" ON "ManufacturingOrder"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_ManufacturingOrder" ON "ManufacturingOrder"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_ManufacturingOrder" ON "ManufacturingOrder"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_ManufacturingOrder" ON "ManufacturingOrder"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_OpeningBalanceLog" ON "OpeningBalanceLog"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_OpeningBalanceLog" ON "OpeningBalanceLog"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_OpeningBalanceLog" ON "OpeningBalanceLog"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_OpeningBalanceLog" ON "OpeningBalanceLog"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_PartnerDeleteLog" ON "PartnerDeleteLog"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_PartnerDeleteLog" ON "PartnerDeleteLog"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_PartnerDeleteLog" ON "PartnerDeleteLog"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_PartnerDeleteLog" ON "PartnerDeleteLog"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_PartnerImportLog" ON "PartnerImportLog"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_PartnerImportLog" ON "PartnerImportLog"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_PartnerImportLog" ON "PartnerImportLog"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_PartnerImportLog" ON "PartnerImportLog"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_PayrollRun" ON "PayrollRun"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_PayrollRun" ON "PayrollRun"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_PayrollRun" ON "PayrollRun"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_PayrollRun" ON "PayrollRun"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_POSSale" ON "POSSale"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_POSSale" ON "POSSale"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_POSSale" ON "POSSale"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_POSSale" ON "POSSale"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_PurchaseInvoice" ON "PurchaseInvoice"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_PurchaseInvoice" ON "PurchaseInvoice"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_PurchaseInvoice" ON "PurchaseInvoice"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_PurchaseInvoice" ON "PurchaseInvoice"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_PurchaseOrder" ON "PurchaseOrder"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_PurchaseOrder" ON "PurchaseOrder"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_PurchaseOrder" ON "PurchaseOrder"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_PurchaseOrder" ON "PurchaseOrder"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_PurchaseReturn" ON "PurchaseReturn"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_PurchaseReturn" ON "PurchaseReturn"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_PurchaseReturn" ON "PurchaseReturn"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_PurchaseReturn" ON "PurchaseReturn"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_Quotation" ON "Quotation"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_Quotation" ON "Quotation"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_Quotation" ON "Quotation"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_Quotation" ON "Quotation"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_SalesInvoice" ON "SalesInvoice"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_SalesInvoice" ON "SalesInvoice"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_SalesInvoice" ON "SalesInvoice"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_SalesInvoice" ON "SalesInvoice"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_SalesOrder" ON "SalesOrder"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_SalesOrder" ON "SalesOrder"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_SalesOrder" ON "SalesOrder"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_SalesOrder" ON "SalesOrder"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_SalesReturn" ON "SalesReturn"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_SalesReturn" ON "SalesReturn"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_SalesReturn" ON "SalesReturn"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_SalesReturn" ON "SalesReturn"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_ServiceContract" ON "ServiceContract"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_ServiceContract" ON "ServiceContract"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_ServiceContract" ON "ServiceContract"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_ServiceContract" ON "ServiceContract"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_StockAdjustment" ON "StockAdjustment"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_StockAdjustment" ON "StockAdjustment"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_StockAdjustment" ON "StockAdjustment"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_StockAdjustment" ON "StockAdjustment"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_UnitOfMeasure" ON "UnitOfMeasure"  FOR SELECT USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_UnitOfMeasure" ON "UnitOfMeasure"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_UnitOfMeasure" ON "UnitOfMeasure"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_UnitOfMeasure" ON "UnitOfMeasure"  FOR DELETE USING ((EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "select_FiscalYear" ON "FiscalYear"  FOR SELECT USING ((EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM public."UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "insert_FiscalYear" ON "FiscalYear"  FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM public."UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "update_FiscalYear" ON "FiscalYear"  FOR UPDATE USING ((EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM public."UserCompany" WHERE user_id = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM public."UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "delete_FiscalYear" ON "FiscalYear"  FOR DELETE USING ((EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT company_id FROM public."UserCompany" WHERE user_id = auth.uid())));
CREATE POLICY "all_VoucherSequence" ON "VoucherSequence"  FOR ALL USING (
  (EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT company_id FROM public."UserCompany" WHERE user_id = auth.uid()))
);
CREATE POLICY "all_PayrollRunDetail" ON "PayrollRunDetail"  FOR ALL USING (
  (EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT company_id FROM public."UserCompany" WHERE user_id = auth.uid()))
);
CREATE POLICY "company_isolation" ON "TaxType" 
  USING (
    (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin'))
    OR (company_id IN (SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()))
  );
CREATE POLICY "Enable all for authenticated users" ON "UserCompany"  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. ENFORCING BALANCED ENTRIES & ATOMICITY

-- =========================================================================================

CREATE OR REPLACE FUNCTION rpc_commit_journal_entry_internal(
    p_company_id UUID,
    p_date DATE,
    p_narration TEXT,
    p_module TEXT,
    p_source_id UUID,
    p_source_type TEXT,
    p_reference TEXT,
    p_lines JSONB
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_line JSONB;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
BEGIN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_total_debit := v_total_debit + COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_total_credit := v_total_credit + COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
    END LOOP;

    IF ABS(v_total_debit - v_total_credit) > 0.001 THEN
        RAISE EXCEPTION 'ERR_UNBALANCED_JOURNAL: Total Debit (%) does not equal Total Credit (%)', v_total_debit, v_total_credit;
    END IF;

    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, narration, reference_module, source_document_id, source_document_type, reference_number, total_amount, status
    ) VALUES (
        p_company_id, p_date, p_narration, p_module, p_source_id, p_source_type, p_reference, v_total_debit, 'Posted'
    ) RETURNING id INTO v_journal_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        IF COALESCE((v_line->>'debit_amount')::NUMERIC, 0) > 0 OR COALESCE((v_line->>'credit_amount')::NUMERIC, 0) > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                company_id, journal_id, account_id, account_category, description, debit_amount, credit_amount, entity_type, entity_id, due_date
            ) VALUES (
                p_company_id,
                v_journal_id,
                NULLIF(TRIM(v_line->>'account_id'), '')::UUID,
                v_line->>'account_category',
                v_line->>'description',
                COALESCE((v_line->>'debit_amount')::NUMERIC, 0),
                COALESCE((v_line->>'credit_amount')::NUMERIC, 0),
                v_line->>'entity_type',
                NULLIF(TRIM(v_line->>'entity_id'), '')::UUID,
                (v_line->>'due_date')::DATE
            );
        END IF;
    END LOOP;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION rpc_delete_gl_journals(p_source_id UUID, p_source_type TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM "GeneralLedgerLine" 
    WHERE journal_id IN (
        SELECT id FROM "GeneralLedgerJournal" 
        WHERE source_document_id = p_source_id 
          AND source_document_type = p_source_type
    );
    
    DELETE FROM "GeneralLedgerJournal" 
    WHERE source_document_id = p_source_id 
      AND source_document_type = p_source_type;
END;
$$;

CREATE OR REPLACE FUNCTION rpc_post_financial_voucher(
    p_company_id UUID,
    p_voucher_id UUID,
    p_idempotency_key UUID,
    p_gl_lines JSONB,
    p_is_reversal BOOLEAN DEFAULT false
) RETURNS JSONB AS $$
DECLARE
    v_journal_id UUID;
    v_voucher RECORD;
BEGIN
    SELECT * INTO v_voucher FROM "FinancialVoucher" WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_voucher.id IS NOT NULL THEN RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_voucher.gl_journal_id); END IF;

    SELECT * INTO v_voucher FROM "FinancialVoucher" WHERE id = p_voucher_id;
    
    IF p_is_reversal THEN 
        DELETE FROM "GeneralLedgerLine" 
        WHERE journal_id IN (
            SELECT id FROM "GeneralLedgerJournal" 
            WHERE source_document_id = p_voucher_id 
              AND source_document_type = 'FinancialVoucher'
        );
        
        DELETE FROM "GeneralLedgerJournal" 
        WHERE source_document_id = p_voucher_id 
          AND source_document_type = 'FinancialVoucher';
    END IF;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, 
        v_voucher.voucher_date::DATE, 
        COALESCE(v_voucher.narration, ''),
        'Vouchers', 
        p_voucher_id, 
        'FinancialVoucher', 
        COALESCE(v_voucher.voucher_number, ''), 
        p_gl_lines
    );

    UPDATE "FinancialVoucher" 
    SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = p_voucher_id;
    
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;

-- =========================================================================================
-- 3. UNIFIED REPORTING PATCHES (DYNAMIC NATIVE UUID JOINS)
-- =========================================================================================

CREATE OR REPLACE FUNCTION get_trial_balance_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
  RETURNS TABLE (
    id UUID,
    account_code TEXT,
    account_name TEXT,
    account_type TEXT,
    ledger_type TEXT,
    parent_account_id UUID,
    opening_debit NUMERIC,
    opening_credit NUMERIC,
    current_debit NUMERIC,
    current_credit NUMERIC,
    closing_debit NUMERIC,
    closing_credit NUMERIC
  ) LANGUAGE plpgsql AS $$
  BEGIN
    RETURN QUERY
    WITH account_activity AS (
      SELECT
        l.account_id,
        SUM(CASE WHEN j.entry_date::DATE < p_from_date THEN l.debit_amount ELSE 0 END) as ob_dr,
        SUM(CASE WHEN j.entry_date::DATE < p_from_date THEN l.credit_amount ELSE 0 END) as ob_cr,
        SUM(CASE WHEN j.entry_date::DATE >= p_from_date AND j.entry_date::DATE <= p_to_date THEN l.debit_amount ELSE 0 END) as cur_dr,
        SUM(CASE WHEN j.entry_date::DATE >= p_from_date AND j.entry_date::DATE <= p_to_date THEN l.credit_amount ELSE 0 END) as cur_cr
      FROM "GeneralLedgerLine" l
      JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
      WHERE j.status = 'Posted'
        AND l.company_id = p_company_id
        AND j.company_id = p_company_id
      GROUP BY l.account_id
    )
    SELECT 
      a.id,
      a.account_code,
      a.account_name,
      a.account_type,
      a.ledger_type,
      a.parent_account_id,
      
      -- Opening Balances
      CASE WHEN a.account_type IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN
        CASE WHEN (COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0)) >= 0 THEN COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0) ELSE 0 END
      ELSE
        CASE WHEN (COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0)) > 0 THEN COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0) ELSE 0 END
      END AS opening_debit,
  
      CASE WHEN a.account_type NOT IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN
        CASE WHEN (COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0)) >= 0 THEN COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0) ELSE 0 END
      ELSE
        CASE WHEN (COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0)) > 0 THEN COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0) ELSE 0 END
      END AS opening_credit,
  
      -- Current Balances
      COALESCE(aa.cur_dr, 0) AS current_debit,
      COALESCE(aa.cur_cr, 0) AS current_credit,
  
      -- Closing Balances
      CASE WHEN a.account_type IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN
        CASE WHEN ((COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0))) >= 0 
        THEN (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) ELSE 0 END
      ELSE
        CASE WHEN ((COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0))) > 0 
        THEN (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) ELSE 0 END
      END AS closing_debit,
  
      CASE WHEN a.account_type NOT IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN
        CASE WHEN ((COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) - (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0))) >= 0 
        THEN (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) - (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) ELSE 0 END
      ELSE
        CASE WHEN ((COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) - (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0))) > 0 
        THEN (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) - (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) ELSE 0 END
      END AS closing_credit
  
    FROM "ChartOfAccount" a
    LEFT JOIN account_activity aa ON a.id = aa.account_id
    WHERE a.company_id = p_company_id
      AND a.is_active = true
      AND a.ledger_type = 'Sub Ledger'
      AND a.account_code IS NOT NULL AND a.account_code != '?"'
      AND (
        COALESCE(aa.ob_dr, 0) > 0 OR COALESCE(aa.ob_cr, 0) > 0 OR 
        COALESCE(aa.cur_dr, 0) > 0 OR COALESCE(aa.cur_cr, 0) > 0
      );
  END;
  $$;

CREATE OR REPLACE FUNCTION get_sales_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
    entry_date DATE,
    voucher_no TEXT,
    net_revenue NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.entry_date,
        j.voucher_no,
        SUM(l.credit_amount) - SUM(l.debit_amount) as net_revenue
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
    JOIN "ChartOfAccount" c ON l.account_id = c.id
    WHERE c.account_type IN ('Revenue', 'Other Income')
      AND j.status = 'Posted'
      AND (p_company_id IS NULL OR j.company_id = p_company_id)
      AND (p_from_date IS NULL OR j.entry_date >= p_from_date)
      AND (p_to_date IS NULL OR j.entry_date <= p_to_date)
    GROUP BY j.entry_date, j.voucher_no
    HAVING (SUM(l.credit_amount) - SUM(l.debit_amount)) <> 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_purchase_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
    entry_date DATE,
    voucher_no TEXT,
    net_expense NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.entry_date,
        j.voucher_no,
        SUM(l.debit_amount) - SUM(l.credit_amount) as net_expense
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
    JOIN "ChartOfAccount" c ON l.account_id = c.id
    WHERE c.account_type IN ('Expense', 'Cost of Goods Sold', 'OPEX', 'Other Expense')
      AND j.status = 'Posted'
      AND (p_company_id IS NULL OR j.company_id = p_company_id)
      AND (p_from_date IS NULL OR j.entry_date >= p_from_date)
      AND (p_to_date IS NULL OR j.entry_date <= p_to_date)
    GROUP BY j.entry_date, j.voucher_no
    HAVING (SUM(l.debit_amount) - SUM(l.credit_amount)) <> 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
