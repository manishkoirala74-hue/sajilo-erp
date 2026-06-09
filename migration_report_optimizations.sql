-- ==========================================
-- SAJILO-ERP REPORTING OPTIMIZATION MIGRATION
-- ==========================================

-- 1. Indexing Specifications
-- These indexes prevent sequential scans during large date-range queries.
CREATE INDEX IF NOT EXISTS idx_gl_journal_status_date ON "GeneralLedgerJournal" (status, entry_date);
CREATE INDEX IF NOT EXISTS idx_gl_line_journal_account ON "GeneralLedgerLine" (journal_id, account_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_status_date ON "SalesInvoice" (status, payment_status, invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_status_date ON "PurchaseInvoice" (status, payment_status, invoice_date);

-- 2. Trial Balance RPC
-- Aggregates opening, current, and closing balances server-side.
CREATE OR REPLACE FUNCTION get_trial_balance_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
  id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  ledger_type TEXT,
  parent_account_id TEXT,
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
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::text
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
    CASE WHEN a.account_type IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN
      CASE WHEN (COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0)) >= 0 THEN COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0) ELSE 0 END
    ELSE
      CASE WHEN (COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0)) > 0 THEN COALESCE(aa.ob_dr, 0) - COALESCE(aa.ob_cr, 0) ELSE 0 END
    END AS opening_debit,

    CASE WHEN a.account_type NOT IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN
      CASE WHEN (COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0)) >= 0 THEN COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0) ELSE 0 END
    ELSE
      CASE WHEN (COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0)) > 0 THEN COALESCE(aa.ob_cr, 0) - COALESCE(aa.ob_dr, 0) ELSE 0 END
    END AS opening_credit,

    -- Current Balances
    COALESCE(aa.cur_dr, 0) AS current_debit,
    COALESCE(aa.cur_cr, 0) AS current_credit,

    -- Closing Balances
    CASE WHEN a.account_type IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN
      CASE WHEN ((COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0))) >= 0 
      THEN (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) ELSE 0 END
    ELSE
      CASE WHEN ((COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0))) > 0 
      THEN (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) - (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) ELSE 0 END
    END AS closing_debit,

    CASE WHEN a.account_type NOT IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN
      CASE WHEN ((COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) - (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0))) >= 0 
      THEN (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) - (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) ELSE 0 END
    ELSE
      CASE WHEN ((COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) - (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0))) > 0 
      THEN (COALESCE(aa.ob_cr, 0) + COALESCE(aa.cur_cr, 0)) - (COALESCE(aa.ob_dr, 0) + COALESCE(aa.cur_dr, 0)) ELSE 0 END
    END AS closing_credit

  FROM "ChartOfAccount" a
  LEFT JOIN account_activity aa ON a.id::text = aa.account_id
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

-- 3. Profit & Loss RPC
CREATE OR REPLACE FUNCTION get_profit_loss_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
  id UUID,
  parent_account_id TEXT,
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
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::text
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
      WHEN a.account_type IN ('Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense') THEN COALESCE(aa.net_debit, 0)
      ELSE -COALESCE(aa.net_debit, 0)
    END AS balance
  FROM "ChartOfAccount" a
  LEFT JOIN account_activity aa ON a.id::text = aa.account_id
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND a.account_type IN ('Revenue', 'Other Income', 'Expense', 'COGS', 'OPEX', 'Cost of Goods Sold', 'Other Expense');
END;
$$;

-- 4. GL Summary RPC
CREATE OR REPLACE FUNCTION get_gl_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
  id UUID,
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  debit NUMERIC,
  credit NUMERIC
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.account_code,
    a.account_name,
    a.account_type,
    COALESCE(SUM(l.debit_amount), 0) AS debit,
    COALESCE(SUM(l.credit_amount), 0) AS credit
  FROM "ChartOfAccount" a
  JOIN "GeneralLedgerLine" l ON a.id::text = l.account_id AND l.company_id = p_company_id
  JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::text AND j.company_id = p_company_id
  WHERE a.company_id = p_company_id
    AND a.is_active = true
    AND j.status = 'Posted'
    AND j.entry_date::DATE >= p_from_date
    AND j.entry_date::DATE <= p_to_date
  GROUP BY a.id, a.account_code, a.account_name, a.account_type
  HAVING COALESCE(SUM(l.debit_amount), 0) > 0 OR COALESCE(SUM(l.credit_amount), 0) > 0;
END;
$$;
