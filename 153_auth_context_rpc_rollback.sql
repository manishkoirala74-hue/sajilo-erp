-- Rollback script for 153_auth_context_rpc.sql

DROP FUNCTION IF EXISTS get_user_auth_context(uuid);
