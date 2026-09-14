-- ============================================================================
-- Rollback 122: Revert Distinct User Lifecycle Status & Realtime Setup
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public."UserCompany";
        ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public."User";
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public."UserCompany"
DROP COLUMN IF EXISTS removed_at,
DROP COLUMN IF EXISTS deactivated_at,
DROP COLUMN IF EXISTS suspended_at,
DROP COLUMN IF EXISTS status_change_reason,
DROP COLUMN IF EXISTS status_changed_by,
DROP COLUMN IF EXISTS status_changed_at,
DROP COLUMN IF EXISTS membership_access_version,
DROP COLUMN IF EXISTS membership_status;

ALTER TABLE public."User"
DROP COLUMN IF EXISTS status_change_reason,
DROP COLUMN IF EXISTS status_changed_by,
DROP COLUMN IF EXISTS status_changed_at,
DROP COLUMN IF EXISTS account_access_version,
DROP COLUMN IF EXISTS account_status;
