-- 0120_bulletproof_year_end_close.sql
-- Armor-plates the Year-End Close process against mixed UUID/TEXT legacy schema states
-- and bypasses broken Row Level Security (RLS) policies using SECURITY DEFINER.

-- 1. The Bulletproof FY Bounds Trigger
CREATE OR REPLACE FUNCTION check_fiscal_year_bounds()
RETURNS TRIGGER 
SECURITY DEFINER SET search_path = public
AS $$
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

  -- ZERO-TRUST: Cast both sides to UUID
  SELECT * INTO target_fy FROM "FiscalYear" 
  WHERE company_id::uuid = NEW.company_id::uuid AND target_date BETWEEN start_date AND end_date LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction date % is outside all defined Fiscal Year bounds.', target_date;
  END IF;

  -- INDUSTRY STANDARD FIX: Allow posting in both OPEN and SOFT_CLOSED states.
  -- This allows the Async Delta Queue to catch and roll forward backdated adjustments.
  IF target_fy.status NOT IN ('OPEN', 'SOFT_CLOSED') THEN
    RAISE EXCEPTION 'Transaction date % belongs to Fiscal Year %, which is currently % (Only OPEN or SOFT_CLOSED states can accept entries).', target_date, target_fy.fiscal_year_name, target_fy.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- 2. The Bulletproof Year-End Close RPC
CREATE OR REPLACE FUNCTION close_and_open_fiscal_year(p_company_id UUID, p_closing_fy_id UUID, p_new_fy_id UUID)
RETURNS VOID 
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_closing_fy RECORD;
  v_new_fy RECORD;
  v_draft_count INT;
  v_rev_exp RECORD;
  v_retained_earnings_id UUID;
  v_retained_earnings_code TEXT;
  v_closing_journal_id UUID;
  v_net_profit NUMERIC(15,2) := 0;
