BEGIN;

DROP FUNCTION IF EXISTS get_comparative_profit_loss_rpc(uuid, date, date, date, date) CASCADE;
DROP FUNCTION IF EXISTS get_comparative_profit_loss_rpc(uuid, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone) CASCADE;

DROP FUNCTION IF EXISTS get_profit_loss_rpc(uuid, date, date) CASCADE;
DROP FUNCTION IF EXISTS get_profit_loss_rpc(uuid, timestamp with time zone, timestamp with time zone) CASCADE;

DROP FUNCTION IF EXISTS get_balance_sheet_rpc(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS get_balance_sheet_rpc(uuid, timestamp with time zone) CASCADE;



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
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
      AND j.entry_date >= (v_actual_from_date::DATE AT TIME ZONE 'Asia/Kathmandu')
      AND j.entry_date < ((p_to_date::DATE + INTERVAL '1 day') AT TIME ZONE 'Asia/Kathmandu')
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
      AND j.entry_date >= (v_actual_comp_from_date::DATE AT TIME ZONE 'Asia/Kathmandu')
      AND j.entry_date < ((p_comp_to_date::DATE + INTERVAL '1 day') AT TIME ZONE 'Asia/Kathmandu')
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


CREATE OR REPLACE FUNCTION get_profit_loss_rpc(
  p_company_id UUID, 
  p_from_date DATE, 
  p_to_date DATE
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
  statement_group TEXT,
  statement_subgroup TEXT,
  normal_balance TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
      AND j.entry_date >= (v_actual_from_date::DATE AT TIME ZONE 'Asia/Kathmandu')
      AND j.entry_date < ((p_to_date::DATE + INTERVAL '1 day') AT TIME ZONE 'Asia/Kathmandu')
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
    a.statement_group,
    a.statement_subgroup,
    a.normal_balance
  FROM "ChartOfAccount" a
  LEFT JOIN current_activity ca ON a.id = ca.account_id::uuid
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.financial_statement = 'income_statement';
END;
$$;


CREATE OR REPLACE FUNCTION get_balance_sheet_rpc(p_company_id UUID, p_as_of_date DATE)
RETURNS TABLE (
    id UUID,
    parent_account_id UUID,
    account_code TEXT,
    account_name TEXT,
    account_type TEXT,
    ledger_type TEXT,
    closing_balance NUMERIC,
    normal_balance TEXT
) AS $$
DECLARE
    v_active_fy RECORD;
    v_current_year_earnings NUMERIC := 0;
BEGIN
    -- 1. Calculate dynamically un-swept Current Year Earnings if in an open fiscal year
    SELECT * INTO v_active_fy FROM "FiscalYear" 
    WHERE company_id::uuid = p_company_id AND p_as_of_date BETWEEN start_date AND end_date LIMIT 1;
    
    IF v_active_fy.id IS NOT NULL THEN
        SELECT COALESCE(SUM(l.credit_amount - l.debit_amount), 0) INTO v_current_year_earnings
        FROM "GeneralLedgerLine" l
        JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
        JOIN "ChartOfAccount" a ON l.account_id = a.id
        WHERE j.company_id = p_company_id
          AND l.company_id = p_company_id
          AND j.status = 'Posted'
          AND j.reference_module NOT IN ('YearEndClose', 'OpeningBalance')
          AND a.financial_statement = 'income_statement'
          AND j.entry_date >= (v_active_fy.start_date::DATE AT TIME ZONE 'Asia/Kathmandu')
          AND j.entry_date < ((p_as_of_date::DATE + INTERVAL '1 day') AT TIME ZONE 'Asia/Kathmandu');
    END IF;

    RETURN QUERY
    WITH RECURSIVE 
    -- FIX: Pre-aggregate only valid, posted ledger lines up to the as_of_date
    filtered_lines AS (
        SELECT 
            l.account_id,
            SUM(l.debit_amount) AS total_debit,
            SUM(l.credit_amount) AS total_credit
        FROM "GeneralLedgerLine" l
        JOIN "GeneralLedgerJournal" j ON j.id = l.journal_id
        WHERE j.status = 'Posted' 
          AND j.company_id = p_company_id
          AND l.company_id = p_company_id
          AND j.entry_date < ((p_as_of_date::DATE + INTERVAL '1 day') AT TIME ZONE 'Asia/Kathmandu')
        GROUP BY l.account_id
    ),
    -- 1. Get raw balances for all accounts
    account_balances AS (
        SELECT 
            a.id AS account_id,
            a.parent_account_id,
            a.account_code,
            a.account_name,
            a.account_type,
            a.ledger_type,
            a.normal_balance,
            a.opening_balance,
            a.opening_balance_type,
            COALESCE(fl.total_debit, 0) AS total_debit,
            COALESCE(fl.total_credit, 0) + CASE WHEN a.account_name = 'Current Year Earnings' THEN v_current_year_earnings ELSE 0 END AS total_credit
        FROM "ChartOfAccount" a
        LEFT JOIN filtered_lines fl ON fl.account_id = a.id
        WHERE a.company_id = p_company_id AND a.is_active = true
    ),
    -- 2. Compute individual closing balances (for Sub Ledgers and base Group Ledgers)
    base_computed AS (
        SELECT 
            ab.account_id,
            ab.parent_account_id,
            ab.account_code,
            ab.account_name,
            ab.account_type,
            ab.ledger_type,
            ab.normal_balance,
            -- Determine opening balance correctly
            CASE 
                WHEN ab.opening_balance_type = 'Dr' AND LOWER(ab.normal_balance) = 'debit' THEN COALESCE(ab.opening_balance, 0)
                WHEN ab.opening_balance_type = 'Cr' AND LOWER(ab.normal_balance) = 'credit' THEN COALESCE(ab.opening_balance, 0)
                WHEN ab.opening_balance_type = 'Cr' AND LOWER(ab.normal_balance) = 'debit' THEN -COALESCE(ab.opening_balance, 0)
                WHEN ab.opening_balance_type = 'Dr' AND LOWER(ab.normal_balance) = 'credit' THEN -COALESCE(ab.opening_balance, 0)
                ELSE COALESCE(ab.opening_balance, 0)
            END AS base_ob,
            ab.total_debit,
            ab.total_credit,
            -- Closing balance logic based on normal_balance
            CASE 
                WHEN LOWER(ab.normal_balance) = 'debit' THEN 
                    (CASE WHEN ab.opening_balance_type = 'Dr' THEN COALESCE(ab.opening_balance, 0) ELSE -COALESCE(ab.opening_balance, 0) END) + ab.total_debit - ab.total_credit
                ELSE 
                    (CASE WHEN ab.opening_balance_type = 'Cr' THEN COALESCE(ab.opening_balance, 0) ELSE -COALESCE(ab.opening_balance, 0) END) + ab.total_credit - ab.total_debit
            END AS ind_closing_balance
        FROM account_balances ab
    ),
    -- 3. Prepare for recursive rollup: Start with leaf nodes passing their balance up
    hierarchy AS (
        -- Base case: All accounts
        SELECT 
            bc.account_id,
            bc.parent_account_id,
            bc.account_code,
            bc.account_name,
            bc.account_type,
            bc.ledger_type,
            bc.normal_balance,
            bc.ind_closing_balance AS rolled_up_balance,
            bc.account_id AS source_account_id
        FROM base_computed bc

        UNION ALL

        -- Recursive step: propagate rolled_up_balance up to the parent
        SELECT 
            p.account_id,
            p.parent_account_id,
            p.account_code,
            p.account_name,
            p.account_type,
            p.ledger_type,
            p.normal_balance,
            h.rolled_up_balance,
            h.source_account_id
        FROM hierarchy h
        JOIN base_computed p ON h.parent_account_id = p.account_id
    )
    -- 4. Aggregate rolled up balances for each account
    SELECT 
        account_id AS id,
        parent_account_id,
        account_code,
        account_name,
        account_type,
        ledger_type,
        SUM(rolled_up_balance) AS closing_balance,
        normal_balance
    FROM hierarchy
    GROUP BY account_id, parent_account_id, account_code, account_name, account_type, ledger_type, normal_balance
    ORDER BY account_code NULLS FIRST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

COMMIT;
