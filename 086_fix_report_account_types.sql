-- 086_fix_report_account_types.sql
-- Phase 1 Tactical Fix to ensure 'Cost of Sales', 'Expenses', 'Income', 'Operating Expense' are included in Income Statement.

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
    CASE WHEN a.account_type IN ('Asset','COGS','Cost of Sales','Expense','Expenses','OPEX','Operating Expense','Cost of Goods Sold','Other Expense') THEN
      CASE WHEN (COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0)) >= 0 THEN COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0) ELSE 0 END
    ELSE
      CASE WHEN (COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0)) > 0 THEN COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0) ELSE 0 END
    END AS opening_debit,

    CASE WHEN a.account_type NOT IN ('Asset','COGS','Cost of Sales','Expense','Expenses','OPEX','Operating Expense','Cost of Goods Sold','Other Expense') THEN
      CASE WHEN (COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0)) >= 0 THEN COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0) ELSE 0 END
    ELSE
      CASE WHEN (COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0)) > 0 THEN COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0) ELSE 0 END
    END AS opening_credit,

    -- Current Balances
    COALESCE(aa.cur_dr, 0) AS current_debit,
    COALESCE(aa.cur_cr, 0) AS current_credit,

    -- Closing Balances
    CASE WHEN a.account_type IN ('Asset','COGS','Cost of Sales','Expense','Expenses','OPEX','Operating Expense','Cost of Goods Sold','Other Expense') THEN
      CASE WHEN ((COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0))) >= 0 
      THEN (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) ELSE 0 END
    ELSE
      CASE WHEN ((COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0))) > 0 
      THEN (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) ELSE 0 END
    END AS closing_debit,

    CASE WHEN a.account_type NOT IN ('Asset','COGS','Cost of Sales','Expense','Expenses','OPEX','Operating Expense','Cost of Goods Sold','Other Expense') THEN
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
      WHEN a.account_type IN ('Asset','COGS','Cost of Sales','Expense','Expenses','OPEX','Operating Expense','Cost of Goods Sold','Other Expense') THEN COALESCE(aa.net_debit, 0)
      ELSE -COALESCE(aa.net_debit, 0)
    END AS balance
  FROM "ChartOfAccount" a
  LEFT JOIN account_activity aa ON a.id = aa.account_id::uuid
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.account_type IN ('Revenue', 'Income', 'Other Income', 'Expense', 'Expenses', 'COGS', 'Cost of Sales', 'OPEX', 'Operating Expense', 'Cost of Goods Sold', 'Other Expense');
END;
$$;


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
      WHEN a.account_type IN ('Asset','COGS','Cost of Sales','Expense','Expenses','OPEX','Operating Expense','Cost of Goods Sold','Other Expense') THEN COALESCE(ca.net_debit, 0)
      ELSE -COALESCE(ca.net_debit, 0)
    END AS current_balance,
    CASE 
      WHEN a.account_type IN ('Asset','COGS','Cost of Sales','Expense','Expenses','OPEX','Operating Expense','Cost of Goods Sold','Other Expense') THEN COALESCE(coa.net_debit, 0)
      ELSE -COALESCE(coa.net_debit, 0)
    END AS comparative_balance
  FROM "ChartOfAccount" a
  LEFT JOIN current_activity ca ON a.id = ca.account_id::uuid
  LEFT JOIN comparative_activity coa ON a.id = coa.account_id::uuid
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.account_type IN ('Revenue', 'Income', 'Other Income', 'Expense', 'Expenses', 'COGS', 'Cost of Sales', 'OPEX', 'Operating Expense', 'Cost of Goods Sold', 'Other Expense');
END;
$$;
