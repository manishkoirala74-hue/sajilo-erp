-- Rollback script for 154_dashboard_summary_rpc.sql

DROP FUNCTION IF EXISTS get_dashboard_summary(uuid, date, date);
