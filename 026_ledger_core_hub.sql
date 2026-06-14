-- ========================================================================================
-- LEDGER CORE HUB & IDEMPOTENCY MIGRATION (UPDATED PATTERN)
-- ========================================================================================

-- 1. Schema Hardening
-- A. Add idempotency_key to transaction tables
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='SalesInvoice' AND column_name='idempotency_key') THEN
        ALTER TABLE "SalesInvoice" ADD COLUMN idempotency_key UUID UNIQUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='PurchaseInvoice' AND column_name='idempotency_key') THEN
        ALTER TABLE "PurchaseInvoice" ADD COLUMN idempotency_key UUID UNIQUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='FinancialVoucher' AND column_name='idempotency_key') THEN
        ALTER TABLE "FinancialVoucher" ADD COLUMN idempotency_key UUID UNIQUE;
    END IF;
END $$;

-- B. Harden GeneralLedgerLine
UPDATE "GeneralLedgerLine" l SET company_id = j.company_id FROM "GeneralLedgerJournal" j WHERE l.journal_id = j.id::text AND l.company_id IS NULL;
UPDATE "GeneralLedgerLine" SET debit_amount = 0 WHERE debit_amount IS NULL;
UPDATE "GeneralLedgerLine" SET credit_amount = 0 WHERE credit_amount IS NULL;
ALTER TABLE "GeneralLedgerLine" ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE "GeneralLedgerLine" ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE "GeneralLedgerLine" ALTER COLUMN debit_amount SET NOT NULL;
ALTER TABLE "GeneralLedgerLine" ALTER COLUMN credit_amount SET NOT NULL;

-- 2. Ledger Core Hub (rpc_commit_journal_entry_internal)
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
    v_dr NUMERIC;
    v_cr NUMERIC;
    v_entity_type TEXT;
    v_entity_id UUID;
    v_due_date DATE;
    v_account_id UUID;
BEGIN
    -- Pre-computation: Validate Math First
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_total_debit := v_total_debit + COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_total_credit := v_total_credit + COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
    END LOOP;

    -- Strict Mathematical Assertion
    IF ABS(v_total_debit - v_total_credit) >= 0.01 THEN
        RAISE EXCEPTION 'ERR_UNBALANCED_JOURNAL: Debits (%) do not equal Credits (%).', v_total_debit, v_total_credit;
    END IF;

    IF v_total_debit = 0 AND v_total_credit = 0 THEN
        RETURN NULL; 
    END IF;

    -- Create Journal Header
    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced, voucher_no
    ) VALUES (
        p_company_id, p_date, p_description, p_module, 
        p_source_id, p_source_type, 'Posted', v_total_debit, v_total_credit, true, p_voucher_no
    ) RETURNING id INTO v_journal_id;

    -- Insert Verified Lines
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_dr := COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_cr := COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
        v_entity_type := v_line->>'entity_type';
        
        BEGIN v_entity_id := (v_line->>'entity_id')::UUID; EXCEPTION WHEN OTHERS THEN v_entity_id := NULL; END;
        BEGIN v_due_date := (v_line->>'due_date')::DATE; EXCEPTION WHEN OTHERS THEN v_due_date := p_date; END;

        IF (v_line->>'account_id') IS NOT NULL THEN
            v_account_id := (v_line->>'account_id')::UUID;
        ELSIF (v_line->>'account_category') IS NOT NULL AND (v_line->>'item_id') IS NOT NULL THEN
            v_account_id := resolve_item_gl_account_rpc(p_company_id, (v_line->>'item_id')::UUID, (v_line->>'account_category'));
        ELSE
            RAISE EXCEPTION 'ERR_MISSING_ACCOUNT: Cannot post GL line without an account_id.';
        END IF;

        IF v_dr > 0 OR v_cr > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                journal_id, company_id, account_id, account_code, account_name, account_type,
                debit_amount, credit_amount, description, entity_type, entity_id, due_date
            ) VALUES (
                v_journal_id, p_company_id, v_account_id, 
                v_line->>'account_code', v_line->>'account_name', v_line->>'account_type',
                v_dr, v_cr, COALESCE(v_line->>'description', p_description),
                v_entity_type, v_entity_id, COALESCE(v_due_date, p_date)
            );
        END IF;
    END LOOP;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Spoke: rpc_post_sales_invoice
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
    v_item RECORD;
    v_cost_at_sale NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_final_gl_lines JSONB := '[]'::JSONB;
    v_user_gl_line JSONB;
