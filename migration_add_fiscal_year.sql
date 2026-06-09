-- 1. Create FiscalYear Table
CREATE TABLE IF NOT EXISTS "FiscalYear" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  fiscal_year_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Add RLS Policies for FiscalYear
ALTER TABLE "FiscalYear" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_FiscalYear" ON "FiscalYear" FOR SELECT USING ((EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM public."UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "insert_FiscalYear" ON "FiscalYear" FOR INSERT WITH CHECK ((EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM public."UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "update_FiscalYear" ON "FiscalYear" FOR UPDATE USING ((EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM public."UserCompany" WHERE (user_id)::uuid = auth.uid()))) WITH CHECK ((EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM public."UserCompany" WHERE (user_id)::uuid = auth.uid())));
CREATE POLICY "delete_FiscalYear" ON "FiscalYear" FOR DELETE USING ((EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR (company_id IN (SELECT (company_id)::uuid FROM public."UserCompany" WHERE (user_id)::uuid = auth.uid())));

-- 3. Trigger to ensure only one active Fiscal Year per company
CREATE OR REPLACE FUNCTION enforce_single_active_fiscal_year()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE "FiscalYear" SET is_active = false WHERE company_id = NEW.company_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER single_active_fiscal_year
BEFORE INSERT OR UPDATE ON "FiscalYear"
FOR EACH ROW EXECUTE FUNCTION enforce_single_active_fiscal_year();

-- 4. Central Date Validation Function for Gatekeeper
CREATE OR REPLACE FUNCTION check_fiscal_year_bounds()
RETURNS TRIGGER AS $$
DECLARE
  active_fy RECORD;
  target_date DATE;
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
  END IF;

  -- If no date is provided, just let it pass or fail standard NOT NULL constraints
  IF target_date IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fetch the active fiscal year for the company
  SELECT * INTO active_fy FROM "FiscalYear" WHERE company_id = NEW.company_id AND is_active = true LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active fiscal year found for company. Please configure one in Settings.';
  END IF;

  -- Check if the fiscal year is locked
  IF active_fy.is_locked THEN
    RAISE EXCEPTION 'Transaction date % falls into a Locked Fiscal Year (%).', target_date, active_fy.fiscal_year_name;
  END IF;

  -- Check date bounds
  IF target_date < active_fy.start_date OR target_date > active_fy.end_date THEN
    RAISE EXCEPTION 'Transaction date % is outside the active Fiscal Year bounds (% to %).', target_date, active_fy.start_date, active_fy.end_date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Attach Triggers to Transaction Tables
DROP TRIGGER IF EXISTS trg_check_fy_financial_voucher ON "FinancialVoucher";
CREATE TRIGGER trg_check_fy_financial_voucher
BEFORE INSERT OR UPDATE ON "FinancialVoucher"
FOR EACH ROW EXECUTE FUNCTION check_fiscal_year_bounds();

DROP TRIGGER IF EXISTS trg_check_fy_pos_sale ON "POSSale";
CREATE TRIGGER trg_check_fy_pos_sale
BEFORE INSERT OR UPDATE ON "POSSale"
FOR EACH ROW EXECUTE FUNCTION check_fiscal_year_bounds();

DROP TRIGGER IF EXISTS trg_check_fy_purchase_invoice ON "PurchaseInvoice";
CREATE TRIGGER trg_check_fy_purchase_invoice
BEFORE INSERT OR UPDATE ON "PurchaseInvoice"
FOR EACH ROW EXECUTE FUNCTION check_fiscal_year_bounds();

DROP TRIGGER IF EXISTS trg_check_fy_sales_invoice ON "SalesInvoice";
CREATE TRIGGER trg_check_fy_sales_invoice
BEFORE INSERT OR UPDATE ON "SalesInvoice"
FOR EACH ROW EXECUTE FUNCTION check_fiscal_year_bounds();
