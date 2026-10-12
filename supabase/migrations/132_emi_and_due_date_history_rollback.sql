-- ============================================================================
-- Migration Rollback: 132_emi_and_due_date_history_rollback.sql
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.rpc_reverse_receipt_voucher(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.rpc_allocate_installment_receipt(UUID, UUID, UUID, NUMERIC, TEXT, DATE);
DROP FUNCTION IF EXISTS public.rpc_reschedule_invoice_payment(UUID, TEXT, UUID, UUID, TEXT, DATE, TEXT, TEXT, TEXT, TEXT);

DROP TABLE IF EXISTS public."InvoiceDueDateHistory" CASCADE;
DROP TABLE IF EXISTS public."InvoiceInstallment" CASCADE;

ALTER TABLE public."SalesInvoice"
  DROP COLUMN IF EXISTS original_due_date,
  DROP COLUMN IF EXISTS due_date_revision_count,
  DROP COLUMN IF EXISTS last_due_date_modified_at,
  DROP COLUMN IF EXISTS is_installment,
  DROP COLUMN IF EXISTS down_payment_amount,
  DROP COLUMN IF EXISTS down_payment_account_id,
  DROP COLUMN IF EXISTS down_payment_cleared,
  DROP COLUMN IF EXISTS installment_frequency,
  DROP COLUMN IF EXISTS installment_count,
  DROP COLUMN IF EXISTS total_interest_amount,
  DROP COLUMN IF EXISTS installment_interest_rate,
  DROP COLUMN IF EXISTS installment_interest_type,
  DROP COLUMN IF EXISTS installment_status;

ALTER TABLE public."PurchaseInvoice"
  DROP COLUMN IF EXISTS original_due_date,
  DROP COLUMN IF EXISTS due_date_revision_count,
  DROP COLUMN IF EXISTS last_due_date_modified_at,
  DROP COLUMN IF EXISTS is_installment,
  DROP COLUMN IF EXISTS installment_count;

ALTER TABLE public."CompanySettings"
  DROP COLUMN IF EXISTS gl_unearned_emi_interest_id,
  DROP COLUMN IF EXISTS gl_emi_interest_income_id;

DELETE FROM public."Permission" WHERE key IN (
  'sales_invoices.emi_manage',
  'sales_invoices.reschedule_due_date',
  'reports.installment_due_view',
  'reports.installment_collection_view'
);

-- Restore prior version of rpc_internal_save_sales_invoice
CREATE OR REPLACE FUNCTION public.rpc_internal_save_sales_invoice(p_payload JSONB)
RETURNS UUID AS $$
DECLARE
    v_invoice_id UUID;
    v_existing_status VARCHAR;
BEGIN
    v_invoice_id := NULLIF(TRIM(p_payload->>'id'), '')::UUID;
    
    IF v_invoice_id IS NOT NULL THEN
        SELECT status INTO v_existing_status FROM "SalesInvoice" WHERE id = v_invoice_id;
        IF FOUND AND v_existing_status = 'Posted' THEN
            RAISE EXCEPTION 'ERR_ALREADY_POSTED: Invoice is already posted and cannot be modified.';
        END IF;
    ELSE
        v_invoice_id := gen_random_uuid();
    END IF;

    INSERT INTO "SalesInvoice" (
        id, invoice_number, customer_id, customer_name, sales_order_id, invoice_date, due_date, status, payment_status,
        goods_subtotal, sundry_charges_total, total_tax_amount, grand_total, notes, line_items, company_id, godown_id
    ) VALUES (
        v_invoice_id, p_payload->>'invoice_number', NULLIF(TRIM(p_payload->>'customer_id'), '')::UUID, p_payload->>'customer_name', NULLIF(TRIM(p_payload->>'sales_order_id'), '')::UUID,
        (p_payload->>'invoice_date')::TIMESTAMP WITH TIME ZONE, (p_payload->>'due_date')::TIMESTAMP WITH TIME ZONE, 'Posted', COALESCE(p_payload->>'payment_status', 'Unpaid'),
        (p_payload->>'goods_subtotal')::NUMERIC, (p_payload->>'sundry_charges_total')::NUMERIC, (p_payload->>'total_tax_amount')::NUMERIC, (p_payload->>'grand_total')::NUMERIC,
        p_payload->>'notes', p_payload->'line_items', NULLIF(TRIM(p_payload->>'company_id'), '')::UUID, NULLIF(TRIM(p_payload->>'godown_id'), '')::UUID
    )
    ON CONFLICT (id) DO UPDATE SET
        invoice_number = EXCLUDED.invoice_number,
        customer_id = EXCLUDED.customer_id,
        customer_name = EXCLUDED.customer_name,
        sales_order_id = EXCLUDED.sales_order_id,
        invoice_date = EXCLUDED.invoice_date,
        due_date = EXCLUDED.due_date,
        status = EXCLUDED.status,
        payment_status = EXCLUDED.payment_status,
        goods_subtotal = EXCLUDED.goods_subtotal,
        sundry_charges_total = EXCLUDED.sundry_charges_total,
        total_tax_amount = EXCLUDED.total_tax_amount,
        grand_total = EXCLUDED.grand_total,
        notes = EXCLUDED.notes,
        line_items = EXCLUDED.line_items,
        company_id = EXCLUDED.company_id,
        godown_id = EXCLUDED.godown_id
    RETURNING id INTO v_invoice_id;

    IF v_invoice_id IS NULL THEN
        RAISE EXCEPTION 'ERR_SILENT_FAIL: Failed to insert or update Sales Invoice.';
    END IF;

    RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.rpc_internal_save_sales_invoice(JSONB) TO authenticated;

-- Restore prior version of rpc_checkout_sales_invoice (from 131)
CREATE OR REPLACE FUNCTION public.rpc_checkout_sales_invoice(p_payload JSONB, p_idempotency_key UUID, p_gl_lines JSONB)
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

    v_invoice_id := rpc_internal_save_sales_invoice(p_payload);
    
    SELECT invoice_number INTO v_invoice_number FROM "SalesInvoice" WHERE id = v_invoice_id;
    IF v_invoice_number IS NULL OR v_invoice_number = 'AUTO' OR TRIM(v_invoice_number) = '' THEN
        v_invoice_number := get_next_voucher_number(v_company_id, 'SalesInvoice', v_invoice_date);
        UPDATE "SalesInvoice" SET invoice_number = v_invoice_number WHERE id = v_invoice_id;
    END IF;

    IF TRIM(COALESCE(p_payload->>'notes', '')) != '' AND (p_payload->>'notes') NOT ILIKE '%AUTO%' THEN
        v_notes := p_payload->>'notes';
    ELSE
        v_notes := 'Sales Invoice ' || v_invoice_number;
    END IF;

    IF NOT v_is_from_challan THEN
        PERFORM rpc_internal_deduct_stock(v_company_id, v_invoice_id);
    END IF;

    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id, v_invoice_date, v_notes,
        'Sales', v_invoice_id, 'SalesInvoice', v_invoice_number, p_gl_lines
    );

    RETURN jsonb_build_object(
        'status', 'success', 
        'invoice_id', v_invoice_id, 
        'invoice_number', v_invoice_number, 
        'journal_id', v_journal_id
    );
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

COMMIT;
