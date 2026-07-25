
DROP FUNCTION IF EXISTS get_trial_balance_rpc(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_profit_loss_rpc(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_gl_summary_rpc(UUID, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_comparative_profit_loss_rpc(UUID, DATE, DATE, DATE, DATE) CASCADE;
DROP FUNCTION IF EXISTS get_next_voucher_number(UUID, TEXT, DATE) CASCADE;
DROP FUNCTION IF EXISTS close_and_open_fiscal_year(UUID, UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS reopen_fiscal_year(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS process_payroll_run_rpc(UUID, INTEGER, INTEGER, TEXT) CASCADE;

-- BUNDLED HOTFIX FOR UUID CASTS

-- ==========================================
-- SAJILO-ERP REPORTING OPTIMIZATION MIGRATION
-- ==========================================

-- 1. Indexing Specifications
-- These indexes prevent sequential scans during large date-range queries.
CREATE INDEX IF NOT EXISTS idx_gl_journal_status_date ON "GeneralLedgerJournal" (status, entry_date);
CREATE INDEX IF NOT EXISTS idx_gl_line_journal_account ON "GeneralLedgerLine" (journal_id, account_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_status_date ON "SalesInvoice" (status, payment_status, invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_status_date ON "PurchaseInvoice" (status, payment_status, invoice_date);

-- 2. Trial Balance RPC
-- Aggregates opening, current, and closing balances server-side.
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
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id
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
  LEFT JOIN account_activity aa ON a.id = aa.account_id::uuid
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.ledger_type = 'Sub Ledger'
    AND a.account_code IS NOT NULL AND a.account_code != '—'
    AND (
      COALESCE(aa.ob_dr, 0) > 0 OR COALESCE(aa.ob_cr, 0) > 0 OR 
      COALESCE(aa.cur_dr, 0) > 0 OR COALESCE(aa.cur_cr, 0) > 0
    );
END;
$$;

-- 3. Profit & Loss RPC
CREATE OR REPLACE FUNCTION get_profit_loss_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
  id UUID,
  parent_account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  account_subtype TEXT,
  ledger_type TEXT,
  balance NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH account_activity AS (
    SELECT
      l.account_id,
      SUM(l.debit_amount - l.credit_amount) as net_debit
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id
    WHERE j.status = 'Posted'
      AND l.company_id = p_company_id
      AND j.company_id = p_company_id
      AND j.entry_date::DATE >= p_from_date
      AND j.entry_date::DATE <= p_to_date
    GROUP BY l.account_id
  )
  SELECT 
    a.id,
    a.parent_account_id,
    a.account_code,
    a.account_name,
    a.account_type,
    a.account_subtype,
    a.ledger_type,
    CASE 
      WHEN a.account_type IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN COALESCE(aa.net_debit, 0)
      ELSE -COALESCE(aa.net_debit, 0)
    END AS balance
  FROM "ChartOfAccount" a
  LEFT JOIN account_activity aa ON a.id = aa.account_id::uuid
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.account_type IN ('Revenue', 'Other Income', 'Expense', 'COGS', 'OPEX', 'Cost of Goods Sold', 'Other Expense');
END;
$$;

-- 4. GL Summary RPC
CREATE OR REPLACE FUNCTION get_gl_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
  id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  debit NUMERIC,
  credit NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.account_code,
    a.account_name,
    a.account_type,
    COALESCE(SUM(l.debit_amount), 0) AS debit,
    COALESCE(SUM(l.credit_amount), 0) AS credit
  FROM "ChartOfAccount" a
  JOIN "GeneralLedgerLine" l ON a.id = l.account_id::uuid AND l.company_id = p_company_id
  JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id AND j.company_id = p_company_id
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND j.status = 'Posted'
    AND j.entry_date::DATE >= p_from_date
    AND j.entry_date::DATE <= p_to_date
  GROUP BY a.id, a.account_code, a.account_name, a.account_type
  HAVING COALESCE(SUM(l.debit_amount), 0) > 0 OR COALESCE(SUM(l.credit_amount), 0) > 0;
END;
$$;

-- 5. Comparative Profit & Loss RPC
CREATE OR REPLACE FUNCTION get_comparative_profit_loss_rpc(
  p_company_id UUID, 
  p_from_date DATE, 
  p_to_date DATE,
  p_comp_from_date DATE,
  p_comp_to_date DATE
)
RETURNS TABLE (
  id UUID,
  parent_account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  account_subtype TEXT,
  ledger_type TEXT,
  current_balance NUMERIC,
  comparative_balance NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH current_activity AS (
    SELECT
      l.account_id,
      SUM(l.debit_amount - l.credit_amount) as net_debit
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id
    WHERE j.status = 'Posted'
      AND l.company_id = p_company_id
      AND j.company_id = p_company_id
      AND j.entry_date::DATE >= p_from_date
      AND j.entry_date::DATE <= p_to_date
    GROUP BY l.account_id
  ),
  comparative_activity AS (
    SELECT
      l.account_id,
      SUM(l.debit_amount - l.credit_amount) as net_debit
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id
    WHERE j.status = 'Posted'
      AND l.company_id = p_company_id
      AND j.company_id = p_company_id
      AND j.entry_date::DATE >= p_comp_from_date
      AND j.entry_date::DATE <= p_comp_to_date
    GROUP BY l.account_id
  )
  SELECT 
    a.id,
    a.parent_account_id,
    a.account_code,
    a.account_name,
    a.account_type,
    a.account_subtype,
    a.ledger_type,
    CASE 
      WHEN a.account_type IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN COALESCE(ca.net_debit, 0)
      ELSE -COALESCE(ca.net_debit, 0)
    END AS current_balance,
    CASE 
      WHEN a.account_type IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN COALESCE(coa.net_debit, 0)
      ELSE -COALESCE(coa.net_debit, 0)
    END AS comparative_balance
  FROM "ChartOfAccount" a
  LEFT JOIN current_activity ca ON a.id = ca.account_id::uuid
  LEFT JOIN comparative_activity coa ON a.id = coa.account_id::uuid
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.account_type IN ('Revenue', 'Other Income', 'Expense', 'COGS', 'OPEX', 'Cost of Goods Sold', 'Other Expense');
END;
$$;


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
DROP POLICY IF EXISTS "all_VoucherSequence" ON "VoucherSequence";
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

  v_result := v_prefix || v_fy.fiscal_year_name || '-' || LPAD(v_seq.current_number::TEXT, 5, '0') || v_suffix;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;


  -- Triggers for Auto-numbering
  CREATE OR REPLACE FUNCTION auto_generate_voucher_number_fin() RETURNS TRIGGER AS $$
  BEGIN
    IF NEW.voucher_number IS NULL OR NEW.voucher_number = 'AUTO' THEN
      NEW.voucher_number := get_next_voucher_number(NEW.company_id, NEW.voucher_type, NEW.voucher_date::DATE);
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE OR REPLACE FUNCTION auto_generate_voucher_number_pos() RETURNS TRIGGER AS $$
  BEGIN
    IF NEW.sale_number IS NULL OR NEW.sale_number = 'AUTO' THEN
      NEW.sale_number := get_next_voucher_number(NEW.company_id, 'POS', NEW.sale_date::DATE);
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE OR REPLACE FUNCTION auto_generate_voucher_number_pinv() RETURNS TRIGGER AS $$
  BEGIN
    IF NEW.invoice_number IS NULL OR NEW.invoice_number = 'AUTO' THEN
      NEW.invoice_number := get_next_voucher_number(NEW.company_id, 'PurchaseInvoice', NEW.invoice_date::DATE);
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  CREATE OR REPLACE FUNCTION auto_generate_voucher_number_sinv() RETURNS TRIGGER AS $$
  BEGIN
    IF NEW.invoice_number IS NULL OR NEW.invoice_number = 'AUTO' THEN
      NEW.invoice_number := get_next_voucher_number(NEW.company_id, 'SalesInvoice', NEW.invoice_date::DATE);
    END IF;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;
  
  DROP TRIGGER IF EXISTS trg_auto_num_fin ON "FinancialVoucher";
  CREATE TRIGGER trg_auto_num_fin BEFORE INSERT ON "FinancialVoucher" FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_fin();
  
  DROP TRIGGER IF EXISTS trg_auto_num_pos ON "POSSale";
  CREATE TRIGGER trg_auto_num_pos BEFORE INSERT ON "POSSale" FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_pos();
  
  DROP TRIGGER IF EXISTS trg_auto_num_pinv ON "PurchaseInvoice";
  CREATE TRIGGER trg_auto_num_pinv BEFORE INSERT ON "PurchaseInvoice" FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_pinv();
  
  DROP TRIGGER IF EXISTS trg_auto_num_sinv ON "SalesInvoice";
  CREATE TRIGGER trg_auto_num_sinv BEFORE INSERT ON "SalesInvoice" FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_sinv();

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
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id
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
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id
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


-- ==========================================
-- 1. SUBSIDIARY ENTITY SCHEMA UPDATE
-- ==========================================

ALTER TABLE "GeneralLedgerLine" 
ADD COLUMN IF NOT EXISTS "entity_type" TEXT, -- 'Employee', 'Customer', 'Vendor'
ADD COLUMN IF NOT EXISTS "entity_id" TEXT;

CREATE INDEX IF NOT EXISTS idx_gl_line_entity ON "GeneralLedgerLine"(company_id, entity_type, entity_id);

-- ==========================================
-- 2. SETTINGS & EMPLOYEE SCHEMA UPDATE
-- ==========================================

ALTER TABLE "CompanySettings" 
ADD COLUMN IF NOT EXISTS "hr_earning_mappings" JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS "hr_deduction_mappings" JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS "hr_salary_payable_account_id" TEXT;

ALTER TABLE "Employee"
ADD COLUMN IF NOT EXISTS "salary_components" JSONB DEFAULT '{"earnings": [], "deductions": []}'::jsonb;

-- Migrate existing employee fixed fields to JSONB for backward compatibility
UPDATE "Employee" 
SET salary_components = jsonb_build_object(
  'earnings', jsonb_build_array(
    jsonb_build_object('name', 'Base Salary', 'amount', COALESCE(base_salary, 0)),
    jsonb_build_object('name', 'HRA', 'amount', COALESCE(house_rent_allowance, 0)),
    jsonb_build_object('name', 'Transport Allowance', 'amount', COALESCE(transport_allowance, 0))
  ),
  'deductions', jsonb_build_array(
    jsonb_build_object('name', 'PF', 'percentage', COALESCE(pf_deduction_percentage, 0)),
    jsonb_build_object('name', 'TDS', 'percentage', COALESCE(tds_tax_percentage, 0))
  )
)
WHERE salary_components->>'earnings' IS NULL OR jsonb_array_length(salary_components->'earnings') = 0;

-- ==========================================
-- 3. PAYROLL RUN DETAILS SCHEMA
-- ==========================================

CREATE TABLE IF NOT EXISTS "PayrollRunDetail" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL,
  payroll_run_id UUID NOT NULL REFERENCES "PayrollRun"(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES "Employee"(id),
  employee_name TEXT,
  gross_pay NUMERIC DEFAULT 0,
  total_deductions NUMERIC DEFAULT 0,
  net_payable NUMERIC DEFAULT 0,
  components JSONB, -- stores exact breakdown of earnings/deductions for this payslip
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE "PayrollRunDetail" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "all_PayrollRunDetail" ON "PayrollRunDetail";
CREATE POLICY "all_PayrollRunDetail" ON "PayrollRunDetail" FOR ALL USING (
  (EXISTS (SELECT 1 FROM public."User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM public."UserCompany" WHERE (user_id)::uuid = auth.uid()))
);

-- ==========================================
-- 4. BACKEND PAYROLL TRANSACTION ENGINE (RPC)
-- ==========================================

CREATE OR REPLACE FUNCTION process_payroll_run(p_company_id UUID, p_month INTEGER, p_year INTEGER, p_label TEXT)
RETURNS UUID AS $$
DECLARE
  v_settings RECORD;
  v_run_id UUID;
  v_journal_id UUID;
  v_emp RECORD;
  v_earning JSONB;
  v_deduction JSONB;
  v_total_gross NUMERIC := 0;
  v_total_pf NUMERIC := 0;
  v_total_tds NUMERIC := 0;
  v_total_net NUMERIC := 0;
  v_emp_gross NUMERIC;
  v_emp_deductions NUMERIC;
  v_emp_net NUMERIC;
  v_components JSONB;
  v_ref TEXT;
  
  -- Temporary tables to aggregate ledgers
  v_mapped_account_id TEXT;
  v_mapped_account_code TEXT;
  v_mapped_account_name TEXT;
  v_mapped_account_type TEXT;
BEGIN
  -- 1. Load Settings
  SELECT * INTO v_settings FROM "CompanySettings" WHERE company_id = p_company_id LIMIT 1;
  
  IF v_settings.hr_salary_payable_account_id IS NULL THEN
    RAISE EXCEPTION 'Salary Payable control account is not configured in Settings.';
  END IF;

  -- Create Temp tables for aggregating Debits (Earnings) and Credits (Deductions) globally
  CREATE TEMP TABLE temp_payroll_gl (
    account_id TEXT,
    account_code TEXT,
    account_name TEXT,
    account_type TEXT,
    debit_amount NUMERIC DEFAULT 0,
    credit_amount NUMERIC DEFAULT 0,
    entity_type TEXT,
    entity_id TEXT
  ) ON COMMIT DROP;

  v_ref := 'PR-' || p_year || '-' || LPAD(p_month::TEXT, 2, '0');

  -- 2. Create PayrollRun header
  INSERT INTO "PayrollRun" (company_id, run_reference, period_month, period_year, period_label, status, employee_count)
  VALUES (p_company_id, v_ref, p_month, p_year, p_label, 'Posted', 0)
  RETURNING id INTO v_run_id;

  -- 3. Create General Ledger Journal header
  -- Assuming end of month for entry date
  INSERT INTO "GeneralLedgerJournal" (company_id, entry_date, description, reference_module, source_document_id, source_document_type, status)
  VALUES (p_company_id, (DATE (p_year || '-' || p_month || '-01') + INTERVAL '1 month' - INTERVAL '1 day'), 'Payroll Run ' || p_label, 'Payroll', v_run_id::TEXT, 'PayrollRun', 'Posted')
  RETURNING id INTO v_journal_id;

  -- 4. Process Employees
  FOR v_emp IN (SELECT * FROM "Employee" WHERE company_id = p_company_id AND employment_status IN ('Permanent', 'Probation')) LOOP
    v_emp_gross := 0;
    v_emp_deductions := 0;
    v_components := '{"earnings": [], "deductions": []}'::jsonb;

    -- Process Earnings
    FOR v_earning IN SELECT * FROM jsonb_array_elements(v_emp.salary_components->'earnings') LOOP
      IF (v_earning->>'amount')::NUMERIC > 0 THEN
        v_emp_gross := v_emp_gross + (v_earning->>'amount')::NUMERIC;
        
        -- Find mapped account for this earning
        SELECT mapping->>'account_id', mapping->>'account_code', mapping->>'account_name', mapping->>'account_type'
        INTO v_mapped_account_id, v_mapped_account_code, v_mapped_account_name, v_mapped_account_type
        FROM jsonb_array_elements(v_settings.hr_earning_mappings) as mapping
        WHERE mapping->>'name' = v_earning->>'name';

        IF v_mapped_account_id IS NULL THEN
          RAISE EXCEPTION 'No GL mapping found for Earning: %', v_earning->>'name';
        END IF;

        -- Aggregate into temp table (Debits) - No entity tagging needed for aggregated expense
        INSERT INTO temp_payroll_gl (account_id, account_code, account_name, account_type, debit_amount)
        VALUES (v_mapped_account_id, v_mapped_account_code, v_mapped_account_name, v_mapped_account_type, (v_earning->>'amount')::NUMERIC);
        
        -- Push to components array
        v_components := jsonb_set(v_components, '{earnings}', (v_components->'earnings') || v_earning);
      END IF;
    END LOOP;

    -- Process Deductions
    FOR v_deduction IN SELECT * FROM jsonb_array_elements(v_emp.salary_components->'deductions') LOOP
      DECLARE
        v_deduct_amount NUMERIC := 0;
      BEGIN
        IF v_deduction ? 'percentage' AND (v_deduction->>'percentage')::NUMERIC > 0 THEN
          v_deduct_amount := v_emp_gross * ((v_deduction->>'percentage')::NUMERIC / 100);
        ELSIF v_deduction ? 'amount' AND (v_deduction->>'amount')::NUMERIC > 0 THEN
          v_deduct_amount := (v_deduction->>'amount')::NUMERIC;
        END IF;

        IF v_deduct_amount > 0 THEN
          v_emp_deductions := v_emp_deductions + v_deduct_amount;

          IF v_deduction->>'name' = 'PF' THEN v_total_pf := v_total_pf + v_deduct_amount; END IF;
          IF v_deduction->>'name' = 'TDS' THEN v_total_tds := v_total_tds + v_deduct_amount; END IF;

          -- Find mapped account for this deduction
          SELECT mapping->>'account_id', mapping->>'account_code', mapping->>'account_name', mapping->>'account_type'
          INTO v_mapped_account_id, v_mapped_account_code, v_mapped_account_name, v_mapped_account_type
          FROM jsonb_array_elements(v_settings.hr_deduction_mappings) as mapping
          WHERE mapping->>'name' = v_deduction->>'name';

          IF v_mapped_account_id IS NULL THEN
            RAISE EXCEPTION 'No GL mapping found for Deduction: %', v_deduction->>'name';
          END IF;

          -- Add to temp table (Credits). Attach entity_id so sub-ledger advances/receivables update perfectly
          INSERT INTO temp_payroll_gl (account_id, account_code, account_name, account_type, credit_amount, entity_type, entity_id)
          VALUES (v_mapped_account_id, v_mapped_account_code, v_mapped_account_name, v_mapped_account_type, v_deduct_amount, 'Employee', v_emp.id::TEXT);
          
          v_components := jsonb_set(v_components, '{deductions}', (v_components->'deductions') || jsonb_build_object('name', v_deduction->>'name', 'amount', v_deduct_amount));
        END IF;
      END;
    END LOOP;

    v_emp_net := v_emp_gross - v_emp_deductions;
    v_total_gross := v_total_gross + v_emp_gross;
    v_total_net := v_total_net + v_emp_net;

    -- Credit Net Salary Payable PER EMPLOYEE for precise Subsidiary tracking
    SELECT account_code, account_name, account_type INTO v_mapped_account_code, v_mapped_account_name, v_mapped_account_type
    FROM "ChartOfAccount" WHERE id::TEXT = v_settings.hr_salary_payable_account_id;

    INSERT INTO temp_payroll_gl (account_id, account_code, account_name, account_type, credit_amount, entity_type, entity_id)
    VALUES (v_settings.hr_salary_payable_account_id, v_mapped_account_code, v_mapped_account_name, v_mapped_account_type, v_emp_net, 'Employee', v_emp.id::TEXT);

    -- Insert Detail Record
    INSERT INTO "PayrollRunDetail" (company_id, payroll_run_id, employee_id, employee_name, gross_pay, total_deductions, net_payable, components)
    VALUES (p_company_id, v_run_id, v_emp.id, v_emp.full_name, v_emp_gross, v_emp_deductions, v_emp_net, v_components);

  END LOOP;

  -- 5. Consolidate and Insert GL Lines
  -- We aggregate expenses (Debits) normally.
  -- We aggregate payables (Credits) normally, BUT we group by entity_id so Employee Payables stay separated!
  INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount, entity_type, entity_id)
  SELECT p_company_id, v_journal_id::TEXT, account_id, account_code, account_name, account_type, SUM(debit_amount), SUM(credit_amount), entity_type, entity_id
  FROM temp_payroll_gl
  GROUP BY account_id, account_code, account_name, account_type, entity_type, entity_id
  HAVING SUM(debit_amount) > 0 OR SUM(credit_amount) > 0;

  -- 6. Update Run Totals
  UPDATE "PayrollRun" SET 
    total_gross = v_total_gross,
    total_pf = v_total_pf,
    total_tds = v_total_tds,
    total_net = v_total_net,
    employee_count = (SELECT COUNT(*) FROM "PayrollRunDetail" WHERE payroll_run_id = v_run_id)
  WHERE id = v_run_id;

  -- Update Journal Totals
  UPDATE "GeneralLedgerJournal" SET
    total_debit = (SELECT SUM(debit_amount) FROM "GeneralLedgerLine" WHERE journal_id::uuid = v_journal_id),
    total_credit = (SELECT SUM(credit_amount) FROM "GeneralLedgerLine" WHERE journal_id::uuid = v_journal_id)
  WHERE id = v_journal_id;

  RETURN v_run_id;
END;
$$ LANGUAGE plpgsql;
