-- ============================================================================
-- Migration 122: Distinct User Lifecycle Status & Realtime Publication Setup
-- ============================================================================

-- 1. Extend public."User" with Global Account Lifecycle fields
ALTER TABLE public."User"
ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deactivated')),
ADD COLUMN IF NOT EXISTS account_access_version integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
ADD COLUMN IF NOT EXISTS status_changed_by uuid,
ADD COLUMN IF NOT EXISTS status_change_reason text;

-- 2. Extend public."UserCompany" with Workspace Membership Lifecycle fields
ALTER TABLE public."UserCompany"
ADD COLUMN IF NOT EXISTS membership_status text NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'suspended', 'deactivated', 'removed', 'pending_invite')),
ADD COLUMN IF NOT EXISTS membership_access_version integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
ADD COLUMN IF NOT EXISTS status_changed_by uuid,
ADD COLUMN IF NOT EXISTS status_change_reason text,
ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
ADD COLUMN IF NOT EXISTS removed_at timestamptz;

-- 3. Add Indexes for Fast Status Queries
CREATE INDEX IF NOT EXISTS idx_user_account_status ON public."User"(account_status);
CREATE INDEX IF NOT EXISTS idx_user_company_membership_status ON public."UserCompany"(company_id, user_id, membership_status);

-- 4. Enable Supabase Realtime Broadcasting for User and UserCompany Tables
-- Explicitly add tables to supabase_realtime publication
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public."User";
        ALTER PUBLICATION supabase_realtime ADD TABLE public."UserCompany";
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
