-- 065_godown_audit_trail.sql
-- Phase 4: Godown Audit Trail and Safety

-- 1. Add updated_by to Godown table
ALTER TABLE public."Godown" ADD COLUMN IF NOT EXISTS updated_by UUID;

-- (Optional) Add foreign key constraint if auth.users is accessible, otherwise just store UUID
-- Since auth.users is in a different schema, a soft reference is standard.

-- 2. Update existing rows with a default user or leave null
-- UPDATE public."Godown" SET updated_by = ... WHERE updated_by IS NULL;
