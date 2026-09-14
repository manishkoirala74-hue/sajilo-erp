-- ============================================================================
-- Rollback 120: Revert Database-Backed Permission Catalog & Role Hierarchy
-- ============================================================================

DROP TABLE IF EXISTS public."RolePermission" CASCADE;
ALTER TABLE public."CompanyRole" DROP COLUMN IF EXISTS hierarchy_weight;
DROP TABLE IF EXISTS public."Permission" CASCADE;
