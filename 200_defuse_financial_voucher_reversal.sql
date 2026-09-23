-- 200_defuse_financial_voucher_reversal.sql
-- Refactor RPCs to completely remove the destructive DELETE logic for reversals.

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
    
    -- DEPRECATED: The system now uses an Append-Only Ledger. 
    -- Hard deletions via p_is_reversal are considered technical debt and are fully disabled.
    -- Reversals must be executed by creating explicit contra-entries.
    IF p_is_reversal THEN 
        RAISE EXCEPTION 'Append-Only Ledger Violation: Legacy reversal deletes are disabled. Use contra-entries instead.';
    END IF;

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
    
    IF p_is_reversal THEN 
        RAISE EXCEPTION 'Append-Only Ledger Violation: Legacy reversal deletes are disabled. Use contra-entries instead.';
    END IF;

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
    
    IF p_is_reversal THEN 
        RAISE EXCEPTION 'Append-Only Ledger Violation: Legacy reversal deletes are disabled. Use contra-entries instead.';
    END IF;

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
