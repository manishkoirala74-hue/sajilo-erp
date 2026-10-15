-- Migration Rollback: 139_guarantee_company_main_godown_rollback.sql
-- Description: Reverts the automatic trigger and function created in migration 139.

DROP TRIGGER IF EXISTS trg_auto_provision_main_godown ON public."Company";
DROP FUNCTION IF EXISTS public.auto_provision_company_main_godown();
