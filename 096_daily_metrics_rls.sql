-- 096_daily_metrics_rls.sql
-- Add Row Level Security and force Supabase to reload its schema cache.

-- Enable RLS to match the rest of the application's security model
ALTER TABLE public."DailyMetricsRollup" ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read and write
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public."DailyMetricsRollup";
CREATE POLICY "Enable all for authenticated users" 
ON public."DailyMetricsRollup" 
FOR ALL 
USING (auth.role() = 'authenticated');

-- Force PostgREST to reload the schema cache so the frontend can immediately query the new table
NOTIFY pgrst, 'reload schema';
