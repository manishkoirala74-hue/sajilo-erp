-- ============================================================================
-- MIGRATION: hotfix_v21_fix_secondary_posting.sql
-- PURPOSE: Fix signature mismatch for secondary postings, restore stock updates,
--          and ensure InventoryHistory tracking is fully operational on postings.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. Enforce is_physical generated column on Item if missing
-- ============================================================================
ALTER TABLE "Item" ADD COLUMN IF NOT EXISTS "is_physical" BOOLEAN GENERATED ALWAYS AS (item_type != 'Service') STORED;

-- ============================================================================
-- 0B. Create InventoryHistory Table and Indexes if missing
-- ============================================================================
CREATE TABLE IF NOT EXISTS "InventoryHistory" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL,
    item_id UUID NOT NULL REFERENCES "Item"(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    reference_id UUID,
    reference_type TEXT NOT NULL,
    reference_no TEXT,
    quantity_change NUMERIC NOT NULL,
    unit_cost NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE "InventoryHistory" ENABLE ROW LEVEL SECURITY;

-- Drop policies if exists
DROP POLICY IF EXISTS "select_InventoryHistory" ON "InventoryHistory";
DROP POLICY IF EXISTS "insert_InventoryHistory" ON "InventoryHistory";
DROP POLICY IF EXISTS "update_InventoryHistory" ON "InventoryHistory";
DROP POLICY IF EXISTS "delete_InventoryHistory" ON "InventoryHistory";

-- Create RLS policies
CREATE POLICY "select_InventoryHistory" ON "InventoryHistory" FOR SELECT USING (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);
CREATE POLICY "insert_InventoryHistory" ON "InventoryHistory" FOR INSERT WITH CHECK (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);
CREATE POLICY "update_InventoryHistory" ON "InventoryHistory" FOR UPDATE USING (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
) WITH CHECK (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);
CREATE POLICY "delete_InventoryHistory" ON "InventoryHistory" FOR DELETE USING (
  (EXISTS (SELECT 1 FROM "User" WHERE id = auth.uid() AND role = 'admin')) OR 
  (company_id IN (SELECT (company_id)::uuid FROM "UserCompany" WHERE (user_id)::uuid = auth.uid()))
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_inventory_history_item_date ON "InventoryHistory"(item_id, transaction_date DESC);

-- ============================================================================
-- 0B. Restore correct schema-compliant rpc_commit_journal_entry_internal
-- ============================================================================
DROP FUNCTION IF EXISTS rpc_commit_journal_entry_internal(UUID, DATE, TEXT, TEXT, UUID, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS rpc_commit_journal_entry_internal(UUID, TIMESTAMP WITH TIME ZONE, TEXT, TEXT, UUID, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS rpc_commit_journal_entry_internal(UUID, DATE, JSONB, TEXT, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS rpc_commit_journal_entry_internal(UUID, TIMESTAMP WITH TIME ZONE, JSONB, TEXT, TEXT, TEXT, UUID, TEXT);



CREATE OR REPLACE FUNCTION rpc_commit_journal_entry_internal(
    p_company_id UUID,
    p_date DATE,
    p_description TEXT,
    p_module TEXT,
    p_source_id UUID,
    p_source_type TEXT,
    p_voucher_no TEXT,
    p_lines JSONB
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_line JSONB;
BEGIN
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_total_debit := v_total_debit + COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_total_credit := v_total_credit + COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
    END LOOP;

    IF v_total_debit = 0 AND v_total_credit = 0 THEN
        RETURN NULL; 
    END IF;

    IF ABS(v_total_debit - v_total_credit) > 0.001 THEN
        RAISE EXCEPTION 'ERR_UNBALANCED_JOURNAL: Total Debit (%) does not equal Total Credit (%)', v_total_debit, v_total_credit;
    END IF;

    -- Corrected Schema Columns: description, voucher_no, total_debit, total_credit, is_balanced
    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced, voucher_no
    ) VALUES (
        p_company_id, p_date, p_description, p_module, 
        p_source_id, p_source_type, 'Posted', v_total_debit, v_total_credit, true, p_voucher_no
    ) RETURNING id INTO v_journal_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        IF COALESCE((v_line->>'debit_amount')::NUMERIC, 0) > 0 OR COALESCE((v_line->>'credit_amount')::NUMERIC, 0) > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                company_id, journal_id, account_id, description, debit_amount, credit_amount, entity_type, entity_id, due_date
            ) VALUES (
                p_company_id,
                v_journal_id,
                NULLIF(TRIM(v_line->>'account_id'), '')::UUID,
                v_line->>'description',
                COALESCE((v_line->>'debit_amount')::NUMERIC, 0),
                COALESCE((v_line->>'credit_amount')::NUMERIC, 0),
                v_line->>'entity_type',
                NULLIF(TRIM(v_line->>'entity_id'), '')::UUID,
                (v_line->>'due_date')::DATE
            );
        END IF;
    END LOOP;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. Core Sales Invoice Posting (Corrected stock reversion & InventoryHistory)
-- ============================================================================
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
    v_cost_at_sale NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_final_gl_lines JSONB := '[]'::JSONB;
    v_user_gl_line JSONB;
    v_is_physical BOOLEAN;
    v_existing RECORD;
BEGIN
    SELECT * INTO v_existing FROM "SalesInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN 
        -- Handled idempotency
        SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
        RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_invoice.gl_journal_id); 
    END IF;

    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    
    IF p_is_reversal THEN 
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
        
        -- Revert/Delete Inventory History
        DELETE FROM "InventoryHistory" WHERE reference_id = p_invoice_id AND reference_type = 'SalesInvoice';
        
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
    END IF;

    -- Load user lines (AR, VAT, Sales Revenue)
    FOR v_user_gl_line IN SELECT * FROM jsonb_array_elements(p_gl_lines) LOOP
        v_final_gl_lines := v_final_gl_lines || v_user_gl_line;
    END LOOP;

    -- Calculate COGS, subtract stock, and append COGS journal lines
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            -- Row-level concurrency lock on Item
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

                -- Update physical stock
                UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_quantity WHERE id = v_item_id;

                -- Insert Inventory History record
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


-- ============================================================================
-- 2. Core Purchase Invoice Posting (Corrected stock reversion & InventoryHistory)
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_post_purchase_invoice(
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
    v_is_physical BOOLEAN;
    v_existing RECORD;
BEGIN
    SELECT * INTO v_existing FROM "PurchaseInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN 
        SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE id = p_invoice_id;
        RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_invoice.gl_journal_id); 
    END IF;

    SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    
    IF p_is_reversal THEN 
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'PurchaseInvoice'); 
        
        -- Revert Stock
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
        
        -- Revert/Delete Inventory History
        DELETE FROM "InventoryHistory" WHERE reference_id = p_invoice_id AND reference_type = 'PurchaseInvoice';
        
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
    END IF;

    -- Add Stock and Insert Inventory History
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_invoice.line_items)
    LOOP
        v_item_id := NULLIF(TRIM(v_item->>'item_id'), '')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        
        IF v_item_id IS NOT NULL AND v_quantity > 0 THEN
            SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id FOR UPDATE;
            IF v_is_physical THEN
                -- Add stock
                UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_quantity WHERE id = v_item_id;

                -- Insert Inventory History
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


-- ============================================================================
-- 3. POS Sale RPC (Corrected parameters & InventoryHistory insert)
-- ============================================================================
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
    v_cost NUMERIC;
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

    -- Inventory Updates with Row-Level Lock
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

    -- Build lines array for Journal Entry
    v_lines := '[]'::JSONB;
    
    -- 1. Debit Cash/Bank/AR
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

    -- 2. Credit Sales Revenue & Tax, and COGS/Inventory
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        v_rate := (v_line->>'rate')::NUMERIC;
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
        INTO v_is_physical, v_cost
        FROM "Item"
        WHERE id = v_item_id;

        IF v_is_physical AND v_cost > 0 AND v_qty > 0 THEN
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
                'debit_amount', v_qty * v_cost,
                'credit_amount', 0,
                'description', 'COGS for POS Sale: ' || COALESCE(v_line->>'item_name', 'Item')
            );
            v_lines := v_lines || jsonb_build_object(
                'account_id', v_inv_acc,
                'debit_amount', 0,
                'credit_amount', v_qty * v_cost,
                'description', 'Inventory Out: ' || COALESCE(v_line->>'item_name', 'Item')
            );
        END IF;

        IF v_is_physical AND v_qty > 0 THEN
            INSERT INTO "InventoryHistory" (
                item_id, company_id, transaction_date, reference_id, reference_type, reference_no,
                quantity_change, unit_cost, notes
            ) VALUES (
                v_item_id, v_company_id, COALESCE((p_payload->>'sale_date')::TIMESTAMP WITH TIME ZONE, NOW()), v_pos_id, 'POSSale', COALESCE(p_payload->>'sale_number', ''),
                -v_qty, COALESCE(v_cost, v_rate), 'POS Sale Issue'
            );
        END IF;
    END LOOP;

    -- Tax Line
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

    -- Commit GL
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


