-- ==========================================
-- 1. VOUCHER SEQUENCE ENGINE
-- ==========================================

CREATE TABLE IF NOT EXISTS "VoucherSequence" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  fiscal_year_id UUID NOT NULL REFERENCES "FiscalYear"(id) ON DELETE CASCADE,
  voucher_type TEXT NOT NULL,
  prefix TEXT,
  include_fy_prefix BOOLEAN DEFAULT false,
  current_number INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, fiscal_year_id, voucher_type)
);

ALTER TABLE "VoucherSequence" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_VoucherSequence" ON "VoucherSequence" FOR ALL USING (
  (EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM public."UserCompany" WHERE (user_id)::uuid = auth.uid()))
);

-- Sequence Generator Function
CREATE OR REPLACE FUNCTION get_next_voucher_number(p_company_id UUID, p_voucher_type TEXT, p_date DATE)
RETURNS TEXT AS $$
DECLARE
  v_fy RECORD;
  v_seq RECORD;
  v_settings RECORD;
  v_result TEXT;
  v_prefix TEXT;
  v_suffix TEXT;
BEGIN
  -- Find the fiscal year for this date
  SELECT * INTO v_fy FROM "FiscalYear" 
  WHERE company_id = p_company_id AND p_date BETWEEN start_date AND end_date LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No Fiscal Year found for date %', p_date;
  END IF;

  -- Get Company Settings for Prefixes
  SELECT * INTO v_settings FROM "CompanySettings" WHERE company_id = p_company_id LIMIT 1;

  -- Lock the sequence row for concurrency
  SELECT * INTO v_seq FROM "VoucherSequence" 
  WHERE company_id = p_company_id AND fiscal_year_id = v_fy.id AND voucher_type = p_voucher_type
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO "VoucherSequence" (company_id, fiscal_year_id, voucher_type, current_number)
    VALUES (p_company_id, v_fy.id, p_voucher_type, 1)
    RETURNING * INTO v_seq;
  ELSE
    UPDATE "VoucherSequence" SET current_number = current_number + 1 
    WHERE id = v_seq.id RETURNING * INTO v_seq;
  END IF;

  -- Determine Prefix based on type
  IF p_voucher_type = 'SalesInvoice' THEN v_prefix := COALESCE(v_settings.invoice_prefix_sales, 'SI');
  ELSIF p_voucher_type = 'PurchaseInvoice' THEN v_prefix := COALESCE(v_settings.invoice_prefix_purchase, 'PI');
  ELSIF p_voucher_type = 'SalesOrder' THEN v_prefix := COALESCE(v_settings.invoice_prefix_sales_order, 'SO');
  ELSIF p_voucher_type = 'PurchaseOrder' THEN v_prefix := COALESCE(v_settings.invoice_prefix_purchase_order, 'PO');
  ELSIF p_voucher_type = 'FinancialVoucher' THEN v_prefix := 'JV';
  ELSE v_prefix := SUBSTRING(p_voucher_type FROM 1 FOR 3);
  END IF;

  v_suffix := COALESCE(v_settings.invoice_suffix, '');

  IF v_prefix != '' THEN v_prefix := v_prefix || '-'; END IF;

  IF COALESCE(v_settings.include_fy_in_invoice_number, false) THEN
    v_result := v_prefix || v_fy.fiscal_year_name || '-' || LPAD(v_seq.current_number::TEXT, 5, '0') || v_suffix;
  ELSE
    v_result := v_prefix || LPAD(v_seq.current_number::TEXT, 5, '0') || v_suffix;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Triggers for Auto-numbering