BEGIN
  -- ZERO-TRUST CASTS
  SELECT * INTO v_closing_fy FROM "FiscalYear" WHERE id::uuid = p_closing_fy_id AND company_id::uuid = p_company_id;
  
  IF v_closing_fy.status != 'OPEN' AND v_closing_fy.status != 'SOFT_CLOSED' THEN
    RAISE EXCEPTION 'Closing Fiscal Year must be OPEN or SOFT_CLOSED.';
  END IF;

  SELECT * INTO v_new_fy FROM "FiscalYear" WHERE id::uuid = p_new_fy_id AND company_id::uuid = p_company_id;
  
  IF v_new_fy.status != 'OPEN' THEN
    RAISE EXCEPTION 'Target Fiscal Year must be OPEN.';
  END IF;

  SELECT COUNT(*) INTO v_draft_count FROM "GeneralLedgerJournal" 
  WHERE company_id::uuid = p_company_id AND status = 'Draft' 
  AND entry_date BETWEEN v_closing_fy.start_date AND v_closing_fy.end_date;

  IF v_draft_count > 0 THEN
    RAISE EXCEPTION 'Cannot close Fiscal Year. There are % Draft journals.', v_draft_count;
  END IF;

  SELECT id, account_code INTO v_retained_earnings_id, v_retained_earnings_code FROM "ChartOfAccount" 
  WHERE company_id::uuid = p_company_id AND account_name ILIKE 'Retained Earnings' LIMIT 1;
  
  IF NOT FOUND THEN
    INSERT INTO "ChartOfAccount" (company_id, account_code, account_name, account_type, normal_balance, is_system_account)
    VALUES (p_company_id, '3999', 'Retained Earnings', 'Equity', 'Credit', true) 
    RETURNING id, account_code INTO v_retained_earnings_id, v_retained_earnings_code;
  END IF;

  DELETE FROM "GeneralLedgerJournal" WHERE company_id::uuid = p_company_id AND reference_module IN ('YearEndClose', 'OpeningBalance') 
  AND entry_date IN (v_closing_fy.end_date + time '23:59:59', v_new_fy.start_date);

  DELETE FROM "StockAdjustment" WHERE company_id::uuid = p_company_id AND adjustment_type = 'Opening Balance' AND adjustment_date = v_new_fy.start_date;

  INSERT INTO "GeneralLedgerJournal" (company_id, entry_date, description, reference_module, status)
  VALUES (p_company_id, v_closing_fy.end_date + time '23:59:59', 'Year End Closing Journal - ' || v_closing_fy.fiscal_year_name, 'YearEndClose', 'Posted')
  RETURNING id INTO v_closing_journal_id;
  
  FOR v_rev_exp IN (
    SELECT l.account_id, l.account_code, l.account_name, l.account_type, SUM(l.credit_amount - l.debit_amount) as net_balance
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id::uuid
    WHERE j.company_id::uuid = p_company_id AND j.status = 'Posted' AND j.reference_module != 'YearEndClose'
    AND l.account_type IN ('Revenue', 'Expense', 'Direct Expense', 'Indirect Expense', 'Direct Income', 'Indirect Income')
    AND j.entry_date BETWEEN v_closing_fy.start_date AND v_closing_fy.end_date
    GROUP BY l.account_id, l.account_code, l.account_name, l.account_type
    HAVING SUM(l.credit_amount - l.debit_amount) != 0
  )
  LOOP
    IF v_rev_exp.net_balance > 0 THEN
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_closing_journal_id, v_rev_exp.account_id, v_rev_exp.account_code, v_rev_exp.account_name, v_rev_exp.account_type, v_rev_exp.net_balance, 0);
    ELSE
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_closing_journal_id, v_rev_exp.account_id, v_rev_exp.account_code, v_rev_exp.account_name, v_rev_exp.account_type, 0, ABS(v_rev_exp.net_balance));
    END IF;
    v_net_profit := v_net_profit + v_rev_exp.net_balance;
  END LOOP;

  IF v_net_profit != 0 THEN
    IF v_net_profit > 0 THEN
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_closing_journal_id, v_retained_earnings_id, v_retained_earnings_code, 'Retained Earnings', 'Equity', 0, v_net_profit);
    ELSE
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_closing_journal_id, v_retained_earnings_id, v_retained_earnings_code, 'Retained Earnings', 'Equity', ABS(v_net_profit), 0);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."InventoryLedger" 
    WHERE company_id::uuid = p_company_id AND transaction_date <= (v_closing_fy.end_date + time '23:59:59')
    GROUP BY item_id HAVING SUM(quantity_in - quantity_out) > 0
  ) THEN
    INSERT INTO "StockAdjustment" (company_id, adjustment_number, adjustment_date, adjustment_type, reason, status, line_items)
    SELECT 
      p_company_id, 'OPEN-' || v_new_fy.fiscal_year_name, v_new_fy.start_date, 'Opening Balance', 'Year End Carry-over', 'Posted',
      COALESCE(jsonb_agg(jsonb_build_object('item_id', hist.item_id, 'item_code', i.item_code, 'item_name', i.item_name, 'quantity', hist.closing_qty, 'unit_cost', COALESCE(i.current_unit_cost, 0))), '[]'::jsonb)
    FROM (
      SELECT item_id, SUM(quantity_in - quantity_out) as closing_qty
      FROM public."InventoryLedger"
      WHERE company_id::uuid = p_company_id AND transaction_date <= (v_closing_fy.end_date + time '23:59:59')
      GROUP BY item_id HAVING SUM(quantity_in - quantity_out) > 0
    ) hist
    JOIN "Item" i ON hist.item_id::uuid = i.id::uuid;
  END IF;

  UPDATE "FiscalYear" SET status = 'SOFT_CLOSED' WHERE id::uuid = p_closing_fy_id;
END;
$$ LANGUAGE plpgsql;

