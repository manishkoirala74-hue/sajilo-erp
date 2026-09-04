-- Up Migration: Enable ON DELETE CASCADE for all accurate tables

-- STEP 0: Patch Anti-Tamper Trigger to respect maintenance_mode
CREATE OR REPLACE FUNCTION trg_gl_journal_anti_tamper()
RETURNS TRIGGER AS $$
DECLARE
    v_maintenance_mode TEXT;
BEGIN
    BEGIN
        v_maintenance_mode := current_setting('sajilo.maintenance_mode', true);
    EXCEPTION WHEN OTHERS THEN
        v_maintenance_mode := 'false';
    END;
    
    IF v_maintenance_mode = 'true' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'Posted' THEN
        RAISE EXCEPTION 'Append-Only Ledger Violation: Cannot delete a Posted journal entry.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- STEP 1: Purge orphaned data
-- Since the database previously lacked rigid foreign keys, there may be orphaned child rows
-- pointing to deleted companies. We must delete them before Postgres will allow the constraints.

DO $$
BEGIN
  -- Bypass Kernel Governance triggers for system accounts and tampered journals
  PERFORM set_config('sajilo.maintenance_mode', 'true', true);

  DELETE FROM "report_archive" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "pending_ledger_recalculations" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "system_recalculation_logs" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "CompanyRole" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "UserPermissionOverride" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "SalesInvoiceLine" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "PurchaseInvoiceLine" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "CompanyCommunicationSetting" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "CommunicationOutbox" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "SystemSupportTicket" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "ItemPriceRevisionLog" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "VoucherSequence" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "PayrollRunDetail" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "DocumentTemplate" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "DocumentAttachment" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "Godown" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "InventoryLedger" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "CurrentStock" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "StockAssembly" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "StockTransfer" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "DailyMetricsRollup" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "DocumentSequence" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "ConstructionProject" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "DeliveryChallan" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "DeliveryChallanLine" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "InventoryHistory" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "FiscalYear" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "TaxType" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "AssetComplianceSchedule" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "BankAccount" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "BusinessPartner" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "ChartOfAccount" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "CompanySettings" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "DepreciationSchedule" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "DiscountScheme" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "Employee" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "FinancialVoucher" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "FinancialVoucherDeleteLog" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "FixedAsset" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "FixedAssetDeleteLog" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "GeneralLedgerJournal" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "GeneralLedgerLine" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "Item" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "ItemCategory" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "ItemDeleteLog" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "ItemImportLog" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "ManufacturingOrder" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "OpeningBalanceLog" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "PartnerDeleteLog" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "PartnerImportLog" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "PayrollRun" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "POSSale" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "PurchaseInvoice" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "PurchaseOrder" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "PurchaseReturn" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "Quotation" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "SalesInvoice" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "SalesOrder" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "SalesReturn" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "ServiceContract" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "StockAdjustment" WHERE company_id NOT IN (SELECT id FROM "Company");
  DELETE FROM "UnitOfMeasure" WHERE company_id NOT IN (SELECT id FROM "Company");
END;
$$;

-- STEP 2: Apply Cascading Foreign Keys

