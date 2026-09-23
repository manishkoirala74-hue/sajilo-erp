-- 161_costing_method_lock_trigger_rollback.sql
-- Reverts changes made by 161_costing_method_lock_trigger.sql

BEGIN;

DROP TRIGGER IF EXISTS lock_costing_method ON public."CompanySettings";
DROP FUNCTION IF EXISTS public.prevent_costing_method_change();

COMMIT;
