-- ============================================================
-- 129_day_book_rpc.sql
-- Day Book RPC — returns aggregated JSON payload with Unified CTE
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_day_book_rpc(
  p_company_id UUID,
  p_date       DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening_cash NUMERIC := 0;
  v_closing_cash NUMERIC := 0;
  v_result       JSONB;
BEGIN
  -- Tenant Security Check (Cross-Tenant Leak Prevention)
  IF NOT EXISTS (
    SELECT 1 FROM public."UserCompany" 
    WHERE company_id = p_company_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: User does not have access to this company.';
  END IF;

  -- 1. Compute Opening Cash Balance (Strictly 'Cash')
  SELECT COALESCE(SUM(gll.debit_amount - gll.credit_amount), 0)
  INTO v_opening_cash
  FROM "GeneralLedgerLine" gll
  JOIN "GeneralLedgerJournal" glj ON glj.id = gll.journal_id
  JOIN "ChartOfAccount" a ON a.id = gll.account_id
  WHERE glj.company_id = p_company_id
    AND glj.status = 'Posted'
    AND (a.is_cash_account = true OR a.account_type = 'Cash')
    AND glj.entry_date < p_date::TIMESTAMP;

  -- 2. Calculate Net Cash Closing Balance (Strictly 'Cash')
  SELECT v_opening_cash + COALESCE(SUM(gll.debit_amount - gll.credit_amount), 0)
  INTO v_closing_cash
  FROM "GeneralLedgerLine" gll
  JOIN "GeneralLedgerJournal" glj ON glj.id = gll.journal_id
  JOIN "ChartOfAccount" a ON a.id = gll.account_id
  WHERE glj.company_id = p_company_id
    AND glj.status = 'Posted'
    AND (a.is_cash_account = true OR a.account_type = 'Cash')
    AND glj.entry_date >= p_date::TIMESTAMP
    AND glj.entry_date < (p_date + INTERVAL '1 day');

  -- 3. Unified CTE for single-pass extraction
  WITH base_lines AS (
    SELECT 
      gll.id, gll.journal_id, glj.voucher_no AS voucher_number,
      a.account_name, a.is_cash_account, a.is_bank_account, a.account_type, gll.description AS narration, 
      gll.debit_amount, gll.credit_amount
    FROM "GeneralLedgerLine" gll
    JOIN "GeneralLedgerJournal" glj ON glj.id = gll.journal_id
    JOIN "ChartOfAccount" a ON a.id = gll.account_id
    WHERE glj.company_id = p_company_id 
      AND glj.status = 'Posted'
      AND glj.entry_date >= p_date::TIMESTAMP
      AND glj.entry_date < (p_date + INTERVAL '1 day')
  ),
  journal_modes AS (
    SELECT 
      journal_id,
      COALESCE(SUM(debit_amount) FILTER (WHERE is_cash_account = true OR account_type = 'Cash'), 0) AS cash_dr,
      COALESCE(SUM(credit_amount) FILTER (WHERE is_cash_account = true OR account_type = 'Cash'), 0) AS cash_cr,
      COALESCE(SUM(debit_amount) FILTER (WHERE is_bank_account = true OR account_type = 'Bank'), 0) AS bank_dr,
      COALESCE(SUM(credit_amount) FILTER (WHERE is_bank_account = true OR account_type = 'Bank'), 0) AS bank_cr,
      CASE WHEN COALESCE(SUM(debit_amount) FILTER (WHERE NOT (is_cash_account = true OR account_type = 'Cash' OR is_bank_account = true OR account_type = 'Bank')), 0) = 0 THEN true ELSE false END AS is_contra
    FROM base_lines
    GROUP BY journal_id
  ),
  debit_agg AS (
    SELECT COALESCE(jsonb_agg(d_row ORDER BY voucher_number ASC), '[]'::jsonb) AS items
    FROM (
      SELECT 
        bl.id, bl.voucher_number, 
        CASE 
          WHEN jm.is_contra THEN 'Contra'
          WHEN jm.cash_dr > 0 OR jm.bank_dr > 0 THEN 'Receipt'
          WHEN jm.cash_cr > 0 OR jm.bank_cr > 0 THEN 'Payment'
          ELSE 'Journal'
        END AS voucher_type,
        bl.account_name, bl.narration,
        CASE WHEN jm.cash_dr > 0 THEN bl.credit_amount ELSE 0 END AS cash_amount,
        CASE WHEN jm.cash_dr = 0 THEN bl.credit_amount ELSE 0 END AS non_cash_amount
      FROM base_lines bl
      JOIN journal_modes jm ON bl.journal_id = jm.journal_id
      WHERE bl.credit_amount > 0
        AND (NOT (bl.is_cash_account = true OR bl.account_type = 'Cash' OR bl.is_bank_account = true OR bl.account_type = 'Bank') OR jm.is_contra)
    ) d_row
  ),
  credit_agg AS (
    SELECT COALESCE(jsonb_agg(c_row ORDER BY voucher_number ASC), '[]'::jsonb) AS items
    FROM (
      SELECT 
        bl.id, bl.voucher_number, 
        CASE 
          WHEN jm.is_contra THEN 'Contra'
          WHEN jm.cash_dr > 0 OR jm.bank_dr > 0 THEN 'Receipt'
          WHEN jm.cash_cr > 0 OR jm.bank_cr > 0 THEN 'Payment'
          ELSE 'Journal'
        END AS voucher_type,
        bl.account_name, bl.narration,
        CASE WHEN jm.cash_cr > 0 THEN bl.debit_amount ELSE 0 END AS cash_amount,
        CASE WHEN jm.cash_cr = 0 THEN bl.debit_amount ELSE 0 END AS non_cash_amount
      FROM base_lines bl
      JOIN journal_modes jm ON bl.journal_id = jm.journal_id
      WHERE bl.debit_amount > 0
        AND (NOT (bl.is_cash_account = true OR bl.account_type = 'Cash' OR bl.is_bank_account = true OR bl.account_type = 'Bank') OR jm.is_contra)
    ) c_row
  )
  SELECT jsonb_build_object(
    'date', p_date,
    'opening_cash', v_opening_cash,
    'closing_cash', v_closing_cash,
    'debits', (SELECT items FROM debit_agg),
    'credits', (SELECT items FROM credit_agg)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ── Grant ──────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_day_book_rpc(UUID, DATE) TO authenticated;

-- ── Performance Index ──────────────────────────────────────────────────────────
-- Note: CONCURRENTLY is removed to allow execution within Supabase migration transactions.
CREATE INDEX IF NOT EXISTS idx_glj_company_date_covering 
ON public."GeneralLedgerJournal" (company_id, entry_date) 
INCLUDE (status, voucher_no);
