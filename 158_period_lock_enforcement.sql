-- 158_period_lock_enforcement.sql
-- Adds enforce_period_lock() guard function for GL transaction RPCs.
-- Called as first guard inside rpc_post_gl_transaction or equivalent.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_period_lock(
  p_company_id UUID,
  p_transaction_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_date DATE;
BEGIN
  -- Safe: UNIQUE(company_id) guarantees at most 1 row (DEVELOPMENT_CHECKLIST §1)
  SELECT period_lock_date
  INTO v_lock_date
  FROM public."CompanySettings"
  WHERE company_id = p_company_id
  LIMIT 1;

  IF v_lock_date IS NOT NULL AND p_transaction_date <= v_lock_date THEN
    RAISE EXCEPTION
      'PERIOD_LOCKED: Transaction date % is on or before the period lock date %. Contact your administrator to unlock the period.',
      p_transaction_date, v_lock_date
    USING ERRCODE = 'P0002';
  END IF;
END;
$$;

-- DEVELOPMENT_CHECKLIST: Explicit RPC Execution Grant
GRANT EXECUTE ON FUNCTION public.enforce_period_lock(UUID, DATE) TO authenticated;

COMMIT;
