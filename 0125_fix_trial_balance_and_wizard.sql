-- 0125_fix_trial_balance_and_wizard.sql
-- Transition to a pure Continuous Ledger architecture.
-- Features: FK Failsafes, Live Metadata Symmetry, and FY Clamping.

BEGIN;

-- =====================================================================================
-- 1. The Great Cleanup (With FK Failsafes and Anti-Tamper Bypass)
-- =====================================================================================
UPDATE "GeneralLedgerJournal" SET status = 'Draft' WHERE reference_module = 'OpeningBalance';
DELETE FROM "GeneralLedgerLine" WHERE journal_id IN (SELECT id FROM "GeneralLedgerJournal" WHERE reference_module = 'OpeningBalance');
DELETE FROM "GeneralLedgerJournal" WHERE reference_module = 'OpeningBalance';

DELETE FROM "StockAdjustment" WHERE adjustment_type = 'Opening Balance';

-- =====================================================================================
-- 2. Wizard Refactor (Live Metadata & Absolute Symmetry)
-- =====================================================================================
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

  INSERT INTO "GeneralLedgerJournal" (company_id, entry_date, description, reference_module, status)
  VALUES (p_company_id, v_closing_fy.end_date + time '23:59:59', 'Year End Closing Journal - ' || v_closing_fy.fiscal_year_name, 'YearEndClose', 'Posted')
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

-- =====================================================================================
-- 3. Delta Queue Refactor (Live Metadata & Target YearEndClose)
-- =====================================================================================
CREATE OR REPLACE FUNCTION process_pending_recalculations()
RETURNS VOID 
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_account_type TEXT;
  v_retained_earnings_id UUID;
  v_closing_journal_id UUID;
  v_closing_fy RECORD;
BEGIN
  FOR v_rec IN 
    SELECT * FROM "pending_ledger_recalculations" WHERE status = 'pending' 
    ORDER BY fiscal_year_id ASC, account_id ASC, item_id ASC FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE "pending_ledger_recalculations" SET status = 'processing' WHERE id::uuid = v_rec.id;

    IF v_rec.module_type = 'FINANCIAL' THEN
      SELECT account_type INTO v_account_type FROM "ChartOfAccount" WHERE id::uuid = v_rec.account_id;
      
      -- LIVE METADATA NEGATIVE FILTERING
      IF v_account_type NOT IN ('Asset', 'Liability', 'Equity') THEN
        SELECT * INTO v_closing_fy FROM "FiscalYear" WHERE id::uuid = v_rec.fiscal_year_id;
        
        SELECT id INTO v_closing_journal_id FROM "GeneralLedgerJournal" 
        WHERE company_id::uuid = v_rec.company_id AND reference_module = 'YearEndClose' 
        AND entry_date = (v_closing_fy.end_date + time '23:59:59') LIMIT 1;

        IF v_closing_journal_id IS NOT NULL THEN
          SELECT id INTO v_retained_earnings_id FROM "ChartOfAccount" WHERE company_id::uuid = v_rec.company_id AND account_name ILIKE 'Retained Earnings' LIMIT 1;

          -- Adjust the P&L Account Line to offset the delta
          UPDATE "GeneralLedgerLine" SET 
            debit_amount  = GREATEST(0, (debit_amount - credit_amount) + (0 - v_rec.net_change_delta)),
            credit_amount = GREATEST(0, 0 - ((debit_amount - credit_amount) + (0 - v_rec.net_change_delta)))
          WHERE journal_id::uuid = v_closing_journal_id AND account_id::uuid = v_rec.account_id;
          
          IF NOT FOUND THEN
             DECLARE v_acc_details RECORD;
             BEGIN
               SELECT account_code, account_name, account_type INTO v_acc_details FROM "ChartOfAccount" WHERE id::uuid = v_rec.account_id;
               INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_code, account_name, account_type, debit_amount, credit_amount)
               VALUES (v_rec.company_id, v_closing_journal_id, v_rec.account_id, v_acc_details.account_code, v_acc_details.account_name, v_acc_details.account_type, GREATEST(0, 0 - v_rec.net_change_delta), GREATEST(0, v_rec.net_change_delta));
             END;
          END IF;

          -- Adjust the Retained Earnings Line to absorb the delta
          UPDATE "GeneralLedgerLine" SET 
            debit_amount  = GREATEST(0, (debit_amount - credit_amount) + v_rec.net_change_delta),
            credit_amount = GREATEST(0, 0 - ((debit_amount - credit_amount) + v_rec.net_change_delta))
          WHERE journal_id::uuid = v_closing_journal_id AND account_id::uuid = v_retained_earnings_id;
          
          IF NOT FOUND THEN
            INSERT INTO "GeneralLedgerLine" (company_id, journal_id, account_id, account_name, account_type, debit_amount, credit_amount)
            VALUES (v_rec.company_id, v_closing_journal_id, v_retained_earnings_id, 'Retained Earnings', 'Equity', GREATEST(0, v_rec.net_change_delta), GREATEST(0, 0 - v_rec.net_change_delta));
          END IF;
        END IF;
      END IF;
    END IF;
    
    -- Explicitly mark as completed. 
    UPDATE "pending_ledger_recalculations" SET status = 'completed' WHERE id::uuid = v_rec.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- 4. P&L Boundary Clamping (With your custom UI columns preserved)
