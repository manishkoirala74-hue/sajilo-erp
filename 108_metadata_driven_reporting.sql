-- 108_metadata_driven_reporting.sql
-- Overhaul reporting to be metadata-driven with strict constraints and proper normal balances.

-- 1. Schema Update with Strict Database Constraints
ALTER TABLE "ChartOfAccount" ADD COLUMN IF NOT EXISTS statement_type TEXT;
ALTER TABLE "ChartOfAccount" ADD COLUMN IF NOT EXISTS statement_group TEXT;
ALTER TABLE "ChartOfAccount" ADD COLUMN IF NOT EXISTS statement_subgroup TEXT;

-- 2. Data Backfill
-- Ensure normal_balance is properly populated where it might be missing
UPDATE "ChartOfAccount"
SET normal_balance = CASE
    WHEN account_type IN ('Asset', 'Expense', 'Expenses', 'COGS', 'OPEX', 'Cost of Goods Sold', 'Other Expense') THEN 'debit'
    WHEN account_type IN ('Liability', 'Equity', 'Revenue', 'Income', 'Other Income') THEN 'credit'
    ELSE 'debit' -- Fallback
END
WHERE normal_balance IS NULL;

-- Initial broad categorization based on account_type
UPDATE "ChartOfAccount"
SET statement_type = CASE
    WHEN account_type IN ('Revenue', 'Income', 'Other Income', 'Expense', 'Expenses', 'COGS', 'Cost of Sales', 'OPEX', 'Operating Expense', 'Cost of Goods Sold', 'Other Expense') THEN 'income_statement'
    ELSE 'balance_sheet'
END,
statement_group = CASE
    WHEN account_type IN ('Revenue', 'Income') THEN 'Revenue'
    WHEN account_type IN ('Other Income') THEN 'Non-Operating Income'
    WHEN account_type IN ('COGS', 'Cost of Sales', 'Cost of Goods Sold') THEN 'Cost of Goods Sold'
    WHEN account_type IN ('Expense', 'Expenses', 'OPEX', 'Operating Expense', 'Other Expense') THEN 'Operating Expenses'
    WHEN account_type = 'Asset' THEN 'Assets'
    WHEN account_type = 'Liability' THEN 'Liabilities'
    WHEN account_type = 'Equity' THEN 'Equity'
    ELSE 'Operating Expenses'
END;

-- "One Last Time" Regex Backfill for precise subgroups/groups
UPDATE "ChartOfAccount"
SET statement_subgroup = 'Sales Returns',
    normal_balance = 'debit'
WHERE statement_group = 'Revenue' AND account_name ILIKE '%return%';

UPDATE "ChartOfAccount"
SET statement_subgroup = 'Sales Discounts',
    normal_balance = 'debit'
WHERE statement_group = 'Revenue' AND (account_name ILIKE '%allowance%' OR account_name ILIKE '%discount%');

UPDATE "ChartOfAccount"
SET statement_group = 'Finance Costs'
WHERE statement_type = 'income_statement' AND (account_name ILIKE '%interest%' OR account_name ILIKE '%bank charge%' OR account_name ILIKE '%finance%');

UPDATE "ChartOfAccount"
SET statement_group = 'Taxes'
WHERE statement_type = 'income_statement' AND account_name ILIKE '%tax%' AND account_name NOT ILIKE '%property%';

UPDATE "ChartOfAccount"
SET statement_subgroup = 'Selling Expenses'
WHERE statement_group = 'Operating Expenses' AND (account_name ILIKE '%sell%' OR account_name ILIKE '%market%' OR account_name ILIKE '%advertis%' OR account_name ILIKE '%commission%' OR account_name ILIKE '%freight out%');

UPDATE "ChartOfAccount"
SET statement_subgroup = 'General & Admin'
WHERE statement_group = 'Operating Expenses' AND statement_subgroup IS NULL;

-- 3. Strict Schema Enforcement
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT check_statement_type CHECK (statement_type IN ('balance_sheet', 'income_statement'));
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT check_statement_group CHECK (statement_group IN ('Revenue', 'Cost of Goods Sold', 'Operating Expenses', 'Non-Operating Income', 'Finance Costs', 'Taxes', 'Assets', 'Liabilities', 'Equity'));
ALTER TABLE "ChartOfAccount" ALTER COLUMN statement_type SET NOT NULL;
ALTER TABLE "ChartOfAccount" ALTER COLUMN statement_group SET NOT NULL;
ALTER TABLE "ChartOfAccount" ALTER COLUMN normal_balance SET NOT NULL;


-- 4. RPC Refactoring
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
      SUM(l.debit_amount) as total_debit,
      SUM(l.credit_amount) as total_credit
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
      SUM(l.debit_amount) as total_debit,
      SUM(l.credit_amount) as total_credit
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
      WHEN LOWER(a.normal_balance) = 'credit' THEN (COALESCE(ca.total_credit, 0) - COALESCE(ca.total_debit, 0))
      ELSE (COALESCE(ca.total_debit, 0) - COALESCE(ca.total_credit, 0))
    END AS current_balance,
    CASE 
      WHEN LOWER(a.normal_balance) = 'credit' THEN (COALESCE(coa.total_credit, 0) - COALESCE(coa.total_debit, 0))
      ELSE (COALESCE(coa.total_debit, 0) - COALESCE(coa.total_credit, 0))
    END AS comparative_balance
  FROM "ChartOfAccount" a
  LEFT JOIN current_activity ca ON a.id = ca.account_id::uuid
  LEFT JOIN comparative_activity coa ON a.id = coa.account_id::uuid
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.statement_type = 'income_statement';
END;
$$;

DROP FUNCTION IF EXISTS get_profit_loss_rpc(uuid, date, date);
CREATE OR REPLACE FUNCTION get_profit_loss_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
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
      SUM(l.debit_amount) as total_debit,
      SUM(l.credit_amount) as total_credit
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
      WHEN LOWER(a.normal_balance) = 'credit' THEN (COALESCE(aa.total_credit, 0) - COALESCE(aa.total_debit, 0))
      ELSE (COALESCE(aa.total_debit, 0) - COALESCE(aa.total_credit, 0))
    END AS balance
  FROM "ChartOfAccount" a
  LEFT JOIN account_activity aa ON a.id = aa.account_id::uuid
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.statement_type = 'income_statement';
END;
$$;
