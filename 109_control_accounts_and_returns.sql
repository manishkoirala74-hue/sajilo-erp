-- 109_control_accounts_and_returns.sql
-- Synchronize Inventory Ledger with Financial Ledger (V3)

BEGIN;

-- 1. Schema Alterations
ALTER TABLE public."ChartOfAccount" ADD COLUMN IF NOT EXISTS is_control_account BOOLEAN DEFAULT false;

-- Backfill control accounts
UPDATE public."ChartOfAccount" 
SET is_control_account = true 
WHERE statement_group = 'Cost of Goods Sold' 
   OR (account_type = 'Asset' AND (account_name ILIKE '%inventory%' OR account_name ILIKE '%stock%'));

ALTER TABLE public."InventoryLedger" 
ADD COLUMN IF NOT EXISTS wac_at_post NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS net_amount NUMERIC(15, 2) DEFAULT 0;

-- Backfill historical InventoryLedger rows
UPDATE public."InventoryLedger" l
SET 
    wac_at_post = COALESCE(
        (SELECT COALESCE(weighted_average_cost, purchase_price, current_unit_cost, 0) FROM public."Item" WHERE id = l.item_id), 
        0
    ),
    net_amount = l.total_amount,
    gross_amount = l.total_amount,
    discount_amount = 0
WHERE l.wac_at_post = 0 OR l.wac_at_post IS NULL;


-- 2. Modify rpc_post_financial_voucher (Gatekeeper with Override)
CREATE OR REPLACE FUNCTION rpc_post_financial_voucher(
    p_company_id UUID,
    p_voucher_id UUID,
    p_idempotency_key UUID,
    p_gl_lines JSONB,
    p_is_reversal BOOLEAN DEFAULT false,
    p_system_override BOOLEAN DEFAULT false
) RETURNS JSONB AS $$
DECLARE
    v_journal_id UUID;
    v_voucher RECORD;
    v_line JSONB;
    v_acc_id UUID;
    v_is_control BOOLEAN;
BEGIN
    SELECT * INTO v_voucher FROM "FinancialVoucher" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF v_voucher.id IS NOT NULL THEN RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_voucher.gl_journal_id); END IF;

    SELECT * INTO v_voucher FROM "FinancialVoucher" WHERE id = p_voucher_id;
    
    IF p_is_reversal THEN 
        PERFORM rpc_delete_gl_journals(p_voucher_id, 'FinancialVoucher'); 
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
    END IF;

    -- Gatekeeper Logic
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_gl_lines) LOOP
        v_acc_id := (v_line->>'account_id')::UUID;
        IF v_acc_id IS NOT NULL THEN
            SELECT is_control_account INTO v_is_control FROM "ChartOfAccount" WHERE id = v_acc_id;
            IF v_is_control AND NOT p_system_override THEN
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


-- 3. Modify rpc_post_sales_invoice (Single Source of Truth)
CREATE OR REPLACE FUNCTION rpc_post_sales_invoice(
    p_company_id UUID,
    p_invoice_id UUID,
    p_idempotency_key UUID,
    p_gl_lines JSONB,
    p_is_reversal BOOLEAN DEFAULT false
) RETURNS JSONB AS $$
DECLARE
    v_journal_id UUID;
    v_invoice RECORD;
    v_item JSONB;
    v_item_id UUID;
    v_quantity NUMERIC;
    v_rate NUMERIC;
    v_line_total NUMERIC;
    v_cost_at_sale NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_final_gl_lines JSONB := '[]'::JSONB;
    v_user_gl_line JSONB;
    v_is_physical BOOLEAN;
    v_existing RECORD;
