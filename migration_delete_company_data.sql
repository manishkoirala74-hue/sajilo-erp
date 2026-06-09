CREATE OR REPLACE FUNCTION delete_company_data(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete all operational and transactional data first
  DELETE FROM "FinancialVoucherDeleteLog" WHERE company_id::text = p_company_id::text;
  DELETE FROM "FixedAssetDeleteLog" WHERE company_id::text = p_company_id::text;
  DELETE FROM "ItemDeleteLog" WHERE company_id::text = p_company_id::text;
  DELETE FROM "PartnerDeleteLog" WHERE company_id::text = p_company_id::text;
  DELETE FROM "ItemImportLog" WHERE company_id::text = p_company_id::text;
  DELETE FROM "PartnerImportLog" WHERE company_id::text = p_company_id::text;
  DELETE FROM "OpeningBalanceLog" WHERE company_id::text = p_company_id::text;
  
  DELETE FROM "FinancialVoucher" WHERE company_id::text = p_company_id::text;
  DELETE FROM "BankAccount" WHERE company_id::text = p_company_id::text;
  DELETE FROM "POSSale" WHERE company_id::text = p_company_id::text;
  DELETE FROM "SalesReturn" WHERE company_id::text = p_company_id::text;
  DELETE FROM "SalesInvoice" WHERE company_id::text = p_company_id::text;
  DELETE FROM "SalesOrder" WHERE company_id::text = p_company_id::text;
  DELETE FROM "Quotation" WHERE company_id::text = p_company_id::text;
  DELETE FROM "PurchaseReturn" WHERE company_id::text = p_company_id::text;
  DELETE FROM "PurchaseInvoice" WHERE company_id::text = p_company_id::text;
  DELETE FROM "PurchaseOrder" WHERE company_id::text = p_company_id::text;

  DELETE FROM "StockAdjustment" WHERE company_id::text = p_company_id::text;
  DELETE FROM "ManufacturingOrder" WHERE company_id::text = p_company_id::text;
  
  DELETE FROM "DiscountScheme" WHERE company_id::text = p_company_id::text;
  DELETE FROM "Item" WHERE company_id::text = p_company_id::text;
  DELETE FROM "ItemCategory" WHERE company_id::text = p_company_id::text;
  DELETE FROM "UnitOfMeasure" WHERE company_id::text = p_company_id::text;

  DELETE FROM "BusinessPartner" WHERE company_id::text = p_company_id::text;
  
  DELETE FROM "PayrollRun" WHERE company_id::text = p_company_id::text;
  DELETE FROM "Employee" WHERE company_id::text = p_company_id::text;
  DELETE FROM "ServiceContract" WHERE company_id::text = p_company_id::text;

  DELETE FROM "AssetComplianceSchedule" WHERE company_id::text = p_company_id::text;
  DELETE FROM "DepreciationSchedule" WHERE company_id::text = p_company_id::text;
  DELETE FROM "FixedAsset" WHERE company_id::text = p_company_id::text;

  DELETE FROM "GeneralLedgerLine" WHERE company_id::text = p_company_id::text;
  DELETE FROM "GeneralLedgerJournal" WHERE company_id::text = p_company_id::text;
  
  -- Delete all Chart of Accounts entries (NO EXCEPTIONS)
  DELETE FROM "ChartOfAccount" WHERE company_id::text = p_company_id::text;

  -- Delete Settings and User associations
  DELETE FROM "CompanySettings" WHERE company_id::text = p_company_id::text;
  DELETE FROM "UserCompany" WHERE company_id::text = p_company_id::text;
  
  -- Finally, delete the Company record itself
  DELETE FROM "Company" WHERE id::text = p_company_id::text;
END;
$$;