CREATE OR REPLACE FUNCTION auto_generate_voucher_number()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'FinancialVoucher' AND (NEW.voucher_number IS NULL OR NEW.voucher_number = 'AUTO') THEN
    NEW.voucher_number := get_next_voucher_number(NEW.company_id, NEW.voucher_type, NEW.voucher_date::DATE);
  ELSIF TG_TABLE_NAME = 'POSSale' AND (NEW.sale_number IS NULL OR NEW.sale_number = 'AUTO') THEN
    NEW.sale_number := get_next_voucher_number(NEW.company_id, 'POS', NEW.sale_date::DATE);
  ELSIF TG_TABLE_NAME = 'PurchaseInvoice' AND (NEW.invoice_number IS NULL OR NEW.invoice_number = 'AUTO') THEN
    NEW.invoice_number := get_next_voucher_number(NEW.company_id, 'PurchaseInvoice', NEW.invoice_date::DATE);
  ELSIF TG_TABLE_NAME = 'SalesInvoice' AND (NEW.invoice_number IS NULL OR NEW.invoice_number = 'AUTO') THEN
    NEW.invoice_number := get_next_voucher_number(NEW.company_id, 'SalesInvoice', NEW.invoice_date::DATE);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_num_fin ON "FinancialVoucher";
CREATE TRIGGER trg_auto_num_fin BEFORE INSERT ON "FinancialVoucher" FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number();

DROP TRIGGER IF EXISTS trg_auto_num_pos ON "POSSale";
CREATE TRIGGER trg_auto_num_pos BEFORE INSERT ON "POSSale" FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number();

DROP TRIGGER IF EXISTS trg_auto_num_pinv ON "PurchaseInvoice";
CREATE TRIGGER trg_auto_num_pinv BEFORE INSERT ON "PurchaseInvoice" FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number();

DROP TRIGGER IF EXISTS trg_auto_num_sinv ON "SalesInvoice";
CREATE TRIGGER trg_auto_num_sinv BEFORE INSERT ON "SalesInvoice" FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number();

-- ==========================================
-- 2. PARALLEL POSTING GATEKEEPER
-- ==========================================

CREATE OR REPLACE FUNCTION check_fiscal_year_bounds()
RETURNS TRIGGER AS $$
DECLARE
  target_fy RECORD;
  target_date DATE;
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
    RAISE EXCEPTION 'Transaction date % is outside all defined Fiscal Year bounds.', target_date;
  END IF;

  IF target_fy.is_locked THEN
    RAISE EXCEPTION 'Transaction date % falls into a Locked Fiscal Year (%).', target_date, target_fy.fiscal_year_name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach gatekeeper to GL Journals too
DROP TRIGGER IF EXISTS trg_check_fy_gl_journal ON "GeneralLedgerJournal";
CREATE TRIGGER trg_check_fy_gl_journal BEFORE INSERT OR UPDATE ON "GeneralLedgerJournal" FOR EACH ROW EXECUTE FUNCTION check_fiscal_year_bounds();

-- ==========================================
-- 3 & 4. AUTOMATED CLOSING & OPENING WIZARD
-- ==========================================

CREATE OR REPLACE FUNCTION close_and_open_fiscal_year(p_company_id UUID, p_closing_fy_id UUID, p_new_fy_id UUID)
RETURNS VOID AS $$
DECLARE
  v_closing_fy RECORD;
  v_new_fy RECORD;
  v_draft_count INTEGER;
  v_retained_earnings_id TEXT;
  v_closing_journal_id UUID;
  v_opening_journal_id UUID;
  v_net_profit NUMERIC := 0;
  v_rev_exp RECORD;
  v_perm RECORD;
  v_item RECORD;
