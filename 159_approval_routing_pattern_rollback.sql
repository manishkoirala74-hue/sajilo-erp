-- 159_approval_routing_pattern_rollback.sql
-- Reverts changes made by 159_approval_routing_pattern.sql

BEGIN;

REVOKE EXECUTE ON FUNCTION public.route_for_approval_if_needed(UUID, TEXT, UUID, NUMERIC, UUID) FROM authenticated;
DROP FUNCTION IF EXISTS public.route_for_approval_if_needed(UUID, TEXT, UUID, NUMERIC, UUID);

DROP POLICY IF EXISTS "update_ApprovalQueue" ON public."ApprovalQueue";
DROP POLICY IF EXISTS "insert_ApprovalQueue" ON public."ApprovalQueue";
DROP POLICY IF EXISTS "select_ApprovalQueue" ON public."ApprovalQueue";

DROP TABLE IF EXISTS public."ApprovalQueue";

COMMIT;