-- =====================================================================================
DROP FUNCTION IF EXISTS get_profit_loss_rpc(uuid, date, date);
DROP FUNCTION IF EXISTS get_profit_loss_rpc(uuid, timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION get_profit_loss_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
  id UUID,
  parent_account_id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  account_subtype TEXT,
  ledger_type TEXT,
  balance NUMERIC,
  statement_group TEXT,
  statement_subgroup TEXT,
  normal_balance TEXT
) LANGUAGE plpgsql AS $$
DECLARE
  v_active_fy RECORD;
  v_actual_from_date DATE;
BEGIN
  SELECT * INTO v_active_fy FROM "FiscalYear" 
  WHERE company_id::uuid = p_company_id AND p_to_date BETWEEN start_date AND end_date LIMIT 1;
  
  IF v_active_fy.id IS NOT NULL THEN
    v_actual_from_date := GREATEST(p_from_date, v_active_fy.start_date);
  ELSE
    v_actual_from_date := p_from_date;
  END IF;

  RETURN QUERY
  WITH account_activity AS (
    SELECT
      l.account_id,
      SUM(l.debit_amount - l.credit_amount) as net_debit
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id
    WHERE j.status = 'Posted'
      AND j.reference_module NOT IN ('YearEndClose', 'OpeningBalance')
      AND l.company_id = p_company_id
      AND j.company_id = p_company_id
      AND j.entry_date::DATE >= v_actual_from_date
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
      WHEN LOWER(COALESCE(a.normal_balance, '')) = 'debit' THEN COALESCE(aa.net_debit, 0)
      ELSE -COALESCE(aa.net_debit, 0)
    END AS balance,
    a.statement_group,
    a.statement_subgroup,
    a.normal_balance
  FROM "ChartOfAccount" a
  LEFT JOIN account_activity aa ON a.id = aa.account_id::uuid
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.financial_statement = 'income_statement';
END;
$$;


DROP FUNCTION IF EXISTS get_comparative_profit_loss_rpc(uuid, date, date, date, date);
DROP FUNCTION IF EXISTS get_comparative_profit_loss_rpc(uuid, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone);

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
  comparative_balance NUMERIC,
  statement_group TEXT,
  statement_subgroup TEXT,
  normal_balance TEXT
) LANGUAGE plpgsql AS $$
DECLARE
  v_active_fy RECORD;
  v_actual_from_date DATE;
  v_comp_fy RECORD;
  v_actual_comp_from_date DATE;
BEGIN
  -- Clamp Current Period
  SELECT * INTO v_active_fy FROM "FiscalYear" 
  WHERE company_id::uuid = p_company_id AND p_to_date BETWEEN start_date AND end_date LIMIT 1;
  
  IF v_active_fy.id IS NOT NULL THEN
    v_actual_from_date := GREATEST(p_from_date, v_active_fy.start_date);
  ELSE
    v_actual_from_date := p_from_date;
  END IF;

  -- Clamp Comparative Period
  SELECT * INTO v_comp_fy FROM "FiscalYear" 
  WHERE company_id::uuid = p_company_id AND p_comp_to_date BETWEEN start_date AND end_date LIMIT 1;
  
  IF v_comp_fy.id IS NOT NULL THEN
    v_actual_comp_from_date := GREATEST(p_comp_from_date, v_comp_fy.start_date);
  ELSE
    v_actual_comp_from_date := p_comp_from_date;
  END IF;

  RETURN QUERY
  WITH current_activity AS (
    SELECT
      l.account_id,
      SUM(l.debit_amount - l.credit_amount) as net_debit
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id::uuid = j.id
    WHERE j.status = 'Posted'
      AND j.reference_module NOT IN ('YearEndClose', 'OpeningBalance')
      AND l.company_id = p_company_id
      AND j.company_id = p_company_id
      AND j.entry_date::DATE >= v_actual_from_date
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
      AND j.reference_module NOT IN ('YearEndClose', 'OpeningBalance')
      AND l.company_id = p_company_id
      AND j.company_id = p_company_id
      AND j.entry_date::DATE >= v_actual_comp_from_date
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
      WHEN LOWER(COALESCE(a.normal_balance, '')) = 'debit' THEN COALESCE(ca.net_debit, 0)
      ELSE -COALESCE(ca.net_debit, 0)
    END AS current_balance,
    CASE 
      WHEN LOWER(COALESCE(a.normal_balance, '')) = 'debit' THEN COALESCE(coa.net_debit, 0)
      ELSE -COALESCE(coa.net_debit, 0)
    END AS comparative_balance,
    a.statement_group,
    a.statement_subgroup,
    a.normal_balance
  FROM "ChartOfAccount" a
  LEFT JOIN current_activity ca ON a.id = ca.account_id::uuid
  LEFT JOIN comparative_activity coa ON a.id = coa.account_id::uuid
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.financial_statement = 'income_statement';
END;
$$;

COMMIT;