BEGIN
  SELECT * INTO v_closing_fy FROM "FiscalYear" WHERE id = p_closing_fy_id AND company_id = p_company_id;
  SELECT * INTO v_new_fy FROM "FiscalYear" WHERE id = p_new_fy_id AND company_id = p_company_id;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid Fiscal Year parameters.'; END IF;

  -- 1. Pre-Flight Validation
  SELECT COUNT(*) INTO v_draft_count FROM "GeneralLedgerJournal" 
  WHERE company_id = p_company_id AND status != 'Posted' 
  AND entry_date BETWEEN v_closing_fy.start_date AND v_closing_fy.end_date;
  
  IF v_draft_count > 0 THEN
    RAISE EXCEPTION 'Cannot close fiscal year. There are % draft/unposted journals.', v_draft_count;
  END IF;

  -- Get or Create Retained Earnings
  SELECT account_code INTO v_retained_earnings_id FROM "ChartOfAccount" 
  WHERE company_id = p_company_id AND account_name ILIKE 'Retained Earnings' LIMIT 1;
  
  IF NOT FOUND THEN
    INSERT INTO "ChartOfAccount" (company_id, account_code, account_name, account_type, normal_balance, is_system_account)
    VALUES (p_company_id, '3999', 'Retained Earnings', 'Equity', 'Credit', true) RETURNING account_code INTO v_retained_earnings_id;
  END IF;

  -- Delete old closing/opening journals if this is a recascade
  DELETE FROM "GeneralLedgerJournal" WHERE company_id = p_company_id AND reference_module IN ('YearEndClose', 'OpeningBalance') 
  AND entry_date IN (v_closing_fy.end_date + time '23:59:59', v_new_fy.start_date);
  
  DELETE FROM "StockAdjustment" WHERE company_id = p_company_id AND adjustment_type = 'Opening Balance' AND adjustment_date = v_new_fy.start_date;

  -- 2. Temporary Account Zeroing (Closing Journal)
  INSERT INTO "GeneralLedgerJournal" (company_id, entry_date, description, reference_module, status)
  VALUES (p_company_id, v_closing_fy.end_date + time '23:59:59', 'Year End Closing Journal - ' || v_closing_fy.fiscal_year_name, 'YearEndClose', 'Posted')
  RETURNING id INTO v_closing_journal_id;

  FOR v_rev_exp IN (
    SELECT l.account_id, l.account_code, l.account_name, l.account_type, SUM(l.credit_amount - l.debit_amount) as net_balance
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::TEXT
    WHERE j.company_id = p_company_id AND j.entry_date BETWEEN v_closing_fy.start_date AND v_closing_fy.end_date
    AND j.status = 'Posted' AND j.reference_module != 'YearEndClose'
    AND l.account_type IN ('Revenue', 'COGS', 'OPEX', 'Expense', 'Income')
    GROUP BY l.account_id, l.account_code, l.account_name, l.account_type
    HAVING SUM(l.credit_amount - l.debit_amount) != 0
  ) LOOP
    IF v_rev_exp.net_balance > 0 THEN -- Credit balance (Revenue) -> Need to Debit
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_closing_journal_id::TEXT, v_rev_exp.account_id, v_rev_exp.account_code, v_rev_exp.account_name, v_rev_exp.account_type, v_rev_exp.net_balance, 0);
    ELSE -- Debit balance (Expense) -> Need to Credit
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_closing_journal_id::TEXT, v_rev_exp.account_id, v_rev_exp.account_code, v_rev_exp.account_name, v_rev_exp.account_type, 0, ABS(v_rev_exp.net_balance));
    END IF;
    v_net_profit := v_net_profit + v_rev_exp.net_balance;
  END LOOP;

  -- Post Net Profit to Retained Earnings
  IF v_net_profit > 0 THEN
    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
    VALUES (p_company_id, v_closing_journal_id::TEXT, v_retained_earnings_id, v_retained_earnings_id, 'Retained Earnings', 'Equity', 0, v_net_profit);
  ELSIF v_net_profit < 0 THEN
    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
    VALUES (p_company_id, v_closing_journal_id::TEXT, v_retained_earnings_id, v_retained_earnings_id, 'Retained Earnings', 'Equity', ABS(v_net_profit), 0);
  END IF;

  -- 3. Permanent Ledger Roll-Forward (Opening Journal)
  INSERT INTO "GeneralLedgerJournal" (company_id, entry_date, description, reference_module, status)
  VALUES (p_company_id, v_new_fy.start_date, 'Opening Balances from ' || v_closing_fy.fiscal_year_name, 'OpeningBalance', 'Posted')
  RETURNING id INTO v_opening_journal_id;

  FOR v_perm IN (
    SELECT l.account_id, l.account_code, l.account_name, l.account_type, SUM(l.debit_amount - l.credit_amount) as net_balance
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::TEXT
    WHERE j.company_id = p_company_id AND j.entry_date <= (v_closing_fy.end_date + time '23:59:59')
    AND j.status = 'Posted'
    AND l.account_type IN ('Asset', 'Liability', 'Equity')
    GROUP BY l.account_id, l.account_code, l.account_name, l.account_type
    HAVING SUM(l.debit_amount - l.credit_amount) != 0
  ) LOOP
    IF v_perm.net_balance > 0 THEN
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_opening_journal_id::TEXT, v_perm.account_id, v_perm.account_code, v_perm.account_name, v_perm.account_type, v_perm.net_balance, 0);
    ELSE
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_opening_journal_id::TEXT, v_perm.account_id, v_perm.account_code, v_perm.account_name, v_perm.account_type, 0, ABS(v_perm.net_balance));
    END IF;
  END LOOP;

  -- 4. Inventory Carry-Over
  -- Simplified snapshot: Assuming Item.quantity_on_hand reflects current total. 
  -- For a precise historical point-in-time, we'd need a stock ledger aggregate.
  INSERT INTO "StockAdjustment" (company_id, adjustment_number, adjustment_date, adjustment_type, reason, status, line_items)
  SELECT p_company_id, 'OPEN-' || v_new_fy.fiscal_year_name, v_new_fy.start_date, 'Opening Balance', 'Year End Carry-over', 'Posted',
    jsonb_agg(
      jsonb_build_object(
        'item_id', id, 'item_code', item_code, 'item_name', item_name,
        'quantity', quantity_on_hand, 'unit_cost', 0
      )
    )
  FROM "Item" WHERE company_id = p_company_id AND quantity_on_hand > 0;

  -- 5. Lock Down
  UPDATE "FiscalYear" SET is_locked = true, is_active = false WHERE id = p_closing_fy_id;
  UPDATE "FiscalYear" SET is_active = true WHERE id = p_new_fy_id;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 5. COMPLIANT RE-OPENING PROTOCOL
