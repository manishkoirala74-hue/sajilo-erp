-- 0115_fix_profit_loss_rpc_metadata.sql
-- Restores `statement_group`, `statement_subgroup`, and `normal_balance` to the P&L RPCs
-- These were introduced in migration 108 but accidentally dropped in migration 048 (which was run later in the deployment sequence).

-- 1. Comparative Profit & Loss RPC
DROP FUNCTION IF EXISTS get_comparative_profit_loss_rpc(uuid, date, date, date, date);
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
  statement_group TEXT,
  statement_subgroup TEXT,
  normal_balance TEXT,
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
    a.statement_group,
    a.statement_subgroup,
    a.normal_balance,
    CASE 
      WHEN LOWER(a.normal_balance) = 'credit' THEN -COALESCE(ca.net_debit, 0)
      ELSE COALESCE(ca.net_debit, 0)
    END AS current_balance,
    CASE 
      WHEN LOWER(a.normal_balance) = 'credit' THEN -COALESCE(coa.net_debit, 0)
      ELSE COALESCE(coa.net_debit, 0)
    END AS comparative_balance
  FROM "ChartOfAccount" a
  LEFT JOIN current_activity ca ON a.id = ca.account_id::uuid
  LEFT JOIN comparative_activity coa ON a.id = coa.account_id::uuid
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.statement_type = 'income_statement';
END;
$$;


-- 2. Standard Profit & Loss RPC
DROP FUNCTION IF EXISTS get_profit_loss_rpc(uuid, date, date);
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
  statement_group TEXT,
  statement_subgroup TEXT,
  normal_balance TEXT,
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
    a.statement_group,
    a.statement_subgroup,
    a.normal_balance,
    CASE 
      WHEN LOWER(a.normal_balance) = 'credit' THEN -COALESCE(aa.net_debit, 0)
      ELSE COALESCE(aa.net_debit, 0)
    END AS balance
  FROM "ChartOfAccount" a
  LEFT JOIN account_activity aa ON a.id = aa.account_id::uuid
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.statement_type = 'income_statement';
END;
$$;
