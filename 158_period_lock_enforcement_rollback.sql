-- 158_period_lock_enforcement_rollback.sql
-- Reverts changes made by 158_period_lock_enforcement.sql

BEGIN;

REVOKE EXECUTE ON FUNCTION public.enforce_period_lock(UUID, DATE) FROM authenticated;
DROP FUNCTION IF EXISTS public.enforce_period_lock(UUID, DATE);

COMMIT;
