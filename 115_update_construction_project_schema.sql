-- 115_update_construction_project_schema.sql
-- Add missing columns that are expected by the ProjectMaster UI

SET search_path = public, pg_temp;

ALTER TABLE "ConstructionProject" 
ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'Residential',
ADD COLUMN IF NOT EXISTS start_date DATE;

-- Update the schema cache so Supabase detects the new columns immediately
NOTIFY pgrst, 'reload schema';