-- ==========================================

CREATE OR REPLACE FUNCTION reopen_fiscal_year(p_company_id UUID, p_fy_id UUID, p_reason TEXT)
RETURNS VOID AS $$
BEGIN
  -- We could log the p_reason into an Audit table here
  UPDATE "FiscalYear" SET is_locked = false WHERE id = p_fy_id AND company_id = p_company_id;
END;
$$ LANGUAGE plpgsql;

-- Recascading Worker Trigger
CREATE OR REPLACE FUNCTION trigger_recascade()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_journal_date DATE;
  v_fy RECORD;
  v_next_fy RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN v_company_id := OLD.company_id; ELSE v_company_id := NEW.company_id; END IF;
  
  -- Find the journal date
  SELECT entry_date::DATE INTO v_journal_date FROM "GeneralLedgerJournal" 
  WHERE id::TEXT = COALESCE(NEW.journal_id, OLD.journal_id) LIMIT 1;
  
  IF v_journal_date IS NULL THEN RETURN NULL; END IF;

  -- Find the FY of this journal
  SELECT * INTO v_fy FROM "FiscalYear" 
  WHERE company_id = v_company_id AND v_journal_date BETWEEN start_date AND end_date LIMIT 1;

  -- If this FY is unlocked, but there exists a SUBSEQUENT FY that is active or locked, 
  -- we technically need a recascade. However, running a full massive close_and_open_fiscal_year 
  -- inline inside a row trigger is dangerously heavy and can cause nested trigger cascades.
  -- Instead, we just raise a notice or flag the company for recascading.
  -- In a production environment, this would push a job to a message queue or update a "needs_recascade" flag.
  -- For this scope, we will raise a notice to the database log.
  
  RAISE NOTICE 'Recascading may be required for Company % due to modification in %', v_company_id, v_fy.fiscal_year_name;
  
  RETURN NULL; -- AFTER trigger
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recascade_gl ON "GeneralLedgerLine";
CREATE TRIGGER trg_recascade_gl AFTER INSERT OR UPDATE OR DELETE ON "GeneralLedgerLine"
FOR EACH ROW EXECUTE FUNCTION trigger_recascade();
