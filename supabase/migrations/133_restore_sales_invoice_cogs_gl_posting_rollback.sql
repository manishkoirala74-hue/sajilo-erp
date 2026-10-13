-- ============================================================================
-- Migration Rollback: 133_restore_sales_invoice_cogs_gl_posting_rollback.sql
-- Restores rpc_checkout_sales_invoice to migration 132 state
-- ============================================================================

BEGIN;

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
    v_is_installment BOOLEAN := COALESCE((p_payload->>'is_installment')::BOOLEAN, FALSE);
    v_schedule_sum NUMERIC;
    v_grand_total NUMERIC;
    v_down_payment NUMERIC;
    v_down_account UUID;
    v_inst RECORD;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public."TransactionLocks" (idempotency_key) VALUES (p_idempotency_key);
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_invoice_date := (p_payload->>'invoice_date')::DATE;
    v_grand_total := (p_payload->>'grand_total')::NUMERIC;
    v_down_payment := COALESCE((p_payload->>'down_payment_amount')::NUMERIC, 0.00);
    v_down_account := NULLIF(TRIM(p_payload->>'down_payment_account_id'), '')::UUID;

    IF v_is_installment AND (p_payload ? 'installments') AND jsonb_typeof(p_payload->'installments') = 'array' THEN
        SELECT SUM(COALESCE((elem->>'total_amount')::NUMERIC, 0)) INTO v_schedule_sum 
        FROM jsonb_array_elements(p_payload->'installments') elem;

        IF ABS(COALESCE(v_schedule_sum, 0) - v_grand_total) > 0.01 THEN
            RAISE EXCEPTION 'ERR_IMBALANCE: Installment schedule sum (%) does not match invoice grand total (%).', v_schedule_sum, v_grand_total;
        END IF;
    END IF;

    v_invoice_id := rpc_internal_save_sales_invoice(p_payload);
    
    SELECT invoice_number INTO v_invoice_number FROM "SalesInvoice" WHERE id = v_invoice_id;
    IF v_invoice_number IS NULL OR v_invoice_number = 'AUTO' OR TRIM(v_invoice_number) = '' THEN
        v_invoice_number := get_next_voucher_number(v_company_id, 'SalesInvoice', v_invoice_date);
        UPDATE "SalesInvoice" SET invoice_number = v_invoice_number WHERE id = v_invoice_id;
    END IF;

    IF v_is_installment AND (p_payload ? 'installments') AND jsonb_typeof(p_payload->'installments') = 'array' THEN
        DELETE FROM public."InvoiceInstallment" WHERE invoice_id = v_invoice_id;

        FOR v_inst IN SELECT * FROM jsonb_to_recordset(p_payload->'installments') AS x(
            installment_no INT,
            is_down_payment BOOLEAN,
            due_date DATE,
            original_due_date DATE,
            principal_amount NUMERIC,
            interest_amount NUMERIC,
            total_amount NUMERIC,
            notes TEXT
        )
        LOOP
            INSERT INTO public."InvoiceInstallment" (
                company_id, invoice_type, invoice_id, invoice_number,
                partner_id, partner_name, installment_no, is_down_payment,
                due_date, original_due_date, principal_amount, interest_amount,
                total_amount, paid_amount, status, notes
            ) VALUES (
                v_company_id, 'SalesInvoice', v_invoice_id, v_invoice_number,
                NULLIF(TRIM(p_payload->>'customer_id'), '')::UUID, COALESCE(p_payload->>'customer_name', 'Customer'),
                v_inst.installment_no, COALESCE(v_inst.is_down_payment, (v_inst.installment_no = 0)),
                v_inst.due_date, COALESCE(v_inst.original_due_date, v_inst.due_date),
                COALESCE(v_inst.principal_amount, 0), COALESCE(v_inst.interest_amount, 0),
                COALESCE(v_inst.total_amount, 0), 0.00, 'Pending', v_inst.notes
            );
        END LOOP;

        IF v_down_payment > 0 AND v_down_account IS NOT NULL THEN
            UPDATE public."InvoiceInstallment"
            SET paid_amount = total_amount,
                paid_date = v_invoice_date,
                status = 'Paid',
                updated_at = now()
            WHERE invoice_id = v_invoice_id AND installment_no = 0;

            UPDATE public."SalesInvoice"
            SET down_payment_cleared = true,
                paid_amount = v_down_payment,
                payment_status = CASE WHEN v_down_payment >= v_grand_total THEN 'Paid' ELSE 'Partial' END,
                installment_status = 'Active'
            WHERE id = v_invoice_id;
        END IF;
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

COMMIT;
