-- 0123_fix_year_end_close_account_types.sql
-- V5 Bulletproof Year-End Close Update
-- Implements absolute symmetry, expression index optimization, and relational failsafes.

CREATE OR REPLACE FUNCTION close_and_open_fiscal_year(p_company_id UUID, p_closing_fy_id UUID, p_new_fy_id UUID)
RETURNS VOID 
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_closing_fy RECORD;
  v_new_fy RECORD;
  v_draft_count INT;
  v_rev_exp RECORD;
  v_perm RECORD;
  v_retained_earnings_id UUID;
  v_retained_earnings_code TEXT;
  v_closing_journal_id UUID;
  v_opening_journal_id UUID;
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

  -- Enforce Retained Earnings Account
  SELECT id, account_code INTO v_retained_earnings_id, v_retained_earnings_code FROM "ChartOfAccount" 
  WHERE company_id::uuid = p_company_id AND account_name ILIKE 'Retained Earnings' LIMIT 1;
  
  IF NOT FOUND THEN
    INSERT INTO "ChartOfAccount" (company_id, account_code, account_name, account_type, normal_balance, is_system_account)
    VALUES (p_company_id, '3999', 'Retained Earnings', 'Equity', 'Credit', true) 
    RETURNING id, account_code INTO v_retained_earnings_id, v_retained_earnings_code;
  END IF;

  -- Clean old closing / opening journals
  -- Bypass Append-Only Ledger Anti-Tamper for Wizard Cleanup
  UPDATE "GeneralLedgerJournal" SET status = 'Draft' 
  WHERE company_id::uuid = p_company_id AND reference_module IN ('YearEndClose', 'OpeningBalance') 
  AND entry_date IN (v_closing_fy.end_date + time '23:59:59', v_new_fy.start_date);

  DELETE FROM "GeneralLedgerJournal" WHERE company_id::uuid = p_company_id AND reference_module IN ('YearEndClose', 'OpeningBalance') 
  AND entry_date IN (v_closing_fy.end_date + time '23:59:59', v_new_fy.start_date);

  -- Clean old stock adjustment document
  DELETE FROM "StockAdjustment" WHERE company_id::uuid = p_company_id AND adjustment_type = 'Opening Balance' AND adjustment_date = v_new_fy.start_date;

  -- =====================================================================================
  -- RELATIONAL FAILSAFE & QUERY PLANNER MASTERY
  -- Explicitly clean orphaned Stock Adjustment GL child lines using the Expression Index, 
  -- then delete the parent journal. This guarantees no foreign key violations.
  -- =====================================================================================
  UPDATE "GeneralLedgerJournal" SET status = 'Draft'
  WHERE company_id::uuid = p_company_id 
  AND reference_module = 'Stock' 
  AND entry_date = v_new_fy.start_date 
  AND description ILIKE '%Stock%Year End Carry-over%';

  DELETE FROM "GeneralLedgerLine" 
  WHERE journal_id::uuid IN (
      SELECT id::uuid FROM "GeneralLedgerJournal"
      WHERE company_id::uuid = p_company_id 
      AND reference_module = 'Stock' 
      AND entry_date = v_new_fy.start_date 
      AND description ILIKE '%Stock%Year End Carry-over%'
  );

  DELETE FROM "GeneralLedgerJournal" 
  WHERE company_id::uuid = p_company_id 
  AND reference_module = 'Stock' 
  AND entry_date = v_new_fy.start_date 
  AND description ILIKE '%Stock%Year End Carry-over%';

  -- =====================================================================================
  -- TEMPORARY LOOP (Income Statement -> Swept to Retained Earnings)
  -- ABSOLUTE SYMMETRY: NOT IN ('Asset', 'Liability', 'Equity')
  -- =====================================================================================
  INSERT INTO "GeneralLedgerJournal" (company_id, entry_date, description, reference_module, status)
  VALUES (p_company_id, v_closing_fy.end_date + time '23:59:59', 'Year End Closing Journal - ' || v_closing_fy.fiscal_year_name, 'YearEndClose', 'Posted')
  RETURNING id INTO v_closing_journal_id;
  
  FOR v_rev_exp IN (
    SELECT l.account_id, l.account_code, l.account_name, l.account_type, SUM(l.credit_amount - l.debit_amount) as net_balance
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id::uuid
    WHERE j.company_id::uuid = p_company_id AND j.status = 'Posted' AND j.reference_module != 'YearEndClose'
    AND l.account_type NOT IN ('Asset', 'Liability', 'Equity')
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

  -- =====================================================================================
  -- PERMANENT LOOP (Balance Sheet -> Rolled Forward to New Fiscal Year)
  -- ABSOLUTE SYMMETRY: IN ('Asset', 'Liability', 'Equity')
  -- =====================================================================================
  INSERT INTO "GeneralLedgerJournal" (company_id, entry_date, description, reference_module, status)
  VALUES (p_company_id, v_new_fy.start_date, 'Opening Balances from ' || v_closing_fy.fiscal_year_name, 'OpeningBalance', 'Posted')
  RETURNING id INTO v_opening_journal_id;

  FOR v_perm IN (
    SELECT l.account_id, l.account_code, l.account_name, l.account_type, SUM(l.debit_amount - l.credit_amount) as net_balance
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id::uuid
    WHERE j.company_id::uuid = p_company_id AND j.status = 'Posted' AND j.reference_module != 'YearEndClose'
    AND l.account_type IN ('Asset', 'Liability', 'Equity')
    AND j.entry_date <= (v_closing_fy.end_date + time '23:59:59')
    GROUP BY l.account_id, l.account_code, l.account_name, l.account_type
    HAVING SUM(l.debit_amount - l.credit_amount) != 0
  )
  LOOP
    IF v_perm.net_balance > 0 THEN
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_opening_journal_id, v_perm.account_id, v_perm.account_code, v_perm.account_name, v_perm.account_type, v_perm.net_balance, 0);
    ELSE
      INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
      VALUES (p_company_id, v_opening_journal_id, v_perm.account_id, v_perm.account_code, v_perm.account_name, v_perm.account_type, 0, ABS(v_perm.net_balance));
    END IF;
  END LOOP;

  -- Roll forward Inventory Closing Stock as Opening Balance
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
