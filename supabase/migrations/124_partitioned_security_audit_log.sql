-- ============================================================================
-- Migration: 124_partitioned_security_audit_log.sql
-- Description: Creates partitioned SecurityAuditLog table with automated monthly partition generation via pg_cron.
-- ============================================================================

-- 1. Create pg_cron extension if supported
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 2. Handle existing unpartitioned SecurityAuditLog table if present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND tablename = 'SecurityAuditLog'
    ) AND NOT EXISTS (
        SELECT 1 
        FROM pg_partitioned_table p
        JOIN pg_class c ON c.oid = p.partrelid
        WHERE c.relname = 'SecurityAuditLog'
    ) THEN
        ALTER TABLE public."SecurityAuditLog" RENAME TO "SecurityAuditLog_legacy";
    END IF;
END $$;

-- 3. Create Partitioned SecurityAuditLog Table (Range Partitioned by created_at)
CREATE TABLE IF NOT EXISTS public."SecurityAuditLog" (
    id UUID DEFAULT gen_random_uuid(),
    company_id UUID,
    actor_id UUID NOT NULL,
    target_user_id UUID,
    action_type TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Indexes for audit query performance
CREATE INDEX IF NOT EXISTS idx_security_audit_company_created 
ON public."SecurityAuditLog" (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_target_created 
ON public."SecurityAuditLog" (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_actor_created 
ON public."SecurityAuditLog" (actor_id, created_at DESC);

-- 4. Enable RLS on SecurityAuditLog
ALTER TABLE public."SecurityAuditLog" ENABLE ROW LEVEL SECURITY;

-- Select Policy: Admins can view logs for their company
DROP POLICY IF EXISTS "security_audit_select_policy" ON public."SecurityAuditLog";
CREATE POLICY "security_audit_select_policy" ON public."SecurityAuditLog"
    FOR SELECT TO authenticated
    USING (
        company_id IS NULL OR
        public.current_user_has_company_permission(company_id, 'security_audit.read') OR
        public.current_user_has_company_permission(company_id, 'companies.manage')
    );

-- Insert Policy: Authenticated users/RPCs can insert audit logs
DROP POLICY IF EXISTS "security_audit_insert_policy" ON public."SecurityAuditLog";
CREATE POLICY "security_audit_insert_policy" ON public."SecurityAuditLog"
    FOR INSERT TO authenticated
    WITH CHECK (actor_id = auth.uid());

-- 5. Stored Procedure for Automatic Partition Creation
CREATE OR REPLACE FUNCTION public.create_future_audit_partitions(p_months_ahead INT DEFAULT 3)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_date DATE;
    v_end_date DATE;
    v_partition_name TEXT;
    v_sql TEXT;
    i INT;
BEGIN
    FOR i IN 0..p_months_ahead LOOP
        v_start_date := date_trunc('month', CURRENT_DATE + (i || ' month')::INTERVAL)::DATE;
        v_end_date := (v_start_date + INTERVAL '1 month')::DATE;
        
        v_partition_name := 'SecurityAuditLog_y' || to_char(v_start_date, 'YYYY') || 'm' || to_char(v_start_date, 'MM');
        
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = v_partition_name
        ) THEN
            v_sql := format(
                'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public."SecurityAuditLog" FOR VALUES FROM (%L) TO (%L);',
                v_partition_name,
                v_start_date,
                v_end_date
            );
            EXECUTE v_sql;
            RAISE NOTICE 'Created audit log partition %', v_partition_name;
        END IF;
    END LOOP;
END;
$$;

-- 6. Immediately seed partitions for the current and next 3 months
SELECT public.create_future_audit_partitions(3);

-- 7. Schedule pg_cron Job (if extension exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Unscheduling existing job if registered
        PERFORM cron.unschedule('generate-audit-log-partitions') 
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-audit-log-partitions');
        
        PERFORM cron.schedule(
            'generate-audit-log-partitions',
            '0 0 1 * *',
            $$ SELECT public.create_future_audit_partitions(3); $$
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'pg_cron scheduling skipped or unsupported on this tier: %', SQLERRM;
END $$;
