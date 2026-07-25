-- Phase 1: Core State Machine & JWT Role Verification

-- 1. Schema Migration for FiscalYear
ALTER TABLE "FiscalYear" ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SOFT_CLOSED', 'HARD_CLOSED'));

-- Migrate existing data
UPDATE "FiscalYear" SET status = 'HARD_CLOSED' WHERE is_locked = true AND status = 'OPEN';
UPDATE "FiscalYear" SET status = 'OPEN' WHERE is_active = true AND status = 'OPEN';
UPDATE "FiscalYear" SET status = 'SOFT_CLOSED' WHERE is_locked = false AND is_active = false AND status = 'OPEN';

-- 2. Modify Gatekeeper Trigger (check_fiscal_year_bounds)
CREATE OR REPLACE FUNCTION check_fiscal_year_bounds()
RETURNS TRIGGER AS $$
DECLARE
  active_fy RECORD;
  target_date DATE;
  v_role TEXT;
BEGIN
  -- Determine the target date based on the table
  IF TG_TABLE_NAME = 'FinancialVoucher' THEN
    target_date := NEW.voucher_date;
  ELSIF TG_TABLE_NAME = 'POSSale' THEN
    target_date := NEW.sale_date;
  ELSIF TG_TABLE_NAME = 'PurchaseInvoice' THEN
    target_date := NEW.invoice_date;
  ELSIF TG_TABLE_NAME = 'SalesInvoice' THEN
    target_date := NEW.invoice_date;
  ELSE
    RETURN NEW; -- Not a restricted table
  END IF;

  -- Fetch the fiscal year that bounds this date
  SELECT * INTO active_fy FROM "FiscalYear" 
  WHERE company_id = NEW.company_id AND target_date BETWEEN start_date AND end_date LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction date % is outside any defined Fiscal Year.', target_date;
  END IF;

  -- State Machine Enforcement
  IF active_fy.status = 'HARD_CLOSED' THEN
    RAISE EXCEPTION 'Fiscal Year % is HARD_CLOSED. No transactions can be posted or modified.', active_fy.fiscal_year_name;
  ELSIF active_fy.status = 'SOFT_CLOSED' THEN
    -- Lightning-fast JWT Role Verification
    -- Get the role from the PostgREST JWT context
    v_role := current_setting('request.jwt.claims', true)::json->>'role';
    
    -- Allow bypass if we are running in a superuser/service_role context where jwt claims might be null
    -- but for standard user contexts, enforce the role check
    IF v_role IS NOT NULL AND v_role NOT IN ('admin', 'financial_controller') THEN
      RAISE EXCEPTION 'Unauthorized: Only Admins or Financial Controllers can post into a SOFT_CLOSED Fiscal Year (%)', active_fy.fiscal_year_name;
    END IF;
    
    -- Also, we might want to restrict which documents can be posted into SOFT_CLOSED.
    -- The plan explicitly permits Sales Invoices, Purchase Invoices, and Adjusting Journal Entries (FinancialVoucher).
    IF TG_TABLE_NAME NOT IN ('FinancialVoucher', 'SalesInvoice', 'PurchaseInvoice') THEN
       RAISE EXCEPTION 'Only Sales, Purchases, and Journal Entries are permitted in a SOFT_CLOSED year.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the single active fiscal year trigger to respect status = 'OPEN'
CREATE OR REPLACE FUNCTION enforce_single_active_fiscal_year()
RETURNS TRIGGER AS $$
BEGIN
  -- If we are setting this one to OPEN, ensure all others for this company are not OPEN
  -- They should technically transition to SOFT_CLOSED or remain HARD_CLOSED. 
  -- We'll just transition OPEN ones to SOFT_CLOSED.
  IF NEW.status = 'OPEN' AND (TG_OP = 'INSERT' OR OLD.status != 'OPEN') THEN
    UPDATE "FiscalYear" 
    SET status = 'SOFT_CLOSED' 
    WHERE company_id = NEW.company_id 
      AND id != NEW.id 
      AND status = 'OPEN';
  END IF;
  
  -- Maintain legacy booleans for a grace period (optional, if frontend still relies on them temporarily)
  IF NEW.status = 'OPEN' THEN
    NEW.is_active := true;
    NEW.is_locked := false;
  ELSIF NEW.status = 'SOFT_CLOSED' THEN
    NEW.is_active := false;
    NEW.is_locked := false;
  ELSIF NEW.status = 'HARD_CLOSED' THEN
    NEW.is_active := false;
    NEW.is_locked := true;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