-- ============================================================================
-- 4. Sales Return RPC (Corrected parameters & InventoryHistory insert)
-- ============================================================================
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
    v_cost NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_tax_amount NUMERIC;
    v_tax_acc UUID;
    v_lines JSONB;
BEGIN
    SELECT * INTO v_existing FROM "SalesReturn" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'Return already posted');
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_return_id := (p_payload->>'id')::UUID;

    -- Inventory Updates (Stock goes back UP)
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        IF v_item_id IS NOT NULL AND v_qty > 0 THEN
            UPDATE "Item" 
            SET quantity_on_hand = quantity_on_hand + v_qty 
            WHERE id = v_item_id AND item_type != 'Service';
        END IF;
    END LOOP;

    -- Build lines array for Journal Entry
    v_lines := '[]'::JSONB;
    
    -- 1. Credit Cash/Bank/AR
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

    -- 2. Debit Sales Revenue & Tax, and revert COGS/Inventory
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        v_rate := (v_line->>'rate')::NUMERIC;
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

        SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0)
        INTO v_is_physical, v_cost
        FROM "Item"
        WHERE id = v_item_id;

        IF v_is_physical AND v_cost > 0 AND v_qty > 0 THEN
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
                'debit_amount', v_qty * v_cost,
                'credit_amount', 0,
                'description', 'Inventory Reverted: ' || COALESCE(v_line->>'item_name', 'Item')
            );
            v_lines := v_lines || jsonb_build_object(
                'account_id', v_cogs_acc,
                'debit_amount', 0,
                'credit_amount', v_qty * v_cost,
                'description', 'COGS Reverted: ' || COALESCE(v_line->>'item_name', 'Item')
            );
        END IF;

        IF v_is_physical AND v_qty > 0 THEN
            INSERT INTO "InventoryHistory" (
                item_id, company_id, transaction_date, reference_id, reference_type, reference_no,
                quantity_change, unit_cost, notes
            ) VALUES (
                v_item_id, v_company_id, COALESCE((p_payload->>'return_date')::TIMESTAMP WITH TIME ZONE, NOW()), v_return_id, 'SalesReturn', COALESCE(p_payload->>'return_number', ''),
                v_qty, COALESCE(v_cost, v_rate), 'Sales Return Receipt'
            );
        END IF;
    END LOOP;

    -- Tax Line
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

    -- Post GL
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


