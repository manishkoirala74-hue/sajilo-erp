-- ============================================================================
-- 211_fix_dashboard_cash_balance_rollback.sql
--
-- Reverts the three changes made by 211_fix_dashboard_cash_balance.sql:
--
--   1. INDEX: Drops idx_gll_dashboard_balances and restores the migration 209
--      index (idx_gl_line_company_account_journal).
--
--   2. BACKFILL: Precisely reverses only the rows that 211 added beyond what
--      migration 209 already set. The 209 backfill required is_system_account=true;
--      rows flagged by 211's broader WHERE (non-system accounts and name matches)
--      are reverted here. Rows already set by 209 are left untouched.
--
--   3. RPC: Restores the migration 210 function body (the pre-fix version with
--      ::uuid casts) as the exact prior state. This ensures a rollback returns
--      the system to a known prior state, even though 210 was broken.
--      To fully recover functionality after rolling back 211, contact the
--      migration owner to re-apply 211.
--
-- Rollback Order: 211 rollback → 210 rollback → 209 rollback → 208 rollback
-- ============================================================================

BEGIN;

-- ── 1. INDEX ROLLBACK ────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_gll_dashboard_balances;

-- Restore the migration 209 index (same column shape, prior name).
CREATE INDEX IF NOT EXISTS idx_gl_line_company_account_journal
  ON "GeneralLedgerLine" (company_id, account_id, journal_id);


-- ── 2. BACKFILL ROLLBACK ─────────────────────────────────────────────────────
-- Migration 211 added flags for rows that 209 missed because they lacked
-- is_system_account = true. Revert only those additions precisely:
--   (a) Cash accounts: non-system-account rows with code 1110 or name = 'Cash in Hand'
--   (b) Bank accounts: child rows of the 1120 group where is_system_account is false
--       on the parent (i.e. the parent 1120 group was not a system account)
--
-- Rows already set by migration 209 (is_system_account = true, code = 1110)
-- are intentionally LEFT UNTOUCHED to preserve the 209 state.

UPDATE "ChartOfAccount"
SET    is_cash_account = false
WHERE  is_cash_account = true
  AND  is_system_account = false
  AND  (account_code = '1110' OR account_name ILIKE 'Cash in Hand');

UPDATE "ChartOfAccount" child
SET    is_bank_account = false
FROM   "ChartOfAccount" parent
WHERE  child.parent_account_id = parent.id
  AND  parent.account_code     = '1120'
  AND  parent.is_system_account = false   -- only rows added by 211, not 209
  AND  child.ledger_type        = 'Sub Ledger'
  AND  child.is_bank_account    = true;


-- ── 3. RPC ROLLBACK ───────────────────────────────────────────────────────────
-- Restore the migration 210 function body exactly.
-- This is the prior known state (broken due to ::uuid casts but correctly
-- representing the pre-211 deployment). Per DEVELOPMENT_CHECKLIST.md §5,
-- rollback must restore the exact prior state of all modified RPCs.

REVOKE EXECUTE ON FUNCTION public.get_cash_bank_balance(uuid, date) FROM authenticated;
DROP FUNCTION IF EXISTS public.get_cash_bank_balance(uuid, date);

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
  IF NOT EXISTS (
    SELECT 1
    FROM   "UserCompany"
    WHERE  user_id    = auth.uid()
      AND  company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT start_date
  INTO   v_fy_start_date
  FROM   "FiscalYear"
  WHERE  company_id = p_company_id
    AND  (status = 'OPEN' OR is_active = true)
  ORDER BY start_date DESC
  LIMIT 1;

  IF v_fy_start_date IS NULL THEN
    v_fy_start_date := '2000-01-01'::date;
  END IF;

  -- Migration 210 body (broken: ::uuid casts on already-UUID columns)
  SELECT COALESCE(SUM(gll.debit_amount - gll.credit_amount), 0)
  INTO   v_cash_balance
  FROM   "GeneralLedgerLine"    gll
  JOIN   "GeneralLedgerJournal" glj ON glj.id  = gll.journal_id::uuid
  JOIN   "ChartOfAccount"       coa ON coa.id  = gll.account_id::uuid
  WHERE  gll.company_id        = p_company_id
    AND  coa.company_id        = p_company_id
    AND  coa.is_cash_account   = true
    AND  glj.status            = 'Posted'
    AND  glj.entry_date::date >= v_fy_start_date
    AND  glj.entry_date::date <= p_as_of_date;

  SELECT COALESCE(SUM(gll.debit_amount - gll.credit_amount), 0)
  INTO   v_bank_balance
  FROM   "GeneralLedgerLine"    gll
  JOIN   "GeneralLedgerJournal" glj ON glj.id  = gll.journal_id::uuid
  JOIN   "ChartOfAccount"       coa ON coa.id  = gll.account_id::uuid
  WHERE  gll.company_id        = p_company_id
    AND  coa.company_id        = p_company_id
    AND  coa.is_bank_account   = true
    AND  glj.status            = 'Posted'
    AND  glj.entry_date::date >= v_fy_start_date
    AND  glj.entry_date::date <= p_as_of_date;

  RETURN jsonb_build_object(
    'cash_balance',   v_cash_balance,
    'bank_balance',   v_bank_balance,
    'as_of_date',     p_as_of_date,
    'fy_start_date',  v_fy_start_date
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_bank_balance(uuid, date) TO authenticated;

COMMIT;