BEGIN
    IF EXISTS (SELECT 1 FROM "InventoryLedger" WHERE reference_id = p_invoice_id AND ledger_status = 'Active') AND NOT p_is_reversal THEN 
        RETURN jsonb_build_object('status', 'duplicate'); 
    END IF;

    SELECT * INTO v_existing FROM "SalesInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN 
        SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
        RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_invoice.gl_journal_id); 
    END IF;

    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    
    IF p_is_reversal THEN 
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'SalesInvoice'); 
        
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
        LOOP
            v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
            v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
            
            IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
                SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id FOR UPDATE;
                IF v_is_physical THEN
                    UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_quantity WHERE id = v_item_id;
                    
                    INSERT INTO "InventoryLedger" (
                        company_id, item_id, transaction_type, godown_id, quantity_out, transaction_date, reference_id, reference_type, ledger_status
                    ) VALUES (
                        p_company_id, v_item_id, 'SalesInvoice', v_invoice.godown_id, -v_quantity, v_invoice.invoice_date, p_invoice_id, 'SalesInvoice', 'Active'
                    );
                END IF;
            END IF;
        END LOOP;
        
        UPDATE "InventoryLedger" SET ledger_status = 'Reversed' 
        WHERE reference_id = p_invoice_id AND reference_type = 'SalesInvoice' AND ledger_status = 'Active' AND quantity_out > 0;
        
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
        v_rate := COALESCE((v_item->>'rate')::NUMERIC, 0);
        v_line_total := COALESCE((v_item->>'line_total')::NUMERIC, (v_item->>'total')::NUMERIC, v_quantity * v_rate);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0)
            INTO v_is_physical, v_cost_at_sale 
            FROM "Item" 
            WHERE id = v_item_id 
            FOR UPDATE;

            IF v_is_physical THEN
                IF (SELECT current_qty FROM "CurrentStock" WHERE item_id = v_item_id AND godown_id = v_invoice.godown_id) < v_quantity THEN
                    RAISE EXCEPTION 'Insufficient stock in this Godown for item %', v_item_id;
                END IF;

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

                INSERT INTO "InventoryLedger" (
                    company_id, item_id, transaction_type, godown_id, quantity_out, transaction_date, reference_id, reference_type, 
                    wac_at_post, gross_amount, discount_amount, net_amount, total_amount
                ) VALUES (
                    p_company_id, v_item_id, 'SalesInvoice', v_invoice.godown_id, v_quantity, v_invoice.invoice_date, p_invoice_id, 'SalesInvoice',
                    v_cost_at_sale, v_quantity * v_rate, (v_quantity * v_rate) - v_line_total, v_line_total, v_line_total
                );
            END IF;
        END IF;
    END LOOP;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, v_invoice.invoice_date::DATE, 
        COALESCE(v_invoice.notes, 'Sales Invoice ' || v_invoice.invoice_number),
        'SalesInvoice', p_invoice_id, 'SalesInvoice', v_invoice.invoice_number, v_final_gl_lines
    );

    UPDATE "SalesInvoice" SET status = 'Posted', idempotency_key = p_idempotency_key WHERE id = p_invoice_id;
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;


-- 4. Modify rpc_post_pos_sale (Single Source of Truth)
CREATE OR REPLACE FUNCTION rpc_post_pos_sale(
    p_payload JSONB,
    p_idempotency_key UUID,
    p_gl_settings JSONB
) RETURNS JSONB AS $$
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
    v_cost_at_sale NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_tax_amount NUMERIC;
    v_tax_acc UUID;
    v_lines JSONB;
