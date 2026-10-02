-- ============================================================================
-- 211_fix_dashboard_cash_balance.sql
--
-- This migration fixes three issues that caused get_cash_bank_balance()
-- to return zero for all companies despite GL transactions existing:
--
--   1. INDEX REBUILD: Migration 209 created idx_gl_line_company_account_journal
--      before migration 038_ledger_hardening_core_v8 confirmed journal_id and
--      account_id are UUID. The stale index is dropped and rebuilt cleanly.
--
--   2. BROADENED BACKFILL: Migration 209 restricted the backfill to accounts
--      where is_system_account = true. Legacy tenant accounts (e.g. "Cash in
--      Hand" created before the system flag was set) were missed. The guard is
--      removed; account_code AND name are used as a dual safety net.
--
--   3. RPC REWRITE: Migration 210 used gll.journal_id::uuid and
--      gll.account_id::uuid casts that are redundant (both columns are already
--      UUID since migration 038_ledger_hardening_core_v8) and prevented the
--      query planner from utilising the FK-backed PK index on
--      GeneralLedgerJournal.id. The rewritten RPC uses clean UUID = UUID joins.
--      glj.status = 'Posted' is retained as a defensive safety net against
--      future feature additions (Draft/Void journals).
--
-- Prerequisites : 208, 209, 210 must be applied.
-- Run After     : 210_get_cash_bank_balance_rpc.sql
-- Rollback      : 211_fix_dashboard_cash_balance_rollback.sql
-- ============================================================================

BEGIN;

-- ── 1. INDEX REBUILD ─────────────────────────────────────────────────────────
-- Drop the index from migration 209 (created before UUID types were confirmed).
-- The new index has the same column shape but is built against confirmed UUID
-- columns, allowing the query planner to utilise the FK index on journal_id.
DROP INDEX IF EXISTS idx_gl_line_company_account_journal;

CREATE INDEX IF NOT EXISTS idx_gll_dashboard_balances
  ON "GeneralLedgerLine" (company_id, account_id, journal_id);


-- ── 2. BROADENED BACKFILL ────────────────────────────────────────────────────
-- The original 209 backfill used WHERE is_system_account = true.
-- This guard was too narrow: accounts seeded before the is_system_account flag
-- existed, or created manually, were silently skipped — leaving is_cash_account
-- = false and making those accounts invisible to the RPC.
--
-- This update targets:
--   (a) Any account with account_code = '1110'      ← deterministic code match
--   (b) Any account named 'Cash in Hand' (any case) ← safety net for manual entries
--
-- NOTE: The OR name heuristic is intentionally limited to the exact seeded name
-- "Cash in Hand" and not a broad '%cash%' wildcard, to avoid false positives
-- (e.g. "Petty Cash Expense", "Cash Register Repair Deposit").
UPDATE "ChartOfAccount"
SET    is_cash_account = true
WHERE  (account_code = '1110' OR account_name ILIKE 'Cash in Hand')
  AND  is_cash_account = false;   -- Idempotent: skip already-flagged rows

-- Bank sub-ledger backfill: same broadening — remove is_system_account guard.
-- Targets all Sub Ledger children of any account_code = '1120' group.
UPDATE "ChartOfAccount" child
SET    is_bank_account = true
FROM   "ChartOfAccount" parent
WHERE  child.parent_account_id = parent.id
  AND  parent.account_code     = '1120'
  AND  child.ledger_type       = 'Sub Ledger'
  AND  child.is_bank_account   = false;   -- Idempotent: skip already-flagged rows


-- ── 3. REWRITTEN RPC ─────────────────────────────────────────────────────────
-- Replaces the migration 210 version which contained ::uuid casts that
-- prevented index utilisation.
CREATE OR REPLACE FUNCTION get_cash_bank_balance(
  p_company_id  uuid,
  p_as_of_date  date  -- typically CURRENT_DATE; the frontend passes today's date
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
  IF NOT EXISTS (
    SELECT 1
    FROM   "UserCompany"
    WHERE  user_id    = auth.uid()
      AND  company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- ── Active Fiscal Year Resolution ─────────────────────────────────────────
  -- Mirrors AuthContext.jsx: status = 'OPEN' OR is_active = true.
  -- ORDER BY + LIMIT 1 guarantees deterministic resolution per checklist §1.
  SELECT start_date
  INTO   v_fy_start_date
  FROM   "FiscalYear"
  WHERE  company_id = p_company_id
    AND  (status = 'OPEN' OR is_active = true)
  ORDER BY start_date DESC
  LIMIT 1;

  -- Graceful degradation: brand-new company with no FY configured.
  IF v_fy_start_date IS NULL THEN
    v_fy_start_date := '2000-01-01'::date;
  END IF;

  -- ── Cash Balance ───────────────────────────────────────────────────────────
  -- JOIN uses native UUID = UUID — no casts — so PostgreSQL can use the PK
  -- B-Tree index on GeneralLedgerJournal.id and the FK index on journal_id.
  -- glj.status = 'Posted' is a defensive safety net: even though the current
  -- ledger hub always writes 'Posted' synchronously, this guard protects
  -- the balance against future Draft/Void journal features.
  SELECT COALESCE(SUM(gll.debit_amount - gll.credit_amount), 0)
  INTO   v_cash_balance
  FROM   "GeneralLedgerLine"    gll
  JOIN   "GeneralLedgerJournal" glj ON glj.id  = gll.journal_id   -- UUID = UUID
  JOIN   "ChartOfAccount"       coa ON coa.id  = gll.account_id   -- UUID = UUID
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
  JOIN   "GeneralLedgerJournal" glj ON glj.id  = gll.journal_id   -- UUID = UUID
  JOIN   "ChartOfAccount"       coa ON coa.id  = gll.account_id   -- UUID = UUID
  WHERE  gll.company_id        = p_company_id
    AND  coa.company_id        = p_company_id
    AND  coa.is_bank_account   = true
    AND  glj.status            = 'Posted'
    AND  glj.entry_date::date >= v_fy_start_date
    AND  glj.entry_date::date <= p_as_of_date;

  -- ── Return Payload ─────────────────────────────────────────────────────────
  -- fy_start_date is returned so the UI can render "Since YYYY-MM-DD" on the
  -- KPI card subtitle.
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

COMMIT;
