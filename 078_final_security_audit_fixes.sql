-- Migration: 078_final_security_audit_fixes.sql
-- Description: Finalize security audit by revoking anon access to remaining SECURITY DEFINER functions, 
-- enforcing explicit search_paths on the final batch, and cleaning up legacy RLS policies.

-------------------------------------------------------------------------------
-- 1. Revoke anon access from remaining SECURITY DEFINER functions
-------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_commit_journal_entry_internal(UUID, DATE, TEXT, TEXT, UUID, TEXT, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_company_access(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_company_access(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_post_sales_return(JSONB, UUID, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_post_payroll_run(JSONB, UUID, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_post_pos_sale(JSONB, UUID, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_user_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_delete_gl_journals(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.close_and_open_fiscal_year(UUID, UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_or_update_stock_assembly(UUID, UUID, VARCHAR, UUID, DATE, NUMERIC, VARCHAR, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_post_stock_adjustment(JSONB, UUID, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_stock_assembly(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_recalculate_item_wac(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rebuild_inventory_wac_timeline(UUID, DATE, DATE) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_post_purchase_return(JSONB, UUID, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_company_data(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_user_operational_access_rpc(UUID, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_retroactive_bill_knockoff(UUID, TEXT, JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_branch_transfer_acknowledgement_rpc(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_price_revision_rpc(UUID, UUID, UUID, TEXT, NUMERIC, TEXT, UUID) FROM anon;

-------------------------------------------------------------------------------
-- 2. Enforce explicit search_path on the final mutable functions
-------------------------------------------------------------------------------
ALTER FUNCTION public.rpc_post_gl_transaction(UUID, DATE, TEXT, TEXT, UUID, TEXT, JSONB, BOOLEAN, BOOLEAN) SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_generate_voucher_number() SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_post_stock_adjustment(JSONB, UUID, JSONB) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_item_recent_trading_history_rpc(UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.process_branch_transfer_acknowledgement_rpc(UUID, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_user_updated_at() SET search_path = public, pg_temp;

-------------------------------------------------------------------------------
-- 3. Drop legacy RLS policies to eliminate 'Policy Always True' warnings
-------------------------------------------------------------------------------
DROP POLICY IF EXISTS "company_insert_policy" ON public."Company";
DROP POLICY IF EXISTS "insert_Company" ON public."Company";
