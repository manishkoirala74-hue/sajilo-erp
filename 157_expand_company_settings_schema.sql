-- 157_expand_company_settings_schema.sql
-- Expands CompanySettings with enterprise compliance controls.
-- Roll Forward: adds new columns only. No existing columns are modified.
-- Enables REPLICA IDENTITY FULL for Supabase Realtime payload completeness.

BEGIN;

-- Domain 1: Financial & Accounting Controls
ALTER TABLE public."CompanySettings"
  ADD COLUMN IF NOT EXISTS period_lock_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS default_costing_method TEXT DEFAULT 'WAC'
    CHECK (default_costing_method IN ('WAC', 'FIFO', 'LIFO')),
  ADD COLUMN IF NOT EXISTS enable_multi_currency BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_default_behavior TEXT DEFAULT 'Exclusive'
    CHECK (tax_default_behavior IN ('Inclusive', 'Exclusive'));

-- Domain 2: Inventory & Operational Constraints
ALTER TABLE public."CompanySettings"
  ADD COLUMN IF NOT EXISTS enable_batch_expiry BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS over_receive_tolerance_pct NUMERIC(5,2) DEFAULT 0.00
    CHECK (over_receive_tolerance_pct >= 0 AND over_receive_tolerance_pct <= 100);

-- Domain 3: Security & Access Policies
ALTER TABLE public."CompanySettings"
  ADD COLUMN IF NOT EXISTS session_idle_timeout_minutes INTEGER DEFAULT 0
    CHECK (session_idle_timeout_minutes >= 0),
  ADD COLUMN IF NOT EXISTS enable_strict_audit_logging BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ip_whitelist JSONB DEFAULT '[]'::jsonb;

-- Enable REPLICA IDENTITY FULL so Supabase Realtime broadcasts the complete
-- updated row in payload.new, allowing client-side hydration without a round-trip RPC.
ALTER TABLE public."CompanySettings" REPLICA IDENTITY FULL;

COMMIT;