-- ============================================================================
-- 5. Purchase Return RPC (Corrected parameters & InventoryHistory insert)
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_post_purchase_return(
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
    v_supplier_ap_acc UUID;
    v_grand_total NUMERIC;
    v_inv_acc UUID;
    v_is_physical BOOLEAN;
    v_tax_amount NUMERIC;
    v_tax_acc UUID;
    v_lines JSONB;
BEGIN
    SELECT * INTO v_existing FROM "PurchaseReturn" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'Return already posted');
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_return_id := (p_payload->>'id')::UUID;

    -- Inventory Updates (Stock goes DOWN because we return to vendor)
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

    -- Build lines array for Journal Entry
    v_lines := '[]'::JSONB;
    
    -- 1. Debit AP/Cash/Bank
    v_supplier_ap_acc := COALESCE(
        (p_payload->>'payable_account_id')::UUID,
        (p_gl_settings->>'gl_accounts_payable_id')::UUID,
        (p_gl_settings->>'gl_cash_account_id')::UUID
    );
    v_grand_total := COALESCE((p_payload->>'grand_total')::NUMERIC, (p_payload->>'total_amount')::NUMERIC, 0);
    
    IF v_grand_total > 0 THEN
        IF v_supplier_ap_acc IS NULL THEN
            RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Accounts Payable or Cash/Bank account mapping.';
        END IF;
        
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_supplier_ap_acc,
            'debit_amount', v_grand_total,
            'credit_amount', 0,
            'description', 'Purchase Return ' || COALESCE(p_payload->>'return_number', ''),
            'entity_type', 'Supplier',
            'entity_id', COALESCE((p_payload->>'vendor_id')::UUID, (p_payload->>'supplier_id')::UUID)
        );
    END IF;

    -- 2. Credit Inventory Asset & Tax
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        v_rate := (v_line->>'rate')::NUMERIC;
        v_line_total := COALESCE((v_line->>'total')::NUMERIC, v_qty * v_rate);
        
        v_inv_acc := COALESCE(
            (v_line->>'asset_account_id')::UUID,
            resolve_item_gl_account_rpc(v_company_id, v_item_id, 'inventory'),
            (p_gl_settings->>'gl_default_inventory_account_id')::UUID
        );
        IF v_inv_acc IS NULL THEN
            RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Inventory asset account for item %', v_item_id;
        END IF;

        SELECT is_physical INTO v_is_physical FROM "Item" WHERE id = v_item_id;

        v_lines := v_lines || jsonb_build_object(
            'account_id', v_inv_acc,
            'debit_amount', 0,
            'credit_amount', v_line_total,
            'description', 'Purchase Return: ' || COALESCE(v_line->>'item_name', 'Item')
        );

        IF v_is_physical AND v_qty > 0 THEN
            INSERT INTO "InventoryHistory" (
                item_id, company_id, transaction_date, reference_id, reference_type, reference_no,
                quantity_change, unit_cost, notes
            ) VALUES (
                v_item_id, v_company_id, COALESCE((p_payload->>'return_date')::TIMESTAMP WITH TIME ZONE, NOW()), v_return_id, 'PurchaseReturn', COALESCE(p_payload->>'return_number', ''),
                -v_qty, v_rate, 'Purchase Return Issue'
            );
        END IF;
    END LOOP;

    -- Tax Line
    v_tax_amount := COALESCE((p_payload->>'total_tax_amount')::NUMERIC, 0);
    IF v_tax_amount > 0 THEN
        v_tax_acc := (p_gl_settings->>'gl_vat_receivable_id')::UUID;
        IF v_tax_acc IS NULL THEN
            RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing VAT Receivable account mapping.';
        END IF;
        
        v_lines := v_lines || jsonb_build_object(
            'account_id', v_tax_acc,
            'debit_amount', 0,
            'credit_amount', v_tax_amount,
            'description', 'VAT on Purchase Return'
        );
    END IF;

    -- Post GL
    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id,
        (p_payload->>'return_date')::DATE,
        'Purchase Return ' || COALESCE(p_payload->>'return_number', ''),
        'Purchases',
        v_return_id,
        'PurchaseReturn',
        COALESCE(p_payload->>'return_number', ''),
        v_lines
    );

    UPDATE "PurchaseReturn" 
    SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = v_return_id;

    RETURN jsonb_build_object('success', true, 'id', v_return_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 6. Stock Adjustment RPC (Corrected parameters & InventoryHistory insert)
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_post_stock_adjustment(
    p_payload JSONB,
    p_idempotency_key UUID,
    p_gl_settings JSONB
) RETURNS JSONB AS $$
DECLARE
    v_adj_id UUID;
    v_company_id UUID;
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_qty NUMERIC;
    v_cost_impact NUMERIC;
    v_existing RECORD;
    v_inv_acc UUID;
    v_adj_acc UUID;
    v_is_physical BOOLEAN;
    v_cost NUMERIC;
    v_lines JSONB;
BEGIN
    SELECT * INTO v_existing FROM "StockAdjustment" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'Adjustment already posted');
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_adj_id := (p_payload->>'id')::UUID;

    -- Inventory Updates
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        IF v_item_id IS NOT NULL THEN
            UPDATE "Item" 
            SET quantity_on_hand = (v_line->>'adjusted_qty')::NUMERIC 
            WHERE id = v_item_id AND item_type != 'Service';
        END IF;
    END LOOP;

    -- Build lines array for Journal Entry
    v_lines := '[]'::JSONB;
    
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_payload->'line_items')
    LOOP
        v_item_id := (v_line->>'item_id')::UUID;
        v_qty := (v_line->>'quantity')::NUMERIC;
        v_cost_impact := (v_line->>'cost_impact')::NUMERIC;
        
        v_inv_acc := COALESCE(
            (v_line->>'asset_account_id')::UUID,
            resolve_item_gl_account_rpc(v_company_id, v_item_id, 'inventory'),
            (p_gl_settings->>'gl_default_inventory_account_id')::UUID
        );
        v_adj_acc := COALESCE(
            (v_line->>'cogs_account_id')::UUID,
            resolve_item_gl_account_rpc(v_company_id, v_item_id, 'cogs'),
            (p_gl_settings->>'gl_default_cogs_account_id')::UUID
        );

        IF v_inv_acc IS NULL OR v_adj_acc IS NULL THEN
            RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Missing Inventory or COGS account for stock adjustment.';
        END IF;

        SELECT is_physical, COALESCE(current_unit_cost, weighted_average_cost, 0)
        INTO v_is_physical, v_cost
        FROM "Item"
        WHERE id = v_item_id;

        IF v_cost_impact > 0 THEN
            v_lines := v_lines || jsonb_build_object(
                'account_id', v_inv_acc,
                'debit_amount', v_cost_impact,
                'credit_amount', 0,
                'description', 'Stock Adjustment Increase: ' || COALESCE(v_line->>'item_name', 'Item')
            );
            v_lines := v_lines || jsonb_build_object(
                'account_id', v_adj_acc,
                'debit_amount', 0,
                'credit_amount', v_cost_impact,
                'description', 'Stock Gain: ' || COALESCE(v_line->>'item_name', 'Item')
            );
        ELSIF v_cost_impact < 0 THEN
            v_lines := v_lines || jsonb_build_object(
                'account_id', v_adj_acc,
                'debit_amount', ABS(v_cost_impact),
                'credit_amount', 0,
                'description', 'Stock Adjustment Decrease: ' || COALESCE(v_line->>'item_name', 'Item')
            );
            v_lines := v_lines || jsonb_build_object(
                'account_id', v_inv_acc,
                'debit_amount', 0,
                'credit_amount', ABS(v_cost_impact),
                'description', 'Stock Loss: ' || COALESCE(v_line->>'item_name', 'Item')
            );
        END IF;

        IF v_is_physical AND v_qty != 0 THEN
            INSERT INTO "InventoryHistory" (
                item_id, company_id, transaction_date, reference_id, reference_type, reference_no,
                quantity_change, unit_cost, notes
            ) VALUES (
                v_item_id, v_company_id, COALESCE((p_payload->>'adjustment_date')::TIMESTAMP WITH TIME ZONE, NOW()), v_adj_id, 'StockAdjustment', COALESCE(p_payload->>'adjustment_number', ''),
                v_qty, COALESCE(v_cost, 0), 'Stock Adjustment'
            );
        END IF;
    END LOOP;

    -- Post GL
    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id,
        (p_payload->>'adjustment_date')::DATE,
        'Stock Adjustment ' || COALESCE(p_payload->>'adjustment_number', ''),
        'Inventory',
        v_adj_id,
        'StockAdjustment',
        COALESCE(p_payload->>'adjustment_number', ''),
        v_lines
    );

    -- Update record
    UPDATE "StockAdjustment" 
    SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = v_adj_id;

    RETURN jsonb_build_object('success', true, 'id', v_adj_id);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- 7. Payroll Run RPC (Corrected parameters)
-- ============================================================================
CREATE OR REPLACE FUNCTION rpc_post_payroll_run(
    p_payload JSONB,
    p_idempotency_key UUID,
    p_gl_settings JSONB
) RETURNS JSONB AS $$
DECLARE
    v_run_id UUID;
    v_company_id UUID;
    v_journal_id UUID;
    v_existing RECORD;
BEGIN
    SELECT * INTO v_existing FROM "PayrollRun" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'message', 'Payroll Run already posted');
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_run_id := (p_payload->>'id')::UUID;

    -- Post GL
    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id,
        NOW()::DATE,
        'Payroll Run ' || COALESCE(p_payload->>'run_reference', ''),
        'Payroll',
        v_run_id,
        'PayrollRun',
        COALESCE(p_payload->>'run_reference', ''),
        COALESCE(p_payload->'entries', '[]'::JSONB)
    );

    -- Update record
    UPDATE "PayrollRun" 
    SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = v_run_id;

    RETURN jsonb_build_object('success', true, 'id', v_run_id);
END;
$$ LANGUAGE plpgsql;

COMMIT;
