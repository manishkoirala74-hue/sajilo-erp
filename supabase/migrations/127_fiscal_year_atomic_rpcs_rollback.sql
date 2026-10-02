-- =============================================================================
-- Migration Rollback: 127_fiscal_year_atomic_rpcs_rollback.sql
-- Description: Reverts 127_fiscal_year_atomic_rpcs.sql
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_new_fiscal_year(UUID, TEXT, DATE, DATE, TEXT);
DROP FUNCTION IF EXISTS public.delete_empty_fiscal_year(UUID, UUID);
DROP FUNCTION IF EXISTS public.correct_fiscal_year_dates(UUID, UUID, DATE, DATE, TEXT);

ALTER TABLE public."FiscalYear" DROP CONSTRAINT IF EXISTS exclude_overlapping_fiscal_years;
