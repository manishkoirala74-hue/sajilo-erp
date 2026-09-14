-- ============================================================================
-- Migration Rollback: 124_partitioned_security_audit_log_rollback.sql
-- Description: Reverts 124_partitioned_security_audit_log.sql by removing cron schedule, partition helper function, and restoring legacy unpartitioned audit log table if backed up.
-- ============================================================================

-- 1. Unschedule pg_cron job if present
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('generate-audit-log-partitions') 
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-audit-log-partitions');
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Drop Function
DROP FUNCTION IF EXISTS public.create_future_audit_partitions(INT);

-- 3. Drop Policies & Partitioned Table
DROP POLICY IF EXISTS "security_audit_insert_policy" ON public."SecurityAuditLog";
DROP POLICY IF EXISTS "security_audit_select_policy" ON public."SecurityAuditLog";

-- Detach and drop table
DROP TABLE IF EXISTS public."SecurityAuditLog" CASCADE;

-- 4. Restore legacy table if backed up
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'SecurityAuditLog_legacy') THEN
        ALTER TABLE public."SecurityAuditLog_legacy" RENAME TO "SecurityAuditLog";
    END IF;
END $$;
