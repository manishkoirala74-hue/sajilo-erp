-- ============================================================================
-- Rollback 123: Revert Atomic Lifecycle Transition RPC
-- ============================================================================

DROP FUNCTION IF EXISTS public.execute_user_lifecycle_transition(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.execute_user_lifecycle_transition(uuid, uuid, text, text, uuid);
