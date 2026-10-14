-- ============================================================================
-- 219_dashboard_consolidated_payload_rpc_rollback.sql
--
-- Rollback for 219_dashboard_consolidated_payload_rpc.sql
-- Drops the get_dashboard_analytics_payload function.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_dashboard_analytics_payload(UUID, DATE, DATE, DATE);
