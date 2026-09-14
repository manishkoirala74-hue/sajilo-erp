-- ============================================================================
-- Migration Rollback: 125_revoke_user_sessions_rpc_rollback.sql
-- Description: Reverts 125_revoke_user_sessions_rpc.sql by dropping the revoke_user_sessions RPC.
-- ============================================================================

DROP FUNCTION IF EXISTS public.revoke_user_sessions(text, text, text);
DROP FUNCTION IF EXISTS public.revoke_user_sessions(uuid, uuid, text);
