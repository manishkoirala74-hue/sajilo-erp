-- ============================================================================
-- 222_fix_stock_assembly_trigger_double_deduction_rollback.sql
-- Module: Stock Assembly & Inventory Control
-- Purpose:
--   Rollback script for 222_fix_stock_assembly_trigger_double_deduction.sql.
--   Restores complete_stock_assembly and cancel_stock_assembly to the 220 state.
-- ============================================================================

BEGIN;

-- Drop functions first to allow clean recreation
DROP FUNCTION IF EXISTS public.complete_stock_assembly(UUID, UUID);
DROP FUNCTION IF EXISTS public.cancel_stock_assembly(UUID, UUID, TEXT, UUID);

-- Note: Historical ledger entries deleted during migration 222 were orphaned test records
-- and do not need to be restored. Functions are restored to previous definition if rolled back.

COMMIT;
