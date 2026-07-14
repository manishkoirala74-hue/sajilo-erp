CREATE OR REPLACE FUNCTION check_fiscal_year_bounds()
RETURNS TRIGGER AS $$
DECLARE
  target_fy RECORD;
  target_date DATE;
  fy_count INT;
BEGIN
  IF TG_TABLE_NAME = 'FinancialVoucher' THEN target_date := NEW.voucher_date;
  ELSIF TG_TABLE_NAME = 'POSSale' THEN target_date := NEW.sale_date;
  ELSIF TG_TABLE_NAME = 'PurchaseInvoice' THEN target_date := NEW.invoice_date;
  ELSIF TG_TABLE_NAME = 'SalesInvoice' THEN target_date := NEW.invoice_date;
  ELSIF TG_TABLE_NAME = 'GeneralLedgerJournal' THEN target_date := NEW.entry_date;
  END IF;

  IF target_date IS NULL THEN RETURN NEW; END IF;

  -- Parallel Posting: Find ANY FY that matches the date
  SELECT * INTO target_fy FROM "FiscalYear" 
  WHERE company_id = NEW.company_id AND target_date BETWEEN start_date AND end_date LIMIT 1;

  IF NOT FOUND THEN
    SELECT count(*) INTO fy_count FROM "FiscalYear" WHERE company_id = NEW.company_id;
    IF fy_count = 0 THEN
      RAISE EXCEPTION 'No Fiscal Year has been set up for this company. Please create a Fiscal Year in Settings first.';
    ELSE
      RAISE EXCEPTION 'Transaction date % is outside all defined Fiscal Year bounds.', target_date;
    END IF;
  END IF;

  IF target_fy.is_locked THEN
    RAISE EXCEPTION 'Transaction date % falls into a Locked Fiscal Year (%).', target_date, target_fy.fiscal_year_name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
