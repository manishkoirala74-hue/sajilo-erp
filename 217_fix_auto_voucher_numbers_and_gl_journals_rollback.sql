-- ============================================================================
-- 217_fix_auto_voucher_numbers_and_gl_journals_rollback.sql
-- Rollback for Migration 217
-- ============================================================================

BEGIN;

-- 1. Restore relaxed constraint on GeneralLedgerJournal
ALTER TABLE "GeneralLedgerJournal" DROP CONSTRAINT IF EXISTS chk_posted_voucher_no;
ALTER TABLE "GeneralLedgerJournal" 
ADD CONSTRAINT chk_posted_voucher_no 
CHECK (status != 'Posted' OR NULLIF(TRIM(voucher_no), '') IS NOT NULL);

-- 2. Drop triggers on SalesReturn and PurchaseReturn
DROP TRIGGER IF EXISTS trg_auto_num_sr ON "SalesReturn";
DROP FUNCTION IF EXISTS auto_generate_voucher_number_sr();

DROP TRIGGER IF EXISTS trg_auto_num_pr ON "PurchaseReturn";
DROP FUNCTION IF EXISTS auto_generate_voucher_number_pr();

-- 3. Restore rpc_checkout_sales_invoice (prior version from 0131)
CREATE OR REPLACE FUNCTION rpc_checkout_sales_invoice(p_payload JSONB, p_idempotency_key UUID, p_gl_lines JSONB)
RETURNS JSONB AS $BODY$
DECLARE
    v_invoice_id UUID;
    v_journal_id UUID;
    v_company_id UUID;
    v_invoice_date DATE;
    v_invoice_number VARCHAR;
    v_notes VARCHAR;
    v_is_from_challan BOOLEAN := COALESCE((p_payload->>'is_from_challan')::BOOLEAN, FALSE); 
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public."TransactionLocks" (idempotency_key) VALUES (p_idempotency_key);
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_invoice_date := (p_payload->>'invoice_date')::DATE;
    v_invoice_number := p_payload->>'invoice_number';
    v_notes := COALESCE(p_payload->>'notes', 'Sales Invoice ' || v_invoice_number);

    v_invoice_id := rpc_internal_save_sales_invoice(p_payload);
    
    IF NOT v_is_from_challan THEN
        PERFORM rpc_internal_deduct_stock(v_company_id, v_invoice_id);
    END IF;

    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id, v_invoice_date, v_notes,
        'Sales', v_invoice_id, 'SalesInvoice', v_invoice_number, p_gl_lines
    );

    RETURN jsonb_build_object('status', 'success', 'invoice_id', v_invoice_id, 'journal_id', v_journal_id);
EXCEPTION 
    WHEN unique_violation THEN
        IF SQLERRM LIKE '%TransactionLocks%' THEN
            RAISE EXCEPTION 'ERR_IDEMPOTENCY: This transaction has already been processed.';
        ELSE
            RAISE EXCEPTION 'ERR_DUPLICATE_DOC: This document number is already in use. Please enter a new number.';
        END IF;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.rpc_checkout_sales_invoice(JSONB, UUID, JSONB) TO authenticated;

-- 4. Restore rpc_checkout_purchase_invoice (prior version from 0131)
CREATE OR REPLACE FUNCTION rpc_checkout_purchase_invoice(p_payload JSONB, p_idempotency_key UUID, p_gl_lines JSONB)
RETURNS JSONB AS $BODY$
DECLARE
    v_invoice_id UUID;
    v_journal_id UUID;
    v_company_id UUID;
    v_invoice_date DATE;
    v_invoice_number VARCHAR;
    v_notes VARCHAR;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public."TransactionLocks" (idempotency_key) VALUES (p_idempotency_key);
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_invoice_date := (p_payload->>'invoice_date')::DATE;
    v_invoice_number := p_payload->>'invoice_number';
    v_notes := COALESCE(p_payload->>'notes', 'Purchase Invoice ' || v_invoice_number);

    v_invoice_id := rpc_internal_save_purchase_invoice(p_payload);
    PERFORM rpc_internal_add_stock(v_company_id, v_invoice_id);
    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id, v_invoice_date, v_notes,
        'Purchases', v_invoice_id, 'PurchaseInvoice', v_invoice_number, p_gl_lines
    );

    RETURN jsonb_build_object('status', 'success', 'invoice_id', v_invoice_id, 'journal_id', v_journal_id);
EXCEPTION 
    WHEN unique_violation THEN
        IF SQLERRM LIKE '%TransactionLocks%' THEN
            RAISE EXCEPTION 'ERR_IDEMPOTENCY: This transaction has already been processed.';
        ELSE
            RAISE EXCEPTION 'ERR_DUPLICATE_DOC: This document number is already in use. Please enter a new number.';
        END IF;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.rpc_checkout_purchase_invoice(JSONB, UUID, JSONB) TO authenticated;

COMMIT;