BEGIN
    -- Idempotency Check
    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_invoice.id IS NOT NULL THEN
        RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_invoice.gl_journal_id);
    END IF;

    -- Fetch the invoice
    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
    IF v_invoice.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;

    -- If Reversal, delete old journals and revert inventory
    IF p_is_reversal THEN
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'SalesInvoice');
        
        -- Revert Inventory
        FOR v_item IN SELECT * FROM "InventoryHistory" WHERE reference_id = p_invoice_id AND reference_type = 'SalesInvoice' LOOP
            UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_item.quantity_change WHERE id = v_item.item_id;
        END LOOP;
        DELETE FROM "InventoryHistory" WHERE reference_id = p_invoice_id AND reference_type = 'SalesInvoice';
    END IF;

    -- Load incoming user GL lines (Revenue, AR/Cash, Tax)
    FOR v_user_gl_line IN SELECT * FROM jsonb_array_elements(p_gl_lines) LOOP
        v_final_gl_lines := v_final_gl_lines || v_user_gl_line;
    END LOOP;

    -- Process Line Items for COGS/Inventory
    FOR v_item IN 
        SELECT sil.*, i.is_physical, COALESCE(i.current_unit_cost, i.weighted_average_cost, 0) as current_cost
        FROM "SalesInvoiceLine" sil
        JOIN "Item" i ON sil.item_id = i.id
        WHERE sil.invoice_id = p_invoice_id
    LOOP
        IF v_item.is_physical THEN
            -- Row-level concurrency lock on Item
            SELECT COALESCE(current_unit_cost, weighted_average_cost, 0) 
            INTO v_cost_at_sale 
            FROM "Item" 
            WHERE id = v_item.item_id 
            FOR UPDATE;

            IF v_cost_at_sale > 0 THEN
                v_cogs_acc := resolve_item_gl_account_rpc(p_company_id, v_item.item_id, 'cogs');
                v_inv_acc := resolve_item_gl_account_rpc(p_company_id, v_item.item_id, 'inventory');
                
                IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL THEN
                    v_final_gl_lines := v_final_gl_lines || jsonb_build_object(
                        'account_id', v_cogs_acc, 'debit_amount', v_item.quantity * v_cost_at_sale, 'credit_amount', 0,
                        'description', 'COGS for ' || v_invoice.invoice_number
                    );
                    v_final_gl_lines := v_final_gl_lines || jsonb_build_object(
                        'account_id', v_inv_acc, 'debit_amount', 0, 'credit_amount', v_item.quantity * v_cost_at_sale,
                        'description', 'Inventory Out for ' || v_invoice.invoice_number
                    );
                END IF;
            END IF;

            -- Deduct Inventory History
            INSERT INTO "InventoryHistory" (
                item_id, company_id, transaction_date, reference_id, reference_type, reference_no,
                quantity_change, unit_cost, notes
            ) VALUES (
                v_item.item_id, p_company_id, v_invoice.invoice_date, p_invoice_id, 'SalesInvoice', v_invoice.invoice_number,
                -v_item.quantity, v_cost_at_sale, 'Sales Issue'
            );

            -- Update Item master stock
            UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_item.quantity WHERE id = v_item.item_id;
        END IF;
    END LOOP;

    -- Post to Ledger Core Hub
    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, v_invoice.invoice_date, 'Sales Invoice ' || v_invoice.invoice_number,
        'Sales', p_invoice_id, 'SalesInvoice', v_invoice.invoice_number, v_final_gl_lines
    );

    -- Promote Invoice to Posted
    UPDATE "SalesInvoice" 
    SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key 
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;

-- 4. Spoke: rpc_post_purchase_invoice
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
    v_item RECORD;
BEGIN
    SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_invoice.id IS NOT NULL THEN RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_invoice.gl_journal_id); END IF;

    SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE id = p_invoice_id;
    
    IF p_is_reversal THEN 
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'PurchaseInvoice'); 
        FOR v_item IN SELECT * FROM "InventoryHistory" WHERE reference_id = p_invoice_id AND reference_type = 'PurchaseInvoice' LOOP
            UPDATE "Item" SET quantity_on_hand = quantity_on_hand - v_item.quantity_change WHERE id = v_item.item_id;
        END LOOP;
        DELETE FROM "InventoryHistory" WHERE reference_id = p_invoice_id AND reference_type = 'PurchaseInvoice';
    END IF;

    FOR v_item IN 
        SELECT pil.*, i.is_physical 
        FROM "PurchaseInvoiceLine" pil
        JOIN "Item" i ON pil.item_id = i.id
        WHERE pil.invoice_id = p_invoice_id
    LOOP
        IF v_item.is_physical THEN
            INSERT INTO "InventoryHistory" (
                item_id, company_id, transaction_date, reference_id, reference_type, reference_no,
                quantity_change, unit_cost, notes
            ) VALUES (
                v_item.item_id, p_company_id, v_invoice.invoice_date, p_invoice_id, 'PurchaseInvoice', v_invoice.invoice_number,
                v_item.quantity, v_item.unit_price, 'Purchase Receipt'
            );
            UPDATE "Item" SET quantity_on_hand = quantity_on_hand + v_item.quantity WHERE id = v_item.item_id;
        END IF;
    END LOOP;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, v_invoice.invoice_date, 'Purchase Invoice ' || v_invoice.invoice_number,
        'Purchase', p_invoice_id, 'PurchaseInvoice', v_invoice.invoice_number, p_gl_lines
    );

    UPDATE "PurchaseInvoice" SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key WHERE id = p_invoice_id;
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;

-- 5. Spoke: rpc_post_financial_voucher
CREATE OR REPLACE FUNCTION rpc_post_financial_voucher(
    p_company_id UUID,
    p_voucher_id UUID,
    p_idempotency_key UUID,
    p_gl_lines JSONB,
    p_is_reversal BOOLEAN DEFAULT false
) RETURNS JSONB AS $$
DECLARE
    v_journal_id UUID;
    v_voucher RECORD;
BEGIN
    SELECT * INTO v_voucher FROM "FinancialVoucher" WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF v_voucher.id IS NOT NULL THEN RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_voucher.gl_journal_id); END IF;

    SELECT * INTO v_voucher FROM "FinancialVoucher" WHERE id = p_voucher_id;
    
    IF p_is_reversal THEN PERFORM rpc_delete_gl_journals(p_voucher_id, 'FinancialVoucher'); END IF;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, v_voucher.voucher_date, v_voucher.narration,
        'Vouchers', p_voucher_id, 'FinancialVoucher', v_voucher.voucher_number, p_gl_lines
    );

    UPDATE "FinancialVoucher" SET status = 'Posted', gl_journal_id = v_journal_id, idempotency_key = p_idempotency_key WHERE id = p_voucher_id;
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;
