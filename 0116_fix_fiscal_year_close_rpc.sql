-- 0116_fix_fiscal_year_close_rpc.sql
-- ZERO-TRUST SCHEMA VERSION

CREATE OR REPLACE FUNCTION close_and_open_fiscal_year(p_company_id UUID, p_closing_fy_id UUID, p_new_fy_id UUID)
RETURNS VOID AS $$
DECLARE
  v_closing_fy RECORD;
  v_new_fy RECORD;
  v_draft_count INTEGER;
  v_retained_earnings_id UUID;
  v_retained_earnings_code TEXT;
  v_closing_journal_id UUID;
  v_opening_journal_id UUID;
  v_net_profit NUMERIC := 0;
  v_rev_exp RECORD;
  v_perm RECORD;
BEGIN
  SELECT * INTO v_closing_fy FROM "FiscalYear" WHERE id = p_closing_fy_id AND company_id = p_company_id;
  SELECT * INTO v_new_fy FROM "FiscalYear" WHERE id = p_new_fy_id AND company_id = p_company_id;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid Fiscal Year parameters.'; END IF;

  SELECT COUNT(*) INTO v_draft_count FROM "GeneralLedgerJournal" 
  WHERE company_id = p_company_id AND status = 'Draft' 
  AND entry_date BETWEEN v_closing_fy.start_date AND v_closing_fy.end_date;
  
  IF v_draft_count > 0 THEN RAISE EXCEPTION 'Cannot close fiscal year. There are % draft/unposted journals.', v_draft_count; END IF;

  SELECT id, account_code INTO v_retained_earnings_id, v_retained_earnings_code FROM "ChartOfAccount" 
  WHERE company_id = p_company_id AND account_name ILIKE 'Retained Earnings' LIMIT 1;
  
  IF NOT FOUND THEN
    INSERT INTO "ChartOfAccount" (company_id, account_code, account_name, account_type, normal_balance, is_system_account)
    VALUES (p_company_id, '3999', 'Retained Earnings', 'Equity', 'Credit', true) 
    RETURNING id, account_code INTO v_retained_earnings_id, v_retained_earnings_code;
  END IF;

  DELETE FROM "GeneralLedgerJournal" WHERE company_id = p_company_id AND reference_module IN ('YearEndClose', 'OpeningBalance') 
  AND entry_date IN (v_closing_fy.end_date + time '23:59:59', v_new_fy.start_date);
  
  DELETE FROM "StockAdjustment" WHERE company_id = p_company_id AND adjustment_type = 'Opening Balance' AND adjustment_date = v_new_fy.start_date;

  INSERT INTO "GeneralLedgerJournal" (company_id, entry_date, description, reference_module, status)
  VALUES (p_company_id, v_closing_fy.end_date + time '23:59:59', 'Year End Closing Journal - ' || v_closing_fy.fiscal_year_name, 'YearEndClose', 'Posted')
  RETURNING id INTO v_closing_journal_id;

  -- ZERO-TRUST: Explicitly cast l.journal_id to utilize the new Expression Index
  FOR v_rev_exp IN (
    SELECT l.account_id, l.account_code, l.account_name, l.account_type, SUM(l.credit_amount - l.debit_amount) as net_balance
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id
    WHERE j.company_id = p_company_id AND j.entry_date BETWEEN v_closing_fy.start_date AND v_closing_fy.end_date
    AND j.status = 'Posted' AND j.reference_module != 'YearEndClose'
    AND l.account_type IN ('Revenue', 'COGS', 'OPEX', 'Expense', 'Income', 'Cost of Goods Sold', 'Other Expense', 'Other Income')
    GROUP BY l.account_id, l.account_code, l.account_name, l.account_type
    HAVING SUM(l.credit_amount - l.debit_amount) != 0
  ) LOOP
    IF v_rev_exp.net_balance > 0 THEN 
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_closing_journal_id, v_rev_exp.account_id, v_rev_exp.account_code, v_rev_exp.account_name, v_rev_exp.account_type, v_rev_exp.net_balance, 0);
    ELSE 
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_closing_journal_id, v_rev_exp.account_id, v_rev_exp.account_code, v_rev_exp.account_name, v_rev_exp.account_type, 0, ABS(v_rev_exp.net_balance));
    END IF;
    v_net_profit := v_net_profit + v_rev_exp.net_balance;
  END LOOP;

  IF v_net_profit > 0 THEN
    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
    VALUES (p_company_id, v_closing_journal_id, v_retained_earnings_id, v_retained_earnings_code, 'Retained Earnings', 'Equity', 0, v_net_profit);
  ELSIF v_net_profit < 0 THEN
    INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
    VALUES (p_company_id, v_closing_journal_id, v_retained_earnings_id, v_retained_earnings_code, 'Retained Earnings', 'Equity', ABS(v_net_profit), 0);
  END IF;

  INSERT INTO "GeneralLedgerJournal" (company_id, entry_date, description, reference_module, status)
  VALUES (p_company_id, v_new_fy.start_date, 'Opening Balances from ' || v_closing_fy.fiscal_year_name, 'OpeningBalance', 'Posted')
  RETURNING id INTO v_opening_journal_id;

  -- ZERO-TRUST: Explicitly cast l.journal_id to utilize the new Expression Index
  FOR v_perm IN (
    SELECT l.account_id, l.account_code, l.account_name, l.account_type, SUM(l.debit_amount - l.credit_amount) as net_balance
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id
    WHERE j.company_id = p_company_id AND j.entry_date <= (v_closing_fy.end_date + time '23:59:59')
    AND j.status = 'Posted'
    AND l.account_type NOT IN ('Revenue', 'COGS', 'OPEX', 'Expense', 'Income', 'Cost of Goods Sold', 'Other Expense', 'Other Income')
    GROUP BY l.account_id, l.account_code, l.account_name, l.account_type
    HAVING SUM(l.debit_amount - l.credit_amount) != 0
  ) LOOP
    IF v_perm.net_balance > 0 THEN
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_opening_journal_id, v_perm.account_id, v_perm.account_code, v_perm.account_name, v_perm.account_type, v_perm.net_balance, 0);
    ELSE
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_opening_journal_id, v_perm.account_id, v_perm.account_code, v_perm.account_name, v_perm.account_type, 0, ABS(v_perm.net_balance));
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public."InventoryLedger" 
    WHERE company_id = p_company_id AND transaction_date <= (v_closing_fy.end_date + time '23:59:59')
    GROUP BY item_id HAVING SUM(in_qty - out_qty) > 0
  ) THEN
    INSERT INTO "StockAdjustment" (company_id, adjustment_number, adjustment_date, adjustment_type, reason, status, line_items)
    SELECT 
      p_company_id, 'OPEN-' || v_new_fy.fiscal_year_name, v_new_fy.start_date, 'Opening Balance', 'Year End Carry-over', 'Posted',
      COALESCE(jsonb_agg(jsonb_build_object('item_id', hist.item_id, 'item_code', i.item_code, 'item_name', i.item_name, 'quantity', hist.closing_qty, 'unit_cost', COALESCE(i.cost_price, 0))), '[]'::jsonb)
    FROM (
      SELECT item_id, SUM(in_qty - out_qty) as closing_qty
      FROM public."InventoryLedger"
      WHERE company_id = p_company_id AND transaction_date <= (v_closing_fy.end_date + time '23:59:59')
      GROUP BY item_id HAVING SUM(in_qty - out_qty) > 0
    ) hist
    JOIN "Item" i ON hist.item_id::uuid = i.id;
  END IF;

  UPDATE "FiscalYear" SET status = 'SOFT_CLOSED' WHERE id = p_closing_fy_id;
END;
$$ LANGUAGE plpgsql;