BEGIN
    SELECT * INTO v_existing FROM "POSSale" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'POS Sale already posted');
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_pos_id := (p_payload->>'id')::UUID;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := COALESCE((v_line->>'quantity')::NUMERIC, 0);
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
        IF v_cash_bank_acc IS NULL THEN
            RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Accounts Receivable or Cash/Bank account mapping.';
        END IF;
        
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_cash_bank_acc,
            'debit_amount', v_grand_total,
            'credit_amount', 0,
            'description', 'POS Sale ' || COALESCE(p_payload->>'sale_number', ''),
            'entity_type', 'Customer',
            'entity_id', (p_payload->>'customer_id')::UUID
        );
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := COALESCE((v_line->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_line->>'rate')::NUMERIC, 0);
        v_line_total := COALESCE((v_line->>'total')::NUMERIC, v_qty * v_rate);
        
        v_rev_acc := COALESCE(
            (v_line->>'income_account_id')::UUID,
            resolve_item_gl_account_rpc(v_company_id, v_item_id, 'sales'),
            (p_gl_settings->>'gl_default_sales_account_id')::UUID
        );
        IF v_rev_acc IS NULL THEN
            RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Revenue account for item %', v_item_id;
        END IF;
        
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_rev_acc,
            'debit_amount', 0,
            'credit_amount', v_line_total,
            'description', 'Revenue: ' || COALESCE(v_line->>'item_name', 'Item')
        );

        SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0)
        INTO v_is_physical, v_cost_at_sale
        FROM "Item"
        WHERE id = v_item_id;

        IF v_is_physical AND v_cost_at_sale > 0 AND v_qty > 0 THEN
            v_cogs_acc := COALESCE(
                (v_line->>'cogs_account_id')::UUID,
                resolve_item_gl_account_rpc(v_company_id, v_item_id, 'cogs'),
                (p_gl_settings->>'gl_default_cogs_account_id')::UUID
            );
            v_inv_acc := COALESCE(
                (v_line->>'asset_account_id')::UUID,
                resolve_item_gl_account_rpc(v_company_id, v_item_id, 'inventory'),
                (p_gl_settings->>'gl_default_inventory_account_id')::UUID
            );

            IF v_cogs_acc IS NULL OR v_inv_acc IS NULL THEN
                RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing COGS or Inventory account mapping for item %', v_item_id;
            END IF;

            v_lines := v_lines || jsonb_build_object(
                'account_id', v_cogs_acc,
                'debit_amount', v_qty * v_cost_at_sale,
                'credit_amount', 0,
                'description', 'COGS for POS Sale: ' || COALESCE(v_line->>'item_name', 'Item')
            );
            v_lines := v_lines || jsonb_build_object(
                'account_id', v_inv_acc,
                'debit_amount', 0,
                'credit_amount', v_qty * v_cost_at_sale,
                'description', 'Inventory Out: ' || COALESCE(v_line->>'item_name', 'Item')
            );
        END IF;

        IF v_is_physical AND v_qty > 0 THEN
            INSERT INTO "InventoryHistory" (
                item_id, company_id, transaction_date, reference_id, reference_type, reference_no,
                quantity_change, unit_cost, notes
            ) VALUES (
                v_item_id, v_company_id, COALESCE((p_payload->>'sale_date')::TIMESTAMP WITH TIME ZONE, NOW()), v_pos_id, 'POSSale', COALESCE(p_payload->>'sale_number', ''),
                -v_qty, COALESCE(v_cost_at_sale, v_rate), 'POS Sale Issue'
            );
            
            INSERT INTO "InventoryLedger" (
                company_id, item_id, transaction_type, quantity_out, transaction_date, reference_id, reference_type, 
                wac_at_post, gross_amount, discount_amount, net_amount, total_amount
            ) VALUES (
                v_company_id, v_item_id, 'POSSale', v_qty, COALESCE((p_payload->>'sale_date')::TIMESTAMP WITH TIME ZONE, NOW()), v_pos_id, 'POSSale',
                v_cost_at_sale, v_qty * v_rate, (v_qty * v_rate) - v_line_total, v_line_total, v_line_total
            );
        END IF;
    END LOOP;

    v_tax_amount := COALESCE((p_payload->>'total_tax_amount')::NUMERIC, 0);
    IF v_tax_amount > 0 THEN
        v_tax_acc := (p_gl_settings->>'gl_vat_payable_id')::UUID;
        IF v_tax_acc IS NULL THEN
            RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing VAT Payable account mapping.';
        END IF;
        
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_tax_acc,
            'debit_amount', 0,
            'credit_amount', v_tax_amount,
            'description', 'VAT on POS Sale'
        );
    END IF;

    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id,
        (p_payload->>'sale_date')::DATE,
        'POS Sale ' || COALESCE(p_payload->>'sale_number', ''),
        'POS',
        v_pos_id,
        'POSSale',
        COALESCE(p_payload->>'sale_number', ''),
        v_lines
    );

    UPDATE "POSSale" 
    SET status = 'Completed', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = v_pos_id;

    RETURN jsonb_build_object('success', true, 'id', v_pos_id);
END;
$$ LANGUAGE plpgsql;


-- 5. Modify rpc_post_sales_return (Sales Return WAC Trap Fix with Blind Return Fallback)
CREATE OR REPLACE FUNCTION rpc_post_sales_return(
    p_payload JSONB,
    p_idempotency_key UUID,
    p_gl_settings JSONB
) RETURNS JSONB AS $$
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
    v_cost_at_sale NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_tax_amount NUMERIC;
    v_tax_acc UUID;
    v_lines JSONB;
    v_original_invoice_id UUID;
