-- =====================================================================================
-- Migration: 0129_fix_year_end_voucher_no
-- Purpose: Generates predictable voucher numbers for Year End Close journals and 
--          retroactively cleans up corrupted UUID-based voucher_no values.
-- =====================================================================================

BEGIN;

-- 1. Patch the Year End Closing function
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

  -- Delete existing YearEndClose for idempotency (FK Failsafe applied)
  UPDATE "GeneralLedgerJournal" SET status = 'Draft' WHERE company_id::uuid = p_company_id AND reference_module = 'YearEndClose' AND entry_date = (v_closing_fy.end_date + time '23:59:59');
  DELETE FROM "GeneralLedgerLine" WHERE journal_id IN (SELECT id FROM "GeneralLedgerJournal" WHERE company_id::uuid = p_company_id AND reference_module = 'YearEndClose' AND entry_date = (v_closing_fy.end_date + time '23:59:59'));
  DELETE FROM "GeneralLedgerJournal" WHERE company_id::uuid = p_company_id AND reference_module = 'YearEndClose' AND entry_date = (v_closing_fy.end_date + time '23:59:59');

  -- INSERT WITH EXPLICIT VOUCHER_NO
  INSERT INTO "GeneralLedgerJournal" (company_id, entry_date, description, reference_module, status, voucher_no)
  VALUES (p_company_id, v_closing_fy.end_date + time '23:59:59', 'Year End Closing Journal - ' || v_closing_fy.fiscal_year_name, 'YearEndClose', 'Posted', 'YEC-' || TO_CHAR(v_closing_fy.end_date, 'YYYYMMDD'))
  RETURNING id INTO v_closing_journal_id;
  
  -- LIVE METADATA NEGATIVE FILTERING
  FOR v_rev_exp IN (
    SELECT l.account_id, l.account_code, l.account_name, a.account_type, SUM(l.credit_amount - l.debit_amount) as net_balance
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id::uuid
    JOIN "ChartOfAccount" a ON l.account_id::uuid = a.id::uuid
    WHERE j.company_id::uuid = p_company_id AND j.status = 'Posted' AND j.reference_module != 'YearEndClose'
    AND a.account_type NOT IN ('Asset', 'Liability', 'Equity')
    AND j.entry_date BETWEEN v_closing_fy.start_date AND v_closing_fy.end_date
    GROUP BY l.account_id, l.account_code, l.account_name, a.account_type
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

  UPDATE "FiscalYear" SET status = 'SOFT_CLOSED' WHERE id::uuid = p_closing_fy_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Retroactively fix old YearEndClose journals
UPDATE "GeneralLedgerJournal"
SET voucher_no = 'YEC-' || TO_CHAR(entry_date, 'YYYYMMDD')
WHERE reference_module = 'YearEndClose' 
  AND (voucher_no IS NULL OR voucher_no = '' OR voucher_no = id::text);

COMMIT;
