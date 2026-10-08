-- ============================================================================
-- 215_fix_cash_bank_balance_fy_boundary_rollback.sql
-- Restores the fiscal year boundary logic from migration 211.
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
  v_fy_start_date  date;
  v_cash_balance   numeric := 0;
  v_bank_balance   numeric := 0;
BEGIN
  -- Security Guard
  IF NOT EXISTS (
    SELECT 1 FROM "UserCompany" WHERE user_id = auth.uid() AND company_id = p_company_id
  ) THEN 
    RAISE EXCEPTION 'Access denied'; 
  END IF;

  -- Active Fiscal Year Resolution
  SELECT start_date INTO v_fy_start_date FROM "FiscalYear"
  WHERE company_id = p_company_id AND (status = 'OPEN' OR is_active = true)
  ORDER BY start_date DESC LIMIT 1;

  IF v_fy_start_date IS NULL THEN 
    v_fy_start_date := '2000-01-01'::date; 
  END IF;

  -- Cash Balance
  SELECT COALESCE(SUM(gll.debit_amount - gll.credit_amount), 0) INTO v_cash_balance
  FROM "GeneralLedgerLine" gll 
  JOIN "GeneralLedgerJournal" glj ON glj.id = gll.journal_id 
  JOIN "ChartOfAccount" coa ON coa.id = gll.account_id
  WHERE gll.company_id = p_company_id AND coa.company_id = p_company_id AND coa.is_cash_account = true AND glj.status = 'Posted'
    AND glj.entry_date::date >= v_fy_start_date AND glj.entry_date::date <= p_as_of_date;

  -- Bank Balance
  SELECT COALESCE(SUM(gll.debit_amount - gll.credit_amount), 0) INTO v_bank_balance
  FROM "GeneralLedgerLine" gll 
  JOIN "GeneralLedgerJournal" glj ON glj.id = gll.journal_id 
  JOIN "ChartOfAccount" coa ON coa.id = gll.account_id
  WHERE gll.company_id = p_company_id AND coa.company_id = p_company_id AND coa.is_bank_account = true AND glj.status = 'Posted'
    AND glj.entry_date::date >= v_fy_start_date AND glj.entry_date::date <= p_as_of_date;

  RETURN jsonb_build_object(
    'cash_balance', v_cash_balance, 
    'bank_balance', v_bank_balance, 
    'as_of_date', p_as_of_date, 
    'fy_start_date', v_fy_start_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_bank_balance(uuid, date) TO authenticated;

COMMIT;