BEGIN
    SELECT * INTO v_existing FROM "SalesReturn" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'Return already posted');
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_return_id := (p_payload->>'id')::UUID;
    v_original_invoice_id := NULLIF(TRIM(p_payload->>'sales_invoice_id'), '')::UUID;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := COALESCE((v_line->>'quantity')::NUMERIC, 0);
        IF v_item_id IS NOT NULL AND v_qty > 0 THEN
            UPDATE "Item" 
            SET quantity_on_hand = quantity_on_hand + v_qty 
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
        IF v_cash_bank_acc IS NULL THEN
            RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Accounts Receivable or Cash/Bank account mapping.';
        END IF;
        
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_cash_bank_acc,
            'debit_amount', 0,
            'credit_amount', v_grand_total,
            'description', 'Sales Return ' || COALESCE(p_payload->>'return_number', ''),
            'entity_type', 'Customer',
            'entity_id', (p_payload->>'customer_id')::UUID
        );
    END IF;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := COALESCE((v_line->>'quantity')::NUMERIC, 0);
        v_rate := COALESCE((v_line->>'rate')::NUMERIC, 0);
        v_line_total := COALESCE((v_line->>'total')::NUMERIC, v_qty * v_rate);
        
        v_rev_acc := COALESCE(
            (v_line->>'income_account_id')::UUID,
            resolve_item_gl_account_rpc(v_company_id, v_item_id, 'sales'),
            (p_gl_settings->>'gl_default_sales_account_id')::UUID
        );
        IF v_rev_acc IS NULL THEN
            RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Revenue account for item %', v_item_id;
        END IF;
        
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_rev_acc,
            'debit_amount', v_line_total,
            'credit_amount', 0,
            'description', 'Sales Return: ' || COALESCE(v_line->>'item_name', 'Item')
        );

        SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id;

        IF v_is_physical AND v_qty > 0 THEN
            -- Attempt strict historical lookup first
            v_cost_at_sale := NULL;
            IF v_original_invoice_id IS NOT NULL THEN
                SELECT wac_at_post INTO v_cost_at_sale
                FROM "InventoryLedger"
                WHERE reference_id = v_original_invoice_id 
                  AND item_id = v_item_id 
                  AND transaction_type = 'SalesInvoice'
                  AND ledger_status = 'Active'
                LIMIT 1;
            END IF;

            -- Fallback to current WAC (Blind Return)
            IF v_cost_at_sale IS NULL THEN
                SELECT COALESCE(weighted_average_cost, current_unit_cost, 0)
                INTO v_cost_at_sale
                FROM "Item"
                WHERE id = v_item_id;
            END IF;

            IF v_cost_at_sale > 0 THEN
                v_cogs_acc := COALESCE(
                    (v_line->>'cogs_account_id')::UUID,
                    resolve_item_gl_account_rpc(v_company_id, v_item_id, 'cogs'),
                    (p_gl_settings->>'gl_default_cogs_account_id')::UUID
                );
                v_inv_acc := COALESCE(
                    (v_line->>'asset_account_id')::UUID,
                    resolve_item_gl_account_rpc(v_company_id, v_item_id, 'inventory'),
                    (p_gl_settings->>'gl_default_inventory_account_id')::UUID
                );

                IF v_cogs_acc IS NULL OR v_inv_acc IS NULL THEN
                    RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing COGS or Inventory account mapping for item %', v_item_id;
                END IF;

                v_lines := v_lines || jsonb_build_object(
                    'account_id', v_inv_acc,
                    'debit_amount', v_qty * v_cost_at_sale,
                    'credit_amount', 0,
                    'description', 'Inventory Reverted: ' || COALESCE(v_line->>'item_name', 'Item')
                );
                v_lines := v_lines || jsonb_build_object(
                    'account_id', v_cogs_acc,
                    'debit_amount', 0,
                    'credit_amount', v_qty * v_cost_at_sale,
                    'description', 'COGS Reverted: ' || COALESCE(v_line->>'item_name', 'Item')
                );
            END IF;

            INSERT INTO "InventoryHistory" (
                item_id, company_id, transaction_date, reference_id, reference_type, reference_no,
                quantity_change, unit_cost, notes
            ) VALUES (
                v_item_id, v_company_id, COALESCE((p_payload->>'return_date')::TIMESTAMP WITH TIME ZONE, NOW()), v_return_id, 'SalesReturn', COALESCE(p_payload->>'return_number', ''),
                v_qty, COALESCE(v_cost_at_sale, v_rate), 'Sales Return Receipt'
            );
            
            INSERT INTO "InventoryLedger" (
                company_id, item_id, transaction_type, quantity_in, transaction_date, reference_id, reference_type, 
                wac_at_post, gross_amount, discount_amount, net_amount, total_amount
            ) VALUES (
                v_company_id, v_item_id, 'SalesReturn', v_qty, COALESCE((p_payload->>'return_date')::TIMESTAMP WITH TIME ZONE, NOW()), v_return_id, 'SalesReturn',
                v_cost_at_sale, v_qty * v_rate, (v_qty * v_rate) - v_line_total, v_line_total, v_line_total
            );
        END IF;
    END LOOP;

    v_tax_amount := COALESCE((p_payload->>'total_tax_amount')::NUMERIC, 0);
    IF v_tax_amount > 0 THEN
        v_tax_acc := (p_gl_settings->>'gl_vat_payable_id')::UUID;
        IF v_tax_acc IS NULL THEN
            RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing VAT Payable account mapping.';
        END IF;
        
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_tax_acc,
            'debit_amount', v_tax_amount,
            'credit_amount', 0,
            'description', 'VAT on Sales Return'
        );
    END IF;

    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id,
        (p_payload->>'return_date')::DATE,
        'Sales Return ' || COALESCE(p_payload->>'return_number', ''),
        'Sales',
        v_return_id,
        'SalesReturn',
        COALESCE(p_payload->>'return_number', ''),
        v_lines
    );

    UPDATE "SalesReturn" 
    SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = v_return_id;

    RETURN jsonb_build_object('success', true, 'id', v_return_id);
END;
$$ LANGUAGE plpgsql;

COMMIT;
