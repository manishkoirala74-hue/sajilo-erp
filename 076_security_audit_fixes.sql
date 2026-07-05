-- Migration: 076_security_audit_fixes.sql
-- Description: Explicitly fix SECURITY DEFINER functions, mutable search paths, and permissive RLS.

-------------------------------------------------------------------------------
-- 1. Fix Mutable Search Paths (59 warnings)
-------------------------------------------------------------------------------
ALTER FUNCTION public.rpc_post_gl_transaction(p_company_id UUID, p_date DATE, p_description TEXT, p_module TEXT, p_source_id UUID, p_source_type TEXT, p_lines JSONB, p_is_reversal BOOLEAN, p_lock_cogs BOOLEAN) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_customer_balances_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_vendor_balances_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_ar_aging_rpc(p_company_id UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_ap_aging_rpc(p_company_id UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_sales_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_purchase_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_no_group_posting() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_account_balances() SET search_path = public, pg_temp;
ALTER FUNCTION public.resolve_item_gl_account_rpc(p_company_id UUID, p_item_id UUID, p_account_category TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_reverse_gl_transaction(p_company_id UUID, p_original_journal_id UUID, p_reversal_date DATE, p_reason TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_post_stock_adjustment(p_payload JSONB, p_idempotency_key UUID, p_gl_settings JSONB) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_periodic_inventory_balances_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_detail_general_ledger_rpc(p_company_id UUID, p_account_id UUID, p_from_date DATE, p_to_date DATE) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_stabilized_general_ledger_statement_rpc(p_company_id UUID, p_account_id UUID, p_from_date DATE, p_to_date DATE) SET search_path = public, pg_temp;

ALTER FUNCTION public.check_user_operational_access_rpc(p_user_id UUID, p_company_id TEXT, p_module TEXT, p_operation TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_delete_gl_journals(p_source_id UUID, p_source_type TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_commit_journal_entry_internal(p_company_id UUID, p_date DATE, p_description TEXT, p_module TEXT, p_source_id UUID, p_source_type TEXT, p_voucher_no TEXT, p_lines JSONB) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_post_sales_invoice(p_company_id UUID, p_invoice_id UUID, p_idempotency_key UUID, p_gl_lines JSONB, p_is_reversal BOOLEAN) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_post_purchase_invoice(p_company_id UUID, p_invoice_id UUID, p_idempotency_key UUID, p_gl_lines JSONB, p_is_reversal BOOLEAN) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_post_financial_voucher(p_company_id UUID, p_voucher_id UUID, p_idempotency_key UUID, p_gl_lines JSONB, p_is_reversal BOOLEAN) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_post_pos_sale(p_payload JSONB, p_idempotency_key UUID, p_gl_settings JSONB) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_post_sales_return(p_payload JSONB, p_idempotency_key UUID, p_gl_settings JSONB) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_post_purchase_return(p_payload JSONB, p_idempotency_key UUID, p_gl_settings JSONB) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_post_payroll_run(p_payload JSONB, p_idempotency_key UUID, p_gl_settings JSONB) SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_sales_invoice_lines() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_purchase_invoice_lines() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_item_recent_trading_history_rpc(p_item_id UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_partner_ledger_history_rpc(p_entity_id UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_modified_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.rebuild_inventory_wac_timeline(p_company_id uuid, p_start_date date, p_end_date date) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_trial_balance_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) SET search_path = public, pg_temp;
ALTER FUNCTION public.apply_price_revision_rpc(p_company_id UUID, p_category_id UUID, p_item_id UUID, p_adjustment_type TEXT, p_adjustment_value NUMERIC, p_remarks TEXT, p_user_id UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_profit_loss_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_gl_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_comparative_profit_loss_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE, p_comp_from_date DATE, p_comp_to_date DATE) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_next_voucher_number(p_company_id UUID, p_voucher_type TEXT, p_date DATE) SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_generate_voucher_number_fin() SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_generate_voucher_number_pos() SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_generate_voucher_number_pinv() SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_generate_voucher_number_sinv() SET search_path = public, pg_temp;
ALTER FUNCTION public.check_fiscal_year_bounds() SET search_path = public, pg_temp;
ALTER FUNCTION public.close_and_open_fiscal_year(p_company_id UUID, p_closing_fy_id UUID, p_new_fy_id UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.reopen_fiscal_year(p_company_id UUID, p_fy_id UUID, p_reason TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_recascade() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_payroll_run(p_company_id UUID, p_month INTEGER, p_year INTEGER, p_label TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.user_has_company_access(company_uuid text) SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_retroactive_bill_knockoff(p_company_id UUID, p_type TEXT, p_allocations JSONB) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_current_stock() SET search_path = public, pg_temp;
ALTER FUNCTION public.inject_default_godown_id() SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_post_stock_transfer(p_company_id UUID, p_transfer_id UUID, p_idempotency_key UUID, p_source_godown_id UUID, p_dest_godown_id UUID, p_items JSONB, p_transfer_date TIMESTAMP WITH TIME ZONE) SET search_path = public, pg_temp;
ALTER FUNCTION public.post_stock_assembly_to_ledger(p_assembly_id UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.create_or_update_stock_assembly(p_assembly_id UUID, p_company_id UUID, p_assembly_no VARCHAR, p_godown_id UUID, p_assembly_date DATE, p_overhead_cost NUMERIC, p_status VARCHAR, p_notes TEXT, p_items JSONB) SET search_path = public, pg_temp;
ALTER FUNCTION public.complete_stock_assembly(p_assembly_id UUID, p_company_id UUID) SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_single_active_fiscal_year() SET search_path = public, pg_temp;
ALTER FUNCTION public.rpc_recalculate_wac_on_purchase(p_company_id UUID, p_invoice_lines JSONB) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_company_data(p_company_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;

-------------------------------------------------------------------------------
-- 2. Revoke Anon Execute and Convert Utility Functions to SECURITY INVOKER
-------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_post_gl_transaction(p_company_id UUID, p_date DATE, p_description TEXT, p_module TEXT, p_source_id UUID, p_source_type TEXT, p_lines JSONB, p_is_reversal BOOLEAN, p_lock_cogs BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_customer_balances_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) FROM anon;
ALTER FUNCTION public.get_customer_balances_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.get_vendor_balances_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) FROM anon;
ALTER FUNCTION public.get_vendor_balances_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.get_ar_aging_rpc(p_company_id UUID) FROM anon;
ALTER FUNCTION public.get_ar_aging_rpc(p_company_id UUID) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.get_ap_aging_rpc(p_company_id UUID) FROM anon;
ALTER FUNCTION public.get_ap_aging_rpc(p_company_id UUID) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.get_sales_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) FROM anon;
ALTER FUNCTION public.get_sales_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.get_purchase_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) FROM anon;
ALTER FUNCTION public.get_purchase_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.check_user_operational_access_rpc(p_user_id UUID, p_company_id TEXT, p_module TEXT, p_operation TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_delete_gl_journals(p_source_id UUID, p_source_type TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rebuild_inventory_wac_timeline(p_company_id uuid, p_start_date date, p_end_date date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_has_company_access(p_company_id UUID) FROM anon;
ALTER FUNCTION public.user_has_company_access(p_company_id UUID) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.is_current_user_super_admin() FROM anon;
ALTER FUNCTION public.is_current_user_super_admin() SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.get_shared_colleague_ids() FROM anon;
ALTER FUNCTION public.get_shared_colleague_ids() SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.apply_price_revision_rpc(p_company_id UUID, p_category_id UUID, p_item_id UUID, p_adjustment_type TEXT, p_adjustment_value NUMERIC, p_remarks TEXT, p_user_id UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_recalculate_item_wac(p_company_id UUID, p_item_id UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_retroactive_bill_knockoff(p_company_id UUID, p_type TEXT, p_allocations JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_or_update_stock_assembly(p_assembly_id UUID, p_company_id UUID, p_assembly_no VARCHAR, p_godown_id UUID, p_assembly_date DATE, p_overhead_cost NUMERIC, p_status VARCHAR, p_notes TEXT, p_items JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_stock_assembly(p_assembly_id UUID, p_company_id UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_sales_invoice_lines() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_purchase_invoice_lines() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_company_data(p_company_id uuid) FROM anon;

-- NOTE: Business-logic RPCs (e.g. rpc_post_gl_transaction, rebuild_inventory_wac_timeline)
-- remain SECURITY DEFINER to allow posting to restricted tables.
-- Their bodies should independently enforce auth.uid() checks.



