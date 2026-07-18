-- ==============================================================================
-- Migration: 0112_create_report_archive.sql
-- Purpose: Create idempotent reporting cache, optimize ledger timestamps, and lifecycle policies.
-- ==============================================================================

BEGIN;

-- 1. Create the Report Archive Table
CREATE TABLE IF NOT EXISTS "report_archive" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    report_type TEXT NOT NULL,
    parameters JSONB NOT NULL,
    generated_by UUID NOT NULL,
    bucket_url TEXT NOT NULL,
    ledger_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Index for lightning-fast cache validation
CREATE INDEX IF NOT EXISTS idx_report_archive_lookup 
ON "report_archive" USING GIN (parameters);

CREATE INDEX IF NOT EXISTS idx_report_archive_composite 
ON "report_archive" (report_type, ledger_timestamp);

-- 3. The critical ledger index to prevent full table scans
CREATE INDEX IF NOT EXISTS idx_gl_journal_updated_at 
ON "GeneralLedgerJournal" (updated_at DESC);

-- 4. Row Level Security (RLS)
ALTER TABLE "report_archive" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Users can view their company reports" 
    ON "report_archive"
    FOR SELECT 
    USING (
        company_id IN (
            SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()
        )
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Users can insert reports for their company" 
    ON "report_archive"
    FOR INSERT 
    WITH CHECK (
        company_id IN (
            SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()
        )
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Users can delete their company reports" 
    ON "report_archive"
    FOR DELETE 
    USING (
        company_id IN (
            SELECT company_id FROM "UserCompany" WHERE user_id = auth.uid()
        )
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 5. Enable pg_cron and schedule the 30-day garbage collection
-- Note: pg_cron must be enabled in the Supabase Dashboard if it's not already.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
    'delete_stale_reports',
    '0 0 * * *', -- Run every midnight
    $$ DELETE FROM "report_archive" WHERE created_at < now() - interval '30 days'; $$
);

-- Note: The webhook for the physical deletion must be configured in the Supabase Dashboard
-- manually pointing to the API endpoint with the x-webhook-secret header.

COMMIT;
