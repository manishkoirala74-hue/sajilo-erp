-- =========================================================================================
-- HOTFIX v13: RESTORE CORRECT POSTING ENGINE FUNCTIONS
-- =========================================================================================
-- This script safely restores the fully optimized posting functions that were overridden 
-- by the bottom section of the ledger_hardening_core_v8.sql file.

DROP FUNCTION IF EXISTS rpc_commit_journal_entry_internal(uuid, date, text, text, uuid, text, text, jsonb);

-- 1. Internal Journal Entry Function
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

    IF v_total_debit != v_total_credit THEN
        RAISE EXCEPTION 'ERR_UNBALANCED_JOURNAL: Debits (%) != Credits (%)', v_total_debit, v_total_credit;
    END IF;

    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced, voucher_no
    ) VALUES (
        p_company_id, p_date, p_description, p_module, 
        p_source_id, p_source_type, 'Posted', v_total_debit, v_total_credit, true, p_voucher_no
    ) RETURNING id INTO v_journal_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        INSERT INTO "GeneralLedgerLine" (
            journal_id, company_id, account_id, debit_amount, credit_amount, description, entity_id
        ) VALUES (
            v_journal_id, 
            p_company_id,
            NULLIF(TRIM(v_line->>'account_id'), '')::UUID,
            COALESCE((v_line->>'debit_amount')::NUMERIC, 0),
            COALESCE((v_line->>'credit_amount')::NUMERIC, 0),
            v_line->>'description',
            NULLIF(TRIM(v_line->>'entity_id'), '')::UUID
        );
    END LOOP;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Financial Voucher Posting
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
    SELECT * INTO v_voucher FROM "FinancialVoucher" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF v_voucher.id IS NOT NULL THEN RETURN jsonb_build_object('status', 'duplicate', 'journal_id', v_voucher.gl_journal_id); END IF;

    SELECT * INTO v_voucher FROM "FinancialVoucher" WHERE id = p_voucher_id;
    
    IF p_is_reversal THEN PERFORM rpc_delete_gl_journals(p_voucher_id, 'FinancialVoucher'); END IF;

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

-- 3. Sales Invoice Posting
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
BEGIN
    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF v_invoice.id IS NOT NULL THEN RETURN jsonb_build_object('status', 'duplicate', 'journal_id', NULL); END IF;

    SELECT * INTO v_invoice FROM "SalesInvoice" WHERE id = p_invoice_id;
    
    IF p_is_reversal THEN PERFORM rpc_delete_gl_journals(p_invoice_id, 'SalesInvoice'); END IF;

    v_journal_id := rpc_commit_journal_entry_internal(
        p_company_id, 
        v_invoice.invoice_date::DATE, 
        COALESCE(v_invoice.notes, 'Sales Invoice ' || v_invoice.invoice_number),
        'Sales', 
        p_invoice_id, 
        'SalesInvoice', 
        v_invoice.invoice_number, 
        p_gl_lines
    );

    UPDATE "SalesInvoice" SET status = 'Posted', idempotency_key = p_idempotency_key WHERE id = p_invoice_id;
    RETURN jsonb_build_object('status', 'success', 'journal_id', v_journal_id);
END;
$$ LANGUAGE plpgsql;

-- 4. Purchase Invoice Posting
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
BEGIN
    SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE idempotency_key::text = p_idempotency_key::text LIMIT 1;
    IF v_invoice.id IS NOT NULL THEN RETURN jsonb_build_object('status', 'duplicate', 'journal_id', NULL); END IF;

    SELECT * INTO v_invoice FROM "PurchaseInvoice" WHERE id = p_invoice_id;
    
    IF p_is_reversal THEN PERFORM rpc_delete_gl_journals(p_invoice_id, 'PurchaseInvoice'); END IF;

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
