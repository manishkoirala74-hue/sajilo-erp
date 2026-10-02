-- 210_get_cash_bank_balance_rpc.sql
-- Creates a new lightweight, dedicated RPC: get_cash_bank_balance()
--
-- Returns live Cash and Bank balances for the dashboard, bounded by
-- the company's active fiscal year start date up to p_as_of_date.
--
-- Key design decisions:
--   1. FISCAL-YEAR-BOUNDED: Balance-sheet positions are cumulative within a
--      fiscal year. The query sums GL lines where entry_date is between the
--      active FY start_date and p_as_of_date (typically TODAY).
--   2. STRICT FLAG FILTER: Uses coa.is_cash_account / coa.is_bank_account —
--      NOT ILIKE text heuristics.
--   3. GRACEFUL DEGRADATION: If no active FY exists (brand-new company with
--      no FY configured), falls back to '2000-01-01' so all GL lines are
--      captured rather than returning NULL/zero erroneously.
--   4. DECOUPLED FROM get_dashboard_summary: This RPC only touches
--      GeneralLedgerLine, GeneralLedgerJournal, ChartOfAccount, and FiscalYear.
--      It does not re-run heavy Sales/Purchases/Inventory aggregations.
--   5. POSTED-ONLY: Only considers journals with status = 'Posted' to exclude
--      drafts and reversed entries from the balance.
--
-- Prerequisites : 208_add_is_cash_account_to_coa.sql
--                 209_backfill_cash_bank_flags.sql
-- Run After     : 209_backfill_cash_bank_flags.sql
-- Rollback      : 210_get_cash_bank_balance_rpc_rollback.sql

CREATE OR REPLACE FUNCTION get_cash_bank_balance(
  p_company_id  uuid,
  p_as_of_date  date  -- typically CURRENT_DATE; frontend passes today's date
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
  -- ── Security Guard (per DEVELOPMENT_CHECKLIST.md §1) ──────────────────────
  -- Strict workspace-level membership validation. Never drop this check.
  IF NOT EXISTS (
    SELECT 1
    FROM   "UserCompany"
    WHERE  user_id   = auth.uid()
      AND  company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- ── Resolve Active Fiscal Year Start Date ──────────────────────────────────
  -- Mirrors AuthContext.jsx logic: status = 'OPEN' OR is_active = true.
  -- ORDER BY start_date DESC with LIMIT 1 provides deterministic resolution
  -- per DEVELOPMENT_CHECKLIST.md §1 (Deterministic Row Resolution).
  SELECT start_date
  INTO   v_fy_start_date
  FROM   "FiscalYear"
  WHERE  company_id = p_company_id
    AND  (status = 'OPEN' OR is_active = true)
  ORDER BY start_date DESC
  LIMIT 1;

  -- ── Graceful Degradation ───────────────────────────────────────────────────
  -- No active FY = brand-new company. Use a safe epoch so all GL lines are
  -- captured rather than returning a misleading zero.
  IF v_fy_start_date IS NULL THEN
    v_fy_start_date := '2000-01-01'::date;
  END IF;

  -- ── Cash Balance ───────────────────────────────────────────────────────────
  -- Sums debit minus credit for all Posted GL lines against COA accounts
  -- flagged as is_cash_account = true, within the active fiscal year window.
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

  -- ── Bank Balance ───────────────────────────────────────────────────────────
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

  -- ── Return Payload ─────────────────────────────────────────────────────────
  -- fy_start_date and as_of_date are returned so the UI can render a
  -- contextual subtitle (e.g. "Since 2026-04-01") on the KPI card.
  RETURN jsonb_build_object(
    'cash_balance',   v_cash_balance,
    'bank_balance',   v_bank_balance,
    'as_of_date',     p_as_of_date,
    'fy_start_date',  v_fy_start_date
  );
END;
$$;

-- Per DEVELOPMENT_CHECKLIST.md §1: Explicit execution grant for PostgREST /rpc/
GRANT EXECUTE ON FUNCTION public.get_cash_bank_balance(uuid, date) TO authenticated;