ALTER TABLE "report_archive" DROP CONSTRAINT IF EXISTS "report_archive_company_id_fkey";
ALTER TABLE "report_archive" ADD CONSTRAINT "report_archive_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "pending_ledger_recalculations" DROP CONSTRAINT IF EXISTS "pending_ledger_recalculations_company_id_fkey";
ALTER TABLE "pending_ledger_recalculations" ADD CONSTRAINT "pending_ledger_recalculations_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "system_recalculation_logs" DROP CONSTRAINT IF EXISTS "system_recalculation_logs_company_id_fkey";
ALTER TABLE "system_recalculation_logs" ADD CONSTRAINT "system_recalculation_logs_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "CompanyRole" DROP CONSTRAINT IF EXISTS "CompanyRole_company_id_fkey";
ALTER TABLE "CompanyRole" ADD CONSTRAINT "CompanyRole_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "UserPermissionOverride" DROP CONSTRAINT IF EXISTS "UserPermissionOverride_company_id_fkey";
ALTER TABLE "UserPermissionOverride" ADD CONSTRAINT "UserPermissionOverride_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "SalesInvoiceLine" DROP CONSTRAINT IF EXISTS "SalesInvoiceLine_company_id_fkey";
ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT "SalesInvoiceLine_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PurchaseInvoiceLine" DROP CONSTRAINT IF EXISTS "PurchaseInvoiceLine_company_id_fkey";
ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT "PurchaseInvoiceLine_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "CompanyCommunicationSetting" DROP CONSTRAINT IF EXISTS "CompanyCommunicationSetting_company_id_fkey";
ALTER TABLE "CompanyCommunicationSetting" ADD CONSTRAINT "CompanyCommunicationSetting_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "CommunicationOutbox" DROP CONSTRAINT IF EXISTS "CommunicationOutbox_company_id_fkey";
ALTER TABLE "CommunicationOutbox" ADD CONSTRAINT "CommunicationOutbox_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "SystemSupportTicket" DROP CONSTRAINT IF EXISTS "SystemSupportTicket_company_id_fkey";
ALTER TABLE "SystemSupportTicket" ADD CONSTRAINT "SystemSupportTicket_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ItemPriceRevisionLog" DROP CONSTRAINT IF EXISTS "ItemPriceRevisionLog_company_id_fkey";
ALTER TABLE "ItemPriceRevisionLog" ADD CONSTRAINT "ItemPriceRevisionLog_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "VoucherSequence" DROP CONSTRAINT IF EXISTS "VoucherSequence_company_id_fkey";
ALTER TABLE "VoucherSequence" ADD CONSTRAINT "VoucherSequence_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PayrollRunDetail" DROP CONSTRAINT IF EXISTS "PayrollRunDetail_company_id_fkey";
ALTER TABLE "PayrollRunDetail" ADD CONSTRAINT "PayrollRunDetail_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "DocumentTemplate" DROP CONSTRAINT IF EXISTS "DocumentTemplate_company_id_fkey";
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "DocumentAttachment" DROP CONSTRAINT IF EXISTS "DocumentAttachment_company_id_fkey";
ALTER TABLE "DocumentAttachment" ADD CONSTRAINT "DocumentAttachment_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Godown" DROP CONSTRAINT IF EXISTS "Godown_company_id_fkey";
ALTER TABLE "Godown" ADD CONSTRAINT "Godown_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "InventoryLedger" DROP CONSTRAINT IF EXISTS "InventoryLedger_company_id_fkey";
ALTER TABLE "InventoryLedger" ADD CONSTRAINT "InventoryLedger_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "CurrentStock" DROP CONSTRAINT IF EXISTS "CurrentStock_company_id_fkey";
ALTER TABLE "CurrentStock" ADD CONSTRAINT "CurrentStock_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "StockAssembly" DROP CONSTRAINT IF EXISTS "StockAssembly_company_id_fkey";
ALTER TABLE "StockAssembly" ADD CONSTRAINT "StockAssembly_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "StockTransfer" DROP CONSTRAINT IF EXISTS "StockTransfer_company_id_fkey";
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "DailyMetricsRollup" DROP CONSTRAINT IF EXISTS "DailyMetricsRollup_company_id_fkey";
ALTER TABLE "DailyMetricsRollup" ADD CONSTRAINT "DailyMetricsRollup_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "DocumentSequence" DROP CONSTRAINT IF EXISTS "DocumentSequence_company_id_fkey";
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ConstructionProject" DROP CONSTRAINT IF EXISTS "ConstructionProject_company_id_fkey";
ALTER TABLE "ConstructionProject" ADD CONSTRAINT "ConstructionProject_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "DeliveryChallan" DROP CONSTRAINT IF EXISTS "DeliveryChallan_company_id_fkey";
ALTER TABLE "DeliveryChallan" ADD CONSTRAINT "DeliveryChallan_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "DeliveryChallanLine" DROP CONSTRAINT IF EXISTS "DeliveryChallanLine_company_id_fkey";
ALTER TABLE "DeliveryChallanLine" ADD CONSTRAINT "DeliveryChallanLine_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "InventoryHistory" DROP CONSTRAINT IF EXISTS "InventoryHistory_company_id_fkey";
ALTER TABLE "InventoryHistory" ADD CONSTRAINT "InventoryHistory_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "FiscalYear" DROP CONSTRAINT IF EXISTS "FiscalYear_company_id_fkey";
ALTER TABLE "FiscalYear" ADD CONSTRAINT "FiscalYear_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "TaxType" DROP CONSTRAINT IF EXISTS "TaxType_company_id_fkey";
ALTER TABLE "TaxType" ADD CONSTRAINT "TaxType_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "AssetComplianceSchedule" DROP CONSTRAINT IF EXISTS "AssetComplianceSchedule_company_id_fkey";
ALTER TABLE "AssetComplianceSchedule" ADD CONSTRAINT "AssetComplianceSchedule_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "BankAccount" DROP CONSTRAINT IF EXISTS "BankAccount_company_id_fkey";
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "BusinessPartner" DROP CONSTRAINT IF EXISTS "BusinessPartner_company_id_fkey";
ALTER TABLE "BusinessPartner" ADD CONSTRAINT "BusinessPartner_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ChartOfAccount" DROP CONSTRAINT IF EXISTS "ChartOfAccount_company_id_fkey";
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "CompanySettings" DROP CONSTRAINT IF EXISTS "CompanySettings_company_id_fkey";
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "DepreciationSchedule" DROP CONSTRAINT IF EXISTS "DepreciationSchedule_company_id_fkey";
ALTER TABLE "DepreciationSchedule" ADD CONSTRAINT "DepreciationSchedule_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "DiscountScheme" DROP CONSTRAINT IF EXISTS "DiscountScheme_company_id_fkey";
ALTER TABLE "DiscountScheme" ADD CONSTRAINT "DiscountScheme_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Employee" DROP CONSTRAINT IF EXISTS "Employee_company_id_fkey";
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "FinancialVoucher" DROP CONSTRAINT IF EXISTS "FinancialVoucher_company_id_fkey";
ALTER TABLE "FinancialVoucher" ADD CONSTRAINT "FinancialVoucher_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "FinancialVoucherDeleteLog" DROP CONSTRAINT IF EXISTS "FinancialVoucherDeleteLog_company_id_fkey";
ALTER TABLE "FinancialVoucherDeleteLog" ADD CONSTRAINT "FinancialVoucherDeleteLog_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "FixedAsset" DROP CONSTRAINT IF EXISTS "FixedAsset_company_id_fkey";
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "FixedAssetDeleteLog" DROP CONSTRAINT IF EXISTS "FixedAssetDeleteLog_company_id_fkey";
ALTER TABLE "FixedAssetDeleteLog" ADD CONSTRAINT "FixedAssetDeleteLog_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "GeneralLedgerJournal" DROP CONSTRAINT IF EXISTS "GeneralLedgerJournal_company_id_fkey";
ALTER TABLE "GeneralLedgerJournal" ADD CONSTRAINT "GeneralLedgerJournal_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "GeneralLedgerLine" DROP CONSTRAINT IF EXISTS "GeneralLedgerLine_company_id_fkey";
ALTER TABLE "GeneralLedgerLine" ADD CONSTRAINT "GeneralLedgerLine_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Item" DROP CONSTRAINT IF EXISTS "Item_company_id_fkey";
ALTER TABLE "Item" ADD CONSTRAINT "Item_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ItemCategory" DROP CONSTRAINT IF EXISTS "ItemCategory_company_id_fkey";
ALTER TABLE "ItemCategory" ADD CONSTRAINT "ItemCategory_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ItemDeleteLog" DROP CONSTRAINT IF EXISTS "ItemDeleteLog_company_id_fkey";
ALTER TABLE "ItemDeleteLog" ADD CONSTRAINT "ItemDeleteLog_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ItemImportLog" DROP CONSTRAINT IF EXISTS "ItemImportLog_company_id_fkey";
ALTER TABLE "ItemImportLog" ADD CONSTRAINT "ItemImportLog_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ManufacturingOrder" DROP CONSTRAINT IF EXISTS "ManufacturingOrder_company_id_fkey";
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "OpeningBalanceLog" DROP CONSTRAINT IF EXISTS "OpeningBalanceLog_company_id_fkey";
ALTER TABLE "OpeningBalanceLog" ADD CONSTRAINT "OpeningBalanceLog_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PartnerDeleteLog" DROP CONSTRAINT IF EXISTS "PartnerDeleteLog_company_id_fkey";
ALTER TABLE "PartnerDeleteLog" ADD CONSTRAINT "PartnerDeleteLog_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PartnerImportLog" DROP CONSTRAINT IF EXISTS "PartnerImportLog_company_id_fkey";
ALTER TABLE "PartnerImportLog" ADD CONSTRAINT "PartnerImportLog_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PayrollRun" DROP CONSTRAINT IF EXISTS "PayrollRun_company_id_fkey";
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "POSSale" DROP CONSTRAINT IF EXISTS "POSSale_company_id_fkey";
ALTER TABLE "POSSale" ADD CONSTRAINT "POSSale_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PurchaseInvoice" DROP CONSTRAINT IF EXISTS "PurchaseInvoice_company_id_fkey";
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PurchaseOrder" DROP CONSTRAINT IF EXISTS "PurchaseOrder_company_id_fkey";
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "PurchaseReturn" DROP CONSTRAINT IF EXISTS "PurchaseReturn_company_id_fkey";
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "Quotation" DROP CONSTRAINT IF EXISTS "Quotation_company_id_fkey";
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "SalesInvoice" DROP CONSTRAINT IF EXISTS "SalesInvoice_company_id_fkey";
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "SalesOrder" DROP CONSTRAINT IF EXISTS "SalesOrder_company_id_fkey";
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "SalesReturn" DROP CONSTRAINT IF EXISTS "SalesReturn_company_id_fkey";
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "ServiceContract" DROP CONSTRAINT IF EXISTS "ServiceContract_company_id_fkey";
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "StockAdjustment" DROP CONSTRAINT IF EXISTS "StockAdjustment_company_id_fkey";
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
ALTER TABLE "UnitOfMeasure" DROP CONSTRAINT IF EXISTS "UnitOfMeasure_company_id_fkey";
ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_company_id_fkey" FOREIGN KEY (company_id) REFERENCES "Company"(id) ON DELETE CASCADE;