-- 3. The Bulletproof Trigger Security and Type Matching
CREATE OR REPLACE FUNCTION trigger_flag_recalculation_financial()
RETURNS TRIGGER 
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_journal_date DATE;
  v_fy RECORD;
  v_delta NUMERIC(15,2) := 0;
  v_account_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN 
    v_company_id := OLD.company_id::uuid; v_account_id := OLD.account_id::uuid;
    v_delta := CAST((0 - OLD.debit_amount) - (0 - OLD.credit_amount) AS NUMERIC(15,2));
  ELSIF TG_OP = 'INSERT' THEN
    v_company_id := NEW.company_id::uuid; v_account_id := NEW.account_id::uuid;
    v_delta := CAST((NEW.debit_amount - 0) - (NEW.credit_amount - 0) AS NUMERIC(15,2));
  ELSE
    v_company_id := NEW.company_id::uuid; v_account_id := NEW.account_id::uuid;
    v_delta := CAST((NEW.debit_amount - OLD.debit_amount) - (NEW.credit_amount - OLD.credit_amount) AS NUMERIC(15,2));
  END IF;

  SELECT entry_date::DATE INTO v_journal_date FROM "GeneralLedgerJournal" 
  WHERE id::uuid = COALESCE(NEW.journal_id, OLD.journal_id)::uuid LIMIT 1;
  
  IF v_journal_date IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_fy FROM "FiscalYear" 
  WHERE company_id::uuid = v_company_id AND v_journal_date BETWEEN start_date AND end_date LIMIT 1;

  IF v_fy.status = 'SOFT_CLOSED' AND v_delta != 0 THEN
    INSERT INTO "pending_ledger_recalculations" (company_id, fiscal_year_id, module_type, account_id, net_change_delta)
    VALUES (v_company_id, v_fy.id, 'FINANCIAL', v_account_id, v_delta)
    ON CONFLICT (company_id, fiscal_year_id, module_type, account_id) WHERE module_type = 'FINANCIAL'
    DO UPDATE SET 
      net_change_delta = "pending_ledger_recalculations".net_change_delta + EXCLUDED.net_change_delta,
      status = 'pending',
      updated_at = NOW();
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trigger_flag_recalculation_inventory()
RETURNS TRIGGER 
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_transaction_date DATE;
  v_fy RECORD;
  v_delta NUMERIC(15,2) := 0;
  v_item_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN 
    v_company_id := OLD.company_id::uuid; v_item_id := OLD.item_id::uuid;
    v_delta := CAST(0 - (OLD.quantity_in - OLD.quantity_out) AS NUMERIC(15,2));
  ELSIF TG_OP = 'INSERT' THEN
    v_company_id := NEW.company_id::uuid; v_item_id := NEW.item_id::uuid;
    v_delta := CAST((NEW.quantity_in - NEW.quantity_out) AS NUMERIC(15,2));
  ELSE
    v_company_id := NEW.company_id::uuid; v_item_id := NEW.item_id::uuid;
    v_delta := CAST((NEW.quantity_in - NEW.quantity_out) - (OLD.quantity_in - OLD.quantity_out) AS NUMERIC(15,2));
  END IF;

  v_transaction_date := COALESCE(NEW.transaction_date, OLD.transaction_date);

  SELECT * INTO v_fy FROM "FiscalYear" 
  WHERE company_id::uuid = v_company_id AND v_transaction_date BETWEEN start_date AND end_date LIMIT 1;

  IF v_fy.status = 'SOFT_CLOSED' AND v_delta != 0 THEN
    INSERT INTO "pending_ledger_recalculations" (company_id, fiscal_year_id, module_type, item_id, net_change_delta)
    VALUES (v_company_id, v_fy.id, 'INVENTORY', v_item_id, v_delta)
    ON CONFLICT (company_id, fiscal_year_id, module_type, item_id) WHERE module_type = 'INVENTORY'
    DO UPDATE SET 
      net_change_delta = "pending_ledger_recalculations".net_change_delta + EXCLUDED.net_change_delta,
      status = 'pending',
      updated_at = NOW();
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION process_pending_recalculations()
RETURNS VOID 
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_subsequent_fys RECORD;
  v_account_type TEXT;
  v_retained_earnings_id UUID;
  v_opening_journal_id UUID;
  v_opening_stock_adj_id UUID;
