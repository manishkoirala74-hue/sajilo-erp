-- =============================================================================
-- Rollback    : 205_hr_salary_history_rollback.sql
-- Rolls back  : 205_hr_salary_history.sql
-- Author      : Sajilo ERP Migration Engineer
-- Date        : 2026-09-26
-- Description :
--   Exactly reverses every change introduced by 205_hr_salary_history.sql,
--   in reverse order:
--
--     1. DROP the rpc_update_salary function (and its GRANT, which is
--        automatically revoked when the function is dropped).
--     2. DROP the EmployeeSalaryHistory table CASCADE (also removes all
--        indexes, policies, and the exclusion constraint automatically).
--
--   NOTE: The btree_gist extension is intentionally NOT dropped.
--   It may be in use by other parts of the schema (e.g. other exclusion
--   constraints or GiST-indexed columns).  Remove it manually only if you
--   are certain no other objects depend on it.
--
--   WARNING: Dropping "EmployeeSalaryHistory" CASCADE permanently deletes
--   all salary history data.  Back up the table before running this rollback
--   in a production environment.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. DROP FUNCTION: public.rpc_update_salary
--    Drops the function and automatically revokes all GRANTs on it.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.rpc_update_salary(UUID, JSONB, DATE, TEXT);


-- ---------------------------------------------------------------------------
-- 2. DROP TABLE: EmployeeSalaryHistory
--    CASCADE ensures dependent objects (indexes, RLS policies, foreign-key
--    references from other tables, if any) are also removed cleanly.
--
--    The data in this table is NOT recoverable after this statement without
--    a backup.  The backfilled rows from migration 205 will be lost.
--    The original salary_components column on the Employee table is
--    unaffected and remains as-is.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "EmployeeSalaryHistory" CASCADE;


-- ---------------------------------------------------------------------------
-- btree_gist extension: intentionally left in place.
-- ---------------------------------------------------------------------------


-- =============================================================================
-- End of rollback 205_hr_salary_history_rollback.sql
-- =============================================================================
