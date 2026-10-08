-- ============================================================================
-- 215_fix_cash_bank_balance_fy_boundary.sql
-- Removes the fiscal year start date boundary from Cash and Bank balances.
-- Balance sheet accounts carry forward perpetually and must not reset at FY end
-- until a formal Year-End Closing routine collapses the history.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION get_cash_bank_balance(
  p_company_id  uuid,
  p_as_of_date  date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cash_balance   numeric := 0;
  v_bank_balance   numeric := 0;
BEGIN
  -- 1. Security Guard
  IF NOT EXISTS (
    SELECT 1 FROM "UserCompany"
    WHERE user_id = auth.uid() AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- 2. Cash Balance (Perpetual / Un-closed History)
  SELECT COALESCE(SUM(gll.debit_amount - gll.credit_amount), 0)
  INTO   v_cash_balance
  FROM   "GeneralLedgerLine"    gll
  JOIN   "GeneralLedgerJournal" glj ON glj.id  = gll.journal_id
  JOIN   "ChartOfAccount"       coa ON coa.id  = gll.account_id
  WHERE  gll.company_id        = p_company_id
    AND  coa.company_id        = p_company_id
    AND  coa.is_cash_account   = true
    AND  glj.status            = 'Posted'
    AND  glj.entry_date::date <= p_as_of_date;

  -- 3. Bank Balance (Perpetual / Un-closed History)
  SELECT COALESCE(SUM(gll.debit_amount - gll.credit_amount), 0)
  INTO   v_bank_balance
  FROM   "GeneralLedgerLine"    gll
  JOIN   "GeneralLedgerJournal" glj ON glj.id  = gll.journal_id
  JOIN   "ChartOfAccount"       coa ON coa.id  = gll.account_id
  WHERE  gll.company_id        = p_company_id
    AND  coa.company_id        = p_company_id
    AND  coa.is_bank_account   = true
    AND  glj.status            = 'Posted'
    AND  glj.entry_date::date <= p_as_of_date;

  -- 4. Return Payload (fy_start_date removed as it no longer applies)
  RETURN jsonb_build_object(
    'cash_balance',   v_cash_balance,
    'bank_balance',   v_bank_balance,
    'as_of_date',     p_as_of_date,
    'fy_start_date',  null
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_bank_balance(uuid, date) TO authenticated;

COMMIT;
