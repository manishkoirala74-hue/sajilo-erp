-- Up Migration: Enforce Ghost Mode Trigger

CREATE OR REPLACE FUNCTION prevent_ghost_mode_mutations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO v_status FROM "Company" WHERE id = OLD.company_id;
  ELSE
    SELECT status INTO v_status FROM "Company" WHERE id = NEW.company_id;
  END IF;

  IF v_status = 'PENDING_DELETION' THEN
    RAISE EXCEPTION 'Action denied: Company is pending deletion (Ghost Mode).';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS enforce_ghost_mode ON "report_archive";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "report_archive"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "pending_ledger_recalculations";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "pending_ledger_recalculations"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "system_recalculation_logs";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "system_recalculation_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "CompanyRole";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "CompanyRole"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "UserPermissionOverride";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "UserPermissionOverride"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "SalesInvoiceLine";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "SalesInvoiceLine"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "PurchaseInvoiceLine";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "PurchaseInvoiceLine"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "CompanyCommunicationSetting";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "CompanyCommunicationSetting"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "CommunicationOutbox";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "CommunicationOutbox"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "SystemSupportTicket";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "SystemSupportTicket"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "ItemPriceRevisionLog";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "ItemPriceRevisionLog"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "VoucherSequence";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "VoucherSequence"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "PayrollRunDetail";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "PayrollRunDetail"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "DocumentTemplate";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "DocumentTemplate"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "DocumentAttachment";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "DocumentAttachment"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "Godown";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "Godown"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "InventoryLedger";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "InventoryLedger"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "CurrentStock";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "CurrentStock"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "StockAssembly";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "StockAssembly"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "StockTransfer";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "StockTransfer"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "DailyMetricsRollup";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "DailyMetricsRollup"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "DocumentSequence";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "DocumentSequence"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "ConstructionProject";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "ConstructionProject"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "DeliveryChallan";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "DeliveryChallan"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "DeliveryChallanLine";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "DeliveryChallanLine"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "InventoryHistory";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "InventoryHistory"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "FiscalYear";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "FiscalYear"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "TaxType";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "TaxType"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "AssetComplianceSchedule";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "AssetComplianceSchedule"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "BankAccount";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "BankAccount"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "BusinessPartner";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "BusinessPartner"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "ChartOfAccount";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "ChartOfAccount"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "CompanySettings";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "CompanySettings"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "DepreciationSchedule";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "DepreciationSchedule"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "DiscountScheme";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "DiscountScheme"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "Employee";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "Employee"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "FinancialVoucher";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "FinancialVoucher"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "FinancialVoucherDeleteLog";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "FinancialVoucherDeleteLog"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "FixedAsset";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "FixedAsset"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "FixedAssetDeleteLog";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "FixedAssetDeleteLog"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "GeneralLedgerJournal";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "GeneralLedgerJournal"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "GeneralLedgerLine";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "GeneralLedgerLine"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "Item";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "Item"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "ItemCategory";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "ItemCategory"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "ItemDeleteLog";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "ItemDeleteLog"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "ItemImportLog";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "ItemImportLog"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "ManufacturingOrder";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "ManufacturingOrder"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "OpeningBalanceLog";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "OpeningBalanceLog"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "PartnerDeleteLog";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "PartnerDeleteLog"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "PartnerImportLog";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "PartnerImportLog"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "PayrollRun";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "PayrollRun"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "POSSale";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "POSSale"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "PurchaseInvoice";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "PurchaseInvoice"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "PurchaseOrder";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "PurchaseOrder"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "PurchaseReturn";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "PurchaseReturn"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "Quotation";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "Quotation"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "SalesInvoice";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "SalesInvoice"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "SalesOrder";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "SalesOrder"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "SalesReturn";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "SalesReturn"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "ServiceContract";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "ServiceContract"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "StockAdjustment";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "StockAdjustment"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
DROP TRIGGER IF EXISTS enforce_ghost_mode ON "UnitOfMeasure";
CREATE TRIGGER enforce_ghost_mode
BEFORE INSERT OR UPDATE OR DELETE ON "UnitOfMeasure"
FOR EACH ROW EXECUTE FUNCTION prevent_ghost_mode_mutations();
