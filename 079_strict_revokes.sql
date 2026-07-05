-- Migration: 079_strict_revokes.sql
-- Description: Phase 4 Security Audit Fixes. Strictly revoke from PUBLIC and ANON,
-- re-grant to AUTHENTICATED or SERVICE_ROLE, and fix overloaded search_paths dynamically.

-------------------------------------------------------------------------------
-- 1. Strictly revoke from PUBLIC and grant to AUTHENTICATED
-------------------------------------------------------------------------------
DO $$
DECLARE
    func_name text;
    func_sig text;
BEGIN
    FOR func_name IN 
        SELECT unnest(ARRAY[
            'rpc_commit_journal_entry_internal', 'user_has_company_access', 'rpc_post_sales_return',
            'rpc_post_pos_sale', 'handle_user_updated_at', 'rpc_delete_gl_journals',
            'close_and_open_fiscal_year', 'rls_auto_enable', 'create_or_update_stock_assembly',
            'rpc_post_stock_adjustment', 'complete_stock_assembly', 'rpc_recalculate_item_wac',
            'rebuild_inventory_wac_timeline', 'rpc_post_purchase_return', 'delete_company_data',
            'check_user_operational_access_rpc', 'rpc_retroactive_bill_knockoff',
            'apply_price_revision_rpc'
        ])
    LOOP
        FOR func_sig IN (SELECT oid::regprocedure::text FROM pg_proc WHERE proname = func_name AND pronamespace = 'public'::regnamespace)
        LOOP
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon;', func_sig);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated;', func_sig);
        END LOOP;
    END LOOP;
END $$;

-------------------------------------------------------------------------------
-- 2. Strictly revoke from PUBLIC and grant exclusively to SERVICE_ROLE (Backend-only)
-------------------------------------------------------------------------------
DO $$
DECLARE
    func_name text;
    func_sig text;
BEGIN
    FOR func_name IN 
        SELECT unnest(ARRAY[
            'rpc_post_payroll_run',
            'process_branch_transfer_acknowledgement_rpc'
        ])
    LOOP
        FOR func_sig IN (SELECT oid::regprocedure::text FROM pg_proc WHERE proname = func_name AND pronamespace = 'public'::regnamespace)
        LOOP
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon;', func_sig);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role;', func_sig);
        END LOOP;
    END LOOP;
END $$;

-------------------------------------------------------------------------------
-- 3. Apply search_path to ALL overloaded signatures of these 3 functions
-------------------------------------------------------------------------------
DO $$
DECLARE
    func_name text;
    func_sig text;
BEGIN
    FOR func_name IN 
        SELECT unnest(ARRAY['rpc_post_stock_adjustment', 'rpc_post_gl_transaction', 'get_item_recent_trading_history_rpc'])
    LOOP
        FOR func_sig IN (SELECT oid::regprocedure::text FROM pg_proc WHERE proname = func_name AND pronamespace = 'public'::regnamespace)
        LOOP
            EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp;', func_sig);
        END LOOP;
    END LOOP;
END $$;