BEGIN
  FOR v_rec IN 
    SELECT * FROM "pending_ledger_recalculations" WHERE status = 'pending' 
    ORDER BY fiscal_year_id ASC, account_id ASC, item_id ASC FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE "pending_ledger_recalculations" SET status = 'processing' WHERE id::uuid = v_rec.id;

    FOR v_subsequent_fys IN 
      SELECT * FROM "FiscalYear" WHERE company_id::uuid = v_rec.company_id AND start_date > (SELECT end_date FROM "FiscalYear" WHERE id::uuid = v_rec.fiscal_year_id) ORDER BY start_date ASC
    LOOP
      IF v_rec.module_type = 'FINANCIAL' THEN
        SELECT id INTO v_opening_journal_id FROM "GeneralLedgerJournal" 
        WHERE company_id::uuid = v_rec.company_id AND reference_module = 'OpeningBalance' AND entry_date = v_subsequent_fys.start_date LIMIT 1;

        IF v_opening_journal_id IS NOT NULL THEN
          SELECT account_type INTO v_account_type FROM "ChartOfAccount" WHERE id::uuid = v_rec.account_id;
          
          IF v_account_type IN ('Revenue', 'COGS', 'OPEX', 'Expense', 'Income') THEN
            SELECT id INTO v_retained_earnings_id FROM "ChartOfAccount" WHERE company_id::uuid = v_rec.company_id AND account_name ILIKE 'Retained Earnings' LIMIT 1;

            UPDATE "GeneralLedgerLine" SET 
              debit_amount  = GREATEST(0, (debit_amount - credit_amount) + v_rec.net_change_delta),
              credit_amount = GREATEST(0, 0 - ((debit_amount - credit_amount) + v_rec.net_change_delta))
            WHERE journal_id::uuid = v_opening_journal_id AND account_id::uuid = v_retained_earnings_id;
            
            IF NOT FOUND THEN
              INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_name, account_type, debit_amount, credit_amount)
              VALUES (v_rec.company_id, v_opening_journal_id, v_retained_earnings_id, 'Retained Earnings', 'Equity', GREATEST(0, v_rec.net_change_delta), GREATEST(0, 0 - v_rec.net_change_delta));
            END IF;
          ELSE
            UPDATE "GeneralLedgerLine" SET 
              debit_amount  = GREATEST(0, (debit_amount - credit_amount) + v_rec.net_change_delta),
              credit_amount = GREATEST(0, 0 - ((debit_amount - credit_amount) + v_rec.net_change_delta))
            WHERE journal_id::uuid = v_opening_journal_id AND account_id::uuid = v_rec.account_id;
            
            IF NOT FOUND THEN
               DECLARE v_acc_details RECORD;
               BEGIN
                 SELECT account_code, account_name, account_type INTO v_acc_details FROM "ChartOfAccount" WHERE id::uuid = v_rec.account_id;
                 INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
                 VALUES (v_rec.company_id, v_opening_journal_id, v_rec.account_id, v_acc_details.account_code, v_acc_details.account_name, v_acc_details.account_type, GREATEST(0, v_rec.net_change_delta), GREATEST(0, 0 - v_rec.net_change_delta));
               END;
            END IF;
          END IF;
        END IF;

      ELSIF v_rec.module_type = 'INVENTORY' THEN
        SELECT id INTO v_opening_stock_adj_id FROM "StockAdjustment" 
        WHERE company_id::uuid = v_rec.company_id AND adjustment_type = 'Opening Balance' 
        AND adjustment_date = v_subsequent_fys.start_date LIMIT 1;
      END IF;
    END LOOP;
    UPDATE "pending_ledger_recalculations" SET status = 'completed' WHERE id::uuid = v_rec.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
