-- =========================================================================================
-- HOTFIX V18: FIX GL REVERSALS RE-POSTING BUG
-- =========================================================================================
-- This script fixes a major bug in the posting engine where cancelling a document
-- (passing p_is_reversal = true) correctly deleted the old GL journals, but then
-- erroneously proceeded to post a brand new set of journals and forced the document
-- status back to 'Posted'. 

-- 1. Fix Financial Voucher Posting RPC
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
    
    IF p_is_reversal THEN 
        PERFORM rpc_delete_gl_journals(p_voucher_id, 'FinancialVoucher'); 
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
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

-- 2. Fix Sales Invoice Posting RPC
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
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'SalesInvoice'); 
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
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

-- 3. Fix Purchase Invoice Posting RPC
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
        PERFORM rpc_delete_gl_journals(p_invoice_id, 'PurchaseInvoice'); 
        RETURN jsonb_build_object('status', 'success', 'journal_id', NULL);
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

-- 4. Clean up any Journals for Invoices that are currently Cancelled
-- (Just in case there are other invoices stuck in this broken state)
DO $$
BEGIN
    PERFORM rpc_delete_gl_journals(id, 'PurchaseInvoice') FROM "PurchaseInvoice" WHERE status IN ('Cancelled', 'Rejected');
    PERFORM rpc_delete_gl_journals(id, 'SalesInvoice') FROM "SalesInvoice" WHERE status IN ('Cancelled', 'Rejected');
    PERFORM rpc_delete_gl_journals(id, 'FinancialVoucher') FROM "FinancialVoucher" WHERE status IN ('Cancelled', 'Rejected');
END;
$$ LANGUAGE plpgsql;
