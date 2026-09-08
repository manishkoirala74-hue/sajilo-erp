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
