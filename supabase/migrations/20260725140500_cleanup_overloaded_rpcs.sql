-- ============================================================================
-- MIGRATION: 0128_cleanup_overloaded_rpcs.sql
-- PURPOSE: Clean Slate Migration for 8 core posting RPCs, adopting
--          Extensible Payload (JSONB p_options) and Strict Security Hardening.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. rpc_post_financial_voucher
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_post_financial_voucher(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS rpc_post_financial_voucher(UUID, UUID, UUID, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS rpc_post_financial_voucher(UUID, UUID, UUID, JSONB, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS rpc_post_financial_voucher(UUID, UUID, UUID, JSONB, JSONB);

CREATE OR REPLACE FUNCTION rpc_post_financial_voucher(
    p_company_id UUID,
    p_voucher_id UUID,
    p_idempotency_key UUID,
    p_gl_lines JSONB,
    p_options JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_journal_id UUID;
    v_voucher RECORD;
    v_line JSONB;
    v_acc_id UUID;
    v_is_control BOOLEAN;
    v_is_reversal BOOLEAN;
    v_system_override BOOLEAN;
BEGIN
    v_is_reversal := COALESCE((p_options->>'is_reversal')::BOOLEAN, false);
    v_system_override := COALESCE((p_options->>'system_override')::BOOLEAN, false);

    SELECT * INTO v_voucher FROM "FinancialVoucher" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF v_voucher.id IS NOT NULL THEN RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_voucher.gl_journal_id); END IF;

    SELECT * INTO v_voucher FROM "FinancialVoucher" WHERE id = p_voucher_id;
    
    IF v_is_reversal THEN 
        PERFORM rpc_delete_gl_journals(p_voucher_id, 'FinancialVoucher'); 
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_gl_lines) LOOP
        v_acc_id := (v_line->>'account_id')::UUID;
        IF v_acc_id IS NOT NULL THEN
            SELECT is_control_account INTO v_is_control FROM "ChartOfAccount" WHERE id = v_acc_id;
            IF v_is_control AND NOT v_system_override THEN
                RAISE EXCEPTION 'Posting Aborted: Direct manual journals to control accounts are prohibited.';
            END IF;
        END IF;
    END LOOP;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, 
        v_voucher.voucher_date::DATE, 
        COALESCE(v_voucher.narration, ''),
        'Vouchers', 
        p_voucher_id, 
        'FinancialVoucher', 
        COALESCE(v_voucher.voucher_number, ''), 
        p_gl_lines
    );

    UPDATE "FinancialVoucher" SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key WHERE id = p_voucher_id;
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_post_financial_voucher(UUID, UUID, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_post_financial_voucher(UUID, UUID, UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_post_financial_voucher(UUID, UUID, UUID, JSONB, JSONB) TO service_role;


-- ============================================================================
-- 2. rpc_post_gl_transaction
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_post_gl_transaction(UUID, DATE, TEXT, TEXT, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS rpc_post_gl_transaction(UUID, DATE, TEXT, TEXT, UUID, TEXT, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS rpc_post_gl_transaction(UUID, DATE, TEXT, TEXT, UUID, TEXT, JSONB, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS rpc_post_gl_transaction(UUID, DATE, TEXT, TEXT, UUID, TEXT, JSONB, BOOLEAN, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS rpc_post_gl_transaction(UUID, DATE, TEXT, TEXT, UUID, TEXT, JSONB, JSONB);

CREATE OR REPLACE FUNCTION rpc_post_gl_transaction(
    p_company_id UUID,
    p_date DATE,
    p_description TEXT,
    p_module TEXT,
    p_source_id UUID,
    p_source_type TEXT,
    p_lines JSONB,
    p_options JSONB DEFAULT '{}'::JSONB
) RETURNS UUID
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_journal_id UUID;
    v_is_reversal BOOLEAN;
    v_lock_cogs BOOLEAN;
    v_voucher_no TEXT;
BEGIN
    v_is_reversal := COALESCE((p_options->>'is_reversal')::BOOLEAN, false);
    v_lock_cogs := COALESCE((p_options->>'lock_cogs')::BOOLEAN, false);
    v_voucher_no := p_options->>'voucher_no';

    -- Pass through to the new internal journal engine
    IF v_is_reversal THEN
        PERFORM rpc_delete_gl_journals(p_source_id, p_source_type);
        RETURN NULL;
    ELSE
        v_journal_id := rpc_commit_journal_entry_internal(
            p_company_id,
            p_date,
            p_description,
            p_module,
            p_source_id,
            p_source_type,
            COALESCE(v_voucher_no, ''),
            p_lines
        );
        RETURN v_journal_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_post_gl_transaction(UUID, DATE, TEXT, TEXT, UUID, TEXT, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_post_gl_transaction(UUID, DATE, TEXT, TEXT, UUID, TEXT, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_post_gl_transaction(UUID, DATE, TEXT, TEXT, UUID, TEXT, JSONB, JSONB) TO service_role;

-- ============================================================================
-- 3. rpc_post_sales_invoice
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_post_sales_invoice(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS rpc_post_sales_invoice(UUID, UUID, UUID, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS rpc_post_sales_invoice(UUID, UUID, UUID, JSONB, JSONB);

CREATE OR REPLACE FUNCTION rpc_post_sales_invoice(
    p_company_id UUID,
    p_invoice_id UUID,
    p_idempotency_key UUID,
    p_gl_lines JSONB,
    p_options JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_journal_id UUID;
    v_invoice RECORD;
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_cost_at_sale NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_final_gl_lines JSONB := '[]'::JSONB;
    v_user_gl_line JSONB;
    v_is_physical BOOLEAN;
    v_existing RECORD;
    v_is_reversal BOOLEAN;
BEGIN
    v_is_reversal := COALESCE((p_options->>'is_reversal')::BOOLEAN, false);

    SELECT * INTO v_existing FROM "SalesInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN 
        SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
        RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_invoice.gl_journal_id); 
    END IF;

    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    
    IF v_is_reversal THEN 
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'SalesInvoice'); 
        
        -- Revert Stock
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
        LOOP
            v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
            v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
            
            IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
                SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id FOR UPDATE;
                IF v_is_physical THEN
                    UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_quantity WHERE id = v_item_id;
                END IF;
            END IF;
        END LOOP;
        
        DELETE FROM "InventoryHistory" WHERE reference_id = p_invoice_id AND reference_type = 'SalesInvoice';
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
    END IF;

    FOR v_user_gl_line IN SELECT * FROM jsonb_array_elements(p_gl_lines) LOOP
        v_final_gl_lines := v_final_gl_lines || v_user_gl_line;
    END LOOP;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0)
            INTO v_is_physical, v_cost_at_sale 
            FROM "Item" 
            WHERE id = v_item_id 
            FOR UPDATE;

            IF v_is_physical THEN
                IF v_cost_at_sale > 0 THEN
                    v_cogs_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'cogs');
                    v_inv_acc := resolve_item_gl_account_rpc(p_company_id, v_item_id, 'inventory');
                    
                    IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL THEN
                        v_final_gl_lines := v_final_gl_lines || jsonb_build_object(
                            'account_id', v_cogs_acc, 'debit_amount', v_quantity * v_cost_at_sale, 'credit_amount', 0,
                            'description', 'COGS for ' || v_invoice.invoice_number
                        );
                        v_final_gl_lines := v_final_gl_lines || jsonb_build_object(
                            'account_id', v_inv_acc, 'debit_amount', 0, 'credit_amount', v_quantity * v_cost_at_sale,
                            'description', 'Inventory Out for ' || v_invoice.invoice_number
                        );
                    END IF;
                END IF;

                UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_quantity WHERE id = v_item_id;

                INSERT INTO "InventoryHistory" (
                    item_id, company_id, transaction_date, reference_id, reference_type, reference_no,
                    quantity_change, unit_cost, notes
                ) VALUES (
                    v_item_id, p_company_id, v_invoice.invoice_date, p_invoice_id, 'SalesInvoice', v_invoice.invoice_number,
                    -v_quantity, v_cost_at_sale, 'Sales Issue'
                );
            END IF;
        END IF;
    END LOOP;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, 
        v_invoice.invoice_date::DATE, 
        COALESCE(v_invoice.notes, 'Sales Invoice ' || v_invoice.invoice_number),
        'Sales', 
        p_invoice_id, 
        'SalesInvoice', 
        v_invoice.invoice_number, 
        v_final_gl_lines
    );

    UPDATE "SalesInvoice" SET status = 'Posted', idempotency_key = p_idempotency_key WHERE id = p_invoice_id;
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_post_sales_invoice(UUID, UUID, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_post_sales_invoice(UUID, UUID, UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_post_sales_invoice(UUID, UUID, UUID, JSONB, JSONB) TO service_role;

-- ============================================================================
-- 4. rpc_post_purchase_invoice
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_post_purchase_invoice(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS rpc_post_purchase_invoice(UUID, UUID, UUID, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS rpc_post_purchase_invoice(UUID, UUID, UUID, JSONB, JSONB);

CREATE OR REPLACE FUNCTION rpc_post_purchase_invoice(
    p_company_id UUID,
    p_invoice_id UUID,
    p_idempotency_key UUID,
    p_gl_lines JSONB,
    p_options JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_journal_id UUID;
    v_invoice RECORD;
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_is_physical BOOLEAN;
    v_existing RECORD;
    v_is_reversal BOOLEAN;
BEGIN
    v_is_reversal := COALESCE((p_options->>'is_reversal')::BOOLEAN, false);

    SELECT * INTO v_existing FROM "PurchaseInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN 
        SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE id = p_invoice_id;
        RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_invoice.gl_journal_id); 
    END IF;

    SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    
    IF v_is_reversal THEN 
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'PurchaseInvoice'); 
        
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
        LOOP
            v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
            v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
            
            IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
                SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id FOR UPDATE;
                IF v_is_physical THEN
                    UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_quantity WHERE id = v_item_id;
                END IF;
            END IF;
        END LOOP;
        
        DELETE FROM "InventoryHistory" WHERE reference_id = p_invoice_id AND reference_type = 'PurchaseInvoice';
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id FOR UPDATE;
            IF v_is_physical THEN
                UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_quantity WHERE id = v_item_id;

                INSERT INTO "InventoryHistory" (
                    item_id, company_id, transaction_date, reference_id, reference_type, reference_no,
                    quantity_change, unit_cost, notes
                ) VALUES (
                    v_item_id, p_company_id, v_invoice.invoice_date, p_invoice_id, 'PurchaseInvoice', v_invoice.invoice_number,
                    v_quantity, COALESCE((v_item->>'unit_price')::NUMERIC, 0), 'Purchase Receipt'
                );
            END IF;
        END IF;
    END LOOP;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, 
        v_invoice.invoice_date::DATE, 
        COALESCE(v_invoice.notes, 'Purchase Invoice ' || v_invoice.invoice_number),
        'Purchases', 
        p_invoice_id, 
        'PurchaseInvoice', 
        v_invoice.invoice_number, 
        p_gl_lines
    );

    UPDATE "PurchaseInvoice" SET status = 'Posted', idempotency_key = p_idempotency_key WHERE id = p_invoice_id;
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_post_purchase_invoice(UUID, UUID, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_post_purchase_invoice(UUID, UUID, UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_post_purchase_invoice(UUID, UUID, UUID, JSONB, JSONB) TO service_role;

-- ============================================================================
-- 5. rpc_post_pos_sale
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_post_pos_sale(JSONB, UUID, JSONB);
DROP FUNCTION IF EXISTS rpc_post_pos_sale(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS rpc_post_pos_sale(UUID, UUID, UUID, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS rpc_post_pos_sale(JSONB, UUID, JSONB, JSONB);

CREATE OR REPLACE FUNCTION rpc_post_pos_sale(
    p_payload JSONB,
    p_idempotency_key UUID,
    p_gl_settings JSONB,
    p_options JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_pos_id UUID;
    v_company_id UUID;
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_qty NUMERIC;
    v_rate NUMERIC;
    v_line_total NUMERIC;
    v_existing RECORD;
    v_cash_bank_acc UUID;
    v_grand_total NUMERIC;
    v_rev_acc UUID;
    v_is_physical BOOLEAN;
    v_cost NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_tax_amount NUMERIC;
    v_tax_acc UUID;
    v_lines JSONB;
    v_is_reversal BOOLEAN;
BEGIN
    v_is_reversal := COALESCE((p_options->>'is_reversal')::BOOLEAN, false);
    
    SELECT * INTO v_existing FROM "POSSale" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'POS Sale already posted');
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_pos_id := (p_payload->>'id')::UUID;
    
    IF v_is_reversal THEN
        PERFORM rpc_delete_gl_journals(v_pos_id, 'POSSale'); 
        RETURN jsonb_build_object('status', 'success');
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        IF v_item_id IS NOT NULL AND v_qty > 0 THEN
            UPDATE "Item" 
            SET quantity_on_hand = quantity_on_hand - v_qty 
            WHERE id = v_item_id AND item_type != 'Service';
        END IF;
    END LOOP;

    v_lines := '[]'::JSONB;
    v_cash_bank_acc := COALESCE(
        (p_payload->>'cash_bank_account_id')::UUID,
        (p_gl_settings->>'gl_cash_account_id')::UUID,
        (p_gl_settings->>'gl_accounts_receivable_id')::UUID
    );
    v_grand_total := COALESCE((p_payload->>'grand_total')::NUMERIC, (p_payload->>'total_amount')::NUMERIC, 0);
    
    IF v_grand_total > 0 THEN
        IF v_cash_bank_acc IS NULL THEN RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Accounts Receivable or Cash/Bank account mapping.'; END IF;
        
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_cash_bank_acc, 'debit_amount', v_grand_total, 'credit_amount', 0,
            'description', 'POS Sale ' || COALESCE(p_payload->>'sale_number', ''), 'entity_type', 'Customer', 'entity_id', (p_payload->>'customer_id')::UUID
        );
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        v_rate := (v_line->>'rate')::NUMERIC;
        v_line_total := COALESCE((v_line->>'total')::NUMERIC, v_qty * v_rate);
        
        v_rev_acc := COALESCE(
            (v_line->>'income_account_id')::UUID, resolve_item_gl_account_rpc(v_company_id, v_item_id, 'sales'), (p_gl_settings->>'gl_default_sales_account_id')::UUID
        );
        IF v_rev_acc IS NULL THEN RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Revenue account for item %', v_item_id; END IF;
        
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_rev_acc, 'debit_amount', 0, 'credit_amount', v_line_total, 'description', 'Revenue: ' || COALESCE(v_line->>'item_name', 'Item')
        );

        SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0) INTO v_is_physical, v_cost FROM "Item" WHERE id = v_item_id;

        IF v_is_physical AND v_cost > 0 AND v_qty > 0 THEN
            v_cogs_acc := COALESCE((v_line->>'cogs_account_id')::UUID, resolve_item_gl_account_rpc(v_company_id, v_item_id, 'cogs'), (p_gl_settings->>'gl_default_cogs_account_id')::UUID);
            v_inv_acc := COALESCE((v_line->>'asset_account_id')::UUID, resolve_item_gl_account_rpc(v_company_id, v_item_id, 'inventory'), (p_gl_settings->>'gl_default_inventory_account_id')::UUID);

            IF v_cogs_acc IS NULL OR v_inv_acc IS NULL THEN RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing COGS or Inventory account mapping for item %', v_item_id; END IF;

            v_lines := v_lines || jsonb_build_object('account_id', v_cogs_acc, 'debit_amount', v_qty * v_cost, 'credit_amount', 0, 'description', 'COGS for POS Sale: ' || COALESCE(v_line->>'item_name', 'Item'));
            v_lines := v_lines || jsonb_build_object('account_id', v_inv_acc, 'debit_amount', 0, 'credit_amount', v_qty * v_cost, 'description', 'Inventory Out: ' || COALESCE(v_line->>'item_name', 'Item'));
        END IF;

        IF v_is_physical AND v_qty > 0 THEN
            INSERT INTO "InventoryHistory" (
                item_id, company_id, transaction_date, reference_id, reference_type, reference_no, quantity_change, unit_cost, notes
            ) VALUES (
                v_item_id, v_company_id, COALESCE((p_payload->>'sale_date')::TIMESTAMP WITH TIME ZONE, NOW()), v_pos_id, 'POSSale', COALESCE(p_payload->>'sale_number', ''),
                -v_qty, COALESCE(v_cost, v_rate), 'POS Sale Issue'
            );
        END IF;
    END LOOP;

    v_tax_amount := COALESCE((p_payload->>'total_tax_amount')::NUMERIC, 0);
    IF v_tax_amount > 0 THEN
        v_tax_acc := (p_gl_settings->>'gl_vat_payable_id')::UUID;
        IF v_tax_acc IS NULL THEN RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing VAT Payable account mapping.'; END IF;
        v_lines := v_lines || jsonb_build_object('account_id', v_tax_acc, 'debit_amount', 0, 'credit_amount', v_tax_amount, 'description', 'VAT on POS Sale');
    END IF;

    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id, (p_payload->>'sale_date')::DATE, 'POS Sale ' || COALESCE(p_payload->>'sale_number', ''), 'POS', v_pos_id, 'POSSale', COALESCE(p_payload->>'sale_number', ''), v_lines
    );

    UPDATE "POSSale" SET status = 'Completed', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key WHERE id = v_pos_id;
    RETURN jsonb_build_object('success', true, 'id', v_pos_id);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_post_pos_sale(JSONB, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_post_pos_sale(JSONB, UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_post_pos_sale(JSONB, UUID, JSONB, JSONB) TO service_role;

-- ============================================================================
-- 6. rpc_post_sales_return
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_post_sales_return(JSONB, UUID, JSONB);
DROP FUNCTION IF EXISTS rpc_post_sales_return(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS rpc_post_sales_return(UUID, UUID, UUID, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS rpc_post_sales_return(JSONB, UUID, JSONB, JSONB);

CREATE OR REPLACE FUNCTION rpc_post_sales_return(
    p_payload JSONB,
    p_idempotency_key UUID,
    p_gl_settings JSONB,
    p_options JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_return_id UUID;
    v_company_id UUID;
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_qty NUMERIC;
    v_rate NUMERIC;
    v_line_total NUMERIC;
    v_existing RECORD;
    v_cash_bank_acc UUID;
    v_grand_total NUMERIC;
    v_rev_acc UUID;
    v_is_physical BOOLEAN;
    v_cost NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_tax_amount NUMERIC;
    v_tax_acc UUID;
    v_lines JSONB;
    v_is_reversal BOOLEAN;
BEGIN
    v_is_reversal := COALESCE((p_options->>'is_reversal')::BOOLEAN, false);
    
    SELECT * INTO v_existing FROM "SalesReturn" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'Return already posted'); END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_return_id := (p_payload->>'id')::UUID;

    IF v_is_reversal THEN
        PERFORM rpc_delete_gl_journals(v_return_id, 'SalesReturn'); 
        RETURN jsonb_build_object('status', 'success');
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        IF v_item_id IS NOT NULL AND v_qty > 0 THEN
            UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_qty WHERE id = v_item_id AND item_type != 'Service';
        END IF;
    END LOOP;

    v_lines := '[]'::JSONB;
    v_cash_bank_acc := COALESCE((p_payload->>'cash_bank_account_id')::UUID, (p_gl_settings->>'gl_cash_account_id')::UUID, (p_gl_settings->>'gl_accounts_receivable_id')::UUID);
    v_grand_total := COALESCE((p_payload->>'grand_total')::NUMERIC, (p_payload->>'total_amount')::NUMERIC, 0);
    
    IF v_grand_total > 0 THEN
        IF v_cash_bank_acc IS NULL THEN RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Accounts Receivable or Cash/Bank account mapping.'; END IF;
        
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_cash_bank_acc, 'debit_amount', 0, 'credit_amount', v_grand_total,
            'description', 'Sales Return ' || COALESCE(p_payload->>'return_number', ''), 'entity_type', 'Customer', 'entity_id', (p_payload->>'customer_id')::UUID
        );
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        v_rate := (v_line->>'rate')::NUMERIC;
        v_line_total := COALESCE((v_line->>'total')::NUMERIC, v_qty * v_rate);
        
        v_rev_acc := COALESCE((v_line->>'income_account_id')::UUID, resolve_item_gl_account_rpc(v_company_id, v_item_id, 'sales'), (p_gl_settings->>'gl_default_sales_account_id')::UUID);
        IF v_rev_acc IS NULL THEN RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Revenue account for item %', v_item_id; END IF;
        
        v_lines := v_lines || jsonb_build_object('account_id', v_rev_acc, 'debit_amount', v_line_total, 'credit_amount', 0, 'description', 'Sales Return: ' || COALESCE(v_line->>'item_name', 'Item'));

        SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0) INTO v_is_physical, v_cost FROM "Item" WHERE id = v_item_id;

        IF v_is_physical AND v_cost > 0 AND v_qty > 0 THEN
            v_cogs_acc := COALESCE((v_line->>'cogs_account_id')::UUID, resolve_item_gl_account_rpc(v_company_id, v_item_id, 'cogs'), (p_gl_settings->>'gl_default_cogs_account_id')::UUID);
            v_inv_acc := COALESCE((v_line->>'asset_account_id')::UUID, resolve_item_gl_account_rpc(v_company_id, v_item_id, 'inventory'), (p_gl_settings->>'gl_default_inventory_account_id')::UUID);

            IF v_cogs_acc IS NULL OR v_inv_acc IS NULL THEN RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing COGS or Inventory account mapping for item %', v_item_id; END IF;

            v_lines := v_lines || jsonb_build_object('account_id', v_cogs_acc, 'debit_amount', 0, 'credit_amount', v_qty * v_cost, 'description', 'COGS for Sales Return: ' || COALESCE(v_line->>'item_name', 'Item'));
            v_lines := v_lines || jsonb_build_object('account_id', v_inv_acc, 'debit_amount', v_qty * v_cost, 'credit_amount', 0, 'description', 'Inventory In: ' || COALESCE(v_line->>'item_name', 'Item'));
        END IF;

        IF v_is_physical AND v_qty > 0 THEN
            INSERT INTO "InventoryHistory" (
                item_id, company_id, transaction_date, reference_id, reference_type, reference_no, quantity_change, unit_cost, notes
            ) VALUES (
                v_item_id, v_company_id, COALESCE((p_payload->>'return_date')::TIMESTAMP WITH TIME ZONE, NOW()), v_return_id, 'SalesReturn', COALESCE(p_payload->>'return_number', ''),
                v_qty, COALESCE(v_cost, v_rate), 'Sales Return Receipt'
            );
        END IF;
    END LOOP;

    v_tax_amount := COALESCE((p_payload->>'total_tax_amount')::NUMERIC, 0);
    IF v_tax_amount > 0 THEN
        v_tax_acc := (p_gl_settings->>'gl_vat_payable_id')::UUID;
        IF v_tax_acc IS NULL THEN RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing VAT Payable account mapping.'; END IF;
        v_lines := v_lines || jsonb_build_object('account_id', v_tax_acc, 'debit_amount', v_tax_amount, 'credit_amount', 0, 'description', 'VAT on Sales Return');
    END IF;

    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id, (p_payload->>'return_date')::DATE, 'Sales Return ' || COALESCE(p_payload->>'return_number', ''), 'Sales', v_return_id, 'SalesReturn', COALESCE(p_payload->>'return_number', ''), v_lines
    );

    UPDATE "SalesReturn" SET status = 'Completed', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key WHERE id = v_return_id;
    RETURN jsonb_build_object('success', true, 'id', v_return_id);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_post_sales_return(JSONB, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_post_sales_return(JSONB, UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_post_sales_return(JSONB, UUID, JSONB, JSONB) TO service_role;

-- ============================================================================
-- 7. rpc_post_purchase_return
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_post_purchase_return(JSONB, UUID, JSONB);
DROP FUNCTION IF EXISTS rpc_post_purchase_return(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS rpc_post_purchase_return(UUID, UUID, UUID, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS rpc_post_purchase_return(JSONB, UUID, JSONB, JSONB);

CREATE OR REPLACE FUNCTION rpc_post_purchase_return(
    p_payload JSONB,
    p_idempotency_key UUID,
    p_gl_settings JSONB,
    p_options JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_return_id UUID;
    v_company_id UUID;
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_qty NUMERIC;
    v_rate NUMERIC;
    v_line_total NUMERIC;
    v_existing RECORD;
    v_cash_bank_acc UUID;
    v_grand_total NUMERIC;
    v_is_physical BOOLEAN;
    v_cost NUMERIC;
    v_inv_acc UUID;
    v_tax_amount NUMERIC;
    v_tax_acc UUID;
    v_lines JSONB;
    v_is_reversal BOOLEAN;
BEGIN
    v_is_reversal := COALESCE((p_options->>'is_reversal')::BOOLEAN, false);
    
    SELECT * INTO v_existing FROM "PurchaseReturn" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'Return already posted'); END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_return_id := (p_payload->>'id')::UUID;

    IF v_is_reversal THEN
        PERFORM rpc_delete_gl_journals(v_return_id, 'PurchaseReturn'); 
        RETURN jsonb_build_object('status', 'success');
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        IF v_item_id IS NOT NULL AND v_qty > 0 THEN
            UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_qty WHERE id = v_item_id AND item_type != 'Service';
        END IF;
    END LOOP;

    v_lines := '[]'::JSONB;
    v_cash_bank_acc := COALESCE((p_payload->>'cash_bank_account_id')::UUID, (p_gl_settings->>'gl_cash_account_id')::UUID, (p_gl_settings->>'gl_accounts_payable_id')::UUID);
    v_grand_total := COALESCE((p_payload->>'grand_total')::NUMERIC, (p_payload->>'total_amount')::NUMERIC, 0);
    
    IF v_grand_total > 0 THEN
        IF v_cash_bank_acc IS NULL THEN RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Accounts Payable or Cash/Bank account mapping.'; END IF;
        
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_cash_bank_acc, 'debit_amount', v_grand_total, 'credit_amount', 0,
            'description', 'Purchase Return ' || COALESCE(p_payload->>'return_number', ''), 'entity_type', 'Vendor', 'entity_id', (p_payload->>'vendor_id')::UUID
        );
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        v_rate := (v_line->>'rate')::NUMERIC;
        v_line_total := COALESCE((v_line->>'total')::NUMERIC, v_qty * v_rate);
        
        SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0) INTO v_is_physical, v_cost FROM "Item" WHERE id = v_item_id;

        v_inv_acc := COALESCE((v_line->>'asset_account_id')::UUID, resolve_item_gl_account_rpc(v_company_id, v_item_id, 'inventory'), (p_gl_settings->>'gl_default_inventory_account_id')::UUID);
        IF v_inv_acc IS NULL THEN RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Inventory/Expense account mapping for item %', v_item_id; END IF;

        v_lines := v_lines || jsonb_build_object('account_id', v_inv_acc, 'debit_amount', 0, 'credit_amount', v_line_total, 'description', 'Purchase Return Out: ' || COALESCE(v_line->>'item_name', 'Item'));

        IF v_is_physical AND v_qty > 0 THEN
            INSERT INTO "InventoryHistory" (
                item_id, company_id, transaction_date, reference_id, reference_type, reference_no, quantity_change, unit_cost, notes
            ) VALUES (
                v_item_id, v_company_id, COALESCE((p_payload->>'return_date')::TIMESTAMP WITH TIME ZONE, NOW()), v_return_id, 'PurchaseReturn', COALESCE(p_payload->>'return_number', ''),
                -v_qty, COALESCE(v_cost, v_rate), 'Purchase Return Issue'
            );
        END IF;
    END LOOP;

    v_tax_amount := COALESCE((p_payload->>'total_tax_amount')::NUMERIC, 0);
    IF v_tax_amount > 0 THEN
        v_tax_acc := (p_gl_settings->>'gl_vat_receivable_id')::UUID;
        IF v_tax_acc IS NULL THEN RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing VAT Receivable account mapping.'; END IF;
        v_lines := v_lines || jsonb_build_object('account_id', v_tax_acc, 'debit_amount', 0, 'credit_amount', v_tax_amount, 'description', 'VAT on Purchase Return');
    END IF;

    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id, (p_payload->>'return_date')::DATE, 'Purchase Return ' || COALESCE(p_payload->>'return_number', ''), 'Purchases', v_return_id, 'PurchaseReturn', COALESCE(p_payload->>'return_number', ''), v_lines
    );

    UPDATE "PurchaseReturn" SET status = 'Completed', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key WHERE id = v_return_id;
    RETURN jsonb_build_object('success', true, 'id', v_return_id);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_post_purchase_return(JSONB, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_post_purchase_return(JSONB, UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_post_purchase_return(JSONB, UUID, JSONB, JSONB) TO service_role;

-- ============================================================================
-- 8. rpc_post_stock_adjustment
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_post_stock_adjustment(JSONB, UUID, JSONB);
DROP FUNCTION IF EXISTS rpc_post_stock_adjustment(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS rpc_post_stock_adjustment(UUID, UUID, UUID, JSONB, BOOLEAN);
DROP FUNCTION IF EXISTS rpc_post_stock_adjustment(JSONB, UUID, JSONB, JSONB);

CREATE OR REPLACE FUNCTION rpc_post_stock_adjustment(
    p_payload JSONB,
    p_idempotency_key UUID,
    p_gl_settings JSONB,
    p_options JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_adj_id UUID;
    v_company_id UUID;
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_qty_diff NUMERIC;
    v_cost_impact NUMERIC;
    v_existing RECORD;
    v_adj_acc UUID;
    v_inv_acc UUID;
    v_lines JSONB := '[]'::JSONB;
    v_is_physical BOOLEAN;
    v_cost NUMERIC;
    v_is_reversal BOOLEAN;
BEGIN
    v_is_reversal := COALESCE((p_options->>'is_reversal')::BOOLEAN, false);

    SELECT * INTO v_existing FROM "StockAdjustment" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'Adjustment already posted'); END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_adj_id := (p_payload->>'id')::UUID;

    IF v_is_reversal THEN
        PERFORM rpc_delete_gl_journals(v_adj_id, 'StockAdjustment'); 
        RETURN jsonb_build_object('status', 'success');
    END IF;

    v_adj_acc := COALESCE((p_payload->>'adjustment_account_id')::UUID, (p_gl_settings->>'gl_inventory_adjustment_account_id')::UUID);
    IF v_adj_acc IS NULL THEN RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Inventory Adjustment account mapping.'; END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty_diff := (v_line->>'quantity')::NUMERIC;
        v_cost_impact := (v_line->>'cost_impact')::NUMERIC;

        IF v_item_id IS NOT NULL AND v_qty_diff != 0 THEN
            UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_qty_diff WHERE id = v_item_id AND item_type != 'Service';
            
            SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0) INTO v_is_physical, v_cost FROM "Item" WHERE id = v_item_id;

            IF v_is_physical THEN
                v_inv_acc := COALESCE((v_line->>'asset_account_id')::UUID, resolve_item_gl_account_rpc(v_company_id, v_item_id, 'inventory'), (p_gl_settings->>'gl_default_inventory_account_id')::UUID);
                IF v_inv_acc IS NULL THEN RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Inventory account for item %', v_item_id; END IF;

                IF v_cost_impact > 0 THEN
                    v_lines := v_lines || jsonb_build_object('account_id', v_inv_acc, 'debit_amount', v_cost_impact, 'credit_amount', 0, 'description', 'Stock Adj Increase: ' || COALESCE(v_line->>'item_name', 'Item'));
                    v_lines := v_lines || jsonb_build_object('account_id', v_adj_acc, 'debit_amount', 0, 'credit_amount', v_cost_impact, 'description', 'Stock Adj Increase Offset');
                ELSE
                    v_lines := v_lines || jsonb_build_object('account_id', v_adj_acc, 'debit_amount', ABS(v_cost_impact), 'credit_amount', 0, 'description', 'Stock Adj Decrease Offset');
                    v_lines := v_lines || jsonb_build_object('account_id', v_inv_acc, 'debit_amount', 0, 'credit_amount', ABS(v_cost_impact), 'description', 'Stock Adj Decrease: ' || COALESCE(v_line->>'item_name', 'Item'));
                END IF;

                INSERT INTO "InventoryHistory" (
                    item_id, company_id, transaction_date, reference_id, reference_type, reference_no, quantity_change, unit_cost, notes
                ) VALUES (
                    v_item_id, v_company_id, COALESCE((p_payload->>'adjustment_date')::TIMESTAMP WITH TIME ZONE, NOW()), v_adj_id, 'StockAdjustment', COALESCE(p_payload->>'adjustment_number', ''),
                    v_qty_diff, v_cost, 'Stock Adjustment'
                );
            END IF;
        END IF;
    END LOOP;

    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id, (p_payload->>'adjustment_date')::DATE, 'Stock Adjustment ' || COALESCE(p_payload->>'adjustment_number', ''), 'Inventory', v_adj_id, 'StockAdjustment', COALESCE(p_payload->>'adjustment_number', ''), v_lines
    );

    UPDATE "StockAdjustment" SET status = 'Completed', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key WHERE id = v_adj_id;
    RETURN jsonb_build_object('success', true, 'id', v_adj_id);
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION rpc_post_stock_adjustment(JSONB, UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rpc_post_stock_adjustment(JSONB, UUID, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION rpc_post_stock_adjustment(JSONB, UUID, JSONB, JSONB) TO service_role;

COMMIT;

-- Trigger PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
