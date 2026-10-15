-- ============================================================================
-- MIGRATION: 137_unified_financial_voucher_cancellation.sql
-- PURPOSE: Atomic cancellation for FinancialVouchers in PostgreSQL, sequential invariance,
--          fiscal period locking guard, dual-key bill allocations, and schema-safe logging.
-- ============================================================================

BEGIN;

-- A. Drop existing function overloads to prevent "function is not unique" ambiguity error
DROP FUNCTION IF EXISTS public.rpc_cancel_document(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.rpc_cancel_document(UUID, TEXT, TEXT, UUID);

-- 1. Schema Expansion on "FinancialVoucher"
ALTER TABLE public."FinancialVoucher"
    ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- 2. Unified Atomic Cancellation RPC
CREATE OR REPLACE FUNCTION public.rpc_cancel_document(
    p_doc_id UUID, 
    p_doc_type TEXT, 
    p_reason TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_company_id UUID;
    v_voucher RECORD;
    v_journal RECORD;
    v_reversal_journal_id UUID := NULL;
    v_alloc RECORD;
    v_alloc_array JSONB;
    v_target_invoice_id UUID;
BEGIN
    -- Resolve User ID from Auth context if not explicitly passed
    v_user_id := COALESCE(p_user_id, auth.uid());

    -- ========================================================================
    -- BRANCH A: FINANCIAL VOUCHERS
    -- ========================================================================
    IF p_doc_type = 'FinancialVoucher' THEN
        -- 1. Row Lock to prevent concurrent cancellations
        SELECT * INTO v_voucher 
        FROM public."FinancialVoucher" 
        WHERE id = p_doc_id 
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ERR_NOT_FOUND: Financial Voucher not found.';
        END IF;

        IF v_voucher.status = 'Cancelled' OR v_voucher.is_reversed IS TRUE THEN
            RETURN jsonb_build_object('success', true, 'status', 'Already Cancelled', 'voucher_id', p_doc_id);
        END IF;

        IF v_voucher.status != 'Posted' THEN
            RAISE EXCEPTION 'ERR_INVALID_STATUS: Cannot cancel voucher in status % (must be Posted).', v_voucher.status;
        END IF;

        v_company_id := v_voucher.company_id;

        -- 2. Guard Against Closed / Locked Accounting Periods (Nepal Statutory Rule)
        IF EXISTS (
            SELECT 1 FROM public."FiscalYear"
            WHERE company_id = v_company_id 
              AND (is_locked = TRUE OR status = 'Closed')
              AND v_voucher.voucher_date::DATE BETWEEN start_date AND end_date
        ) THEN
            RAISE EXCEPTION 'ERR_PERIOD_LOCKED: Cannot cancel vouchers belonging to a locked or closed fiscal year.';
        END IF;

        -- 3. Update Voucher Status in-place (Voucher Number stays strictly invariant)
        UPDATE public."FinancialVoucher"
        SET 
            status = 'Cancelled',
            is_reversed = TRUE,
            cancelled_at = NOW(),
            cancelled_by = v_user_id,
            cancellation_reason = p_reason
        WHERE id = p_doc_id;

        -- 4. Locate & Reverse General Ledger Journal(s)
        FOR v_journal IN 
            SELECT id, company_id 
            FROM public."GeneralLedgerJournal" 
            WHERE source_document_id = p_doc_id 
              AND source_document_type = 'FinancialVoucher'
              AND status = 'Posted'
              AND (is_reversed IS NOT TRUE)
        LOOP
            v_reversal_journal_id := public.rpc_reverse_gl_journal(
                v_journal.company_id,
                v_journal.id,
                CURRENT_DATE,
                'Cancellation of Voucher ' || v_voucher.voucher_number || ': ' || p_reason
            );

            -- Synchronize GL Journal status directly on cancellation
            UPDATE public."GeneralLedgerJournal"
            SET status = 'Cancelled', is_reversed = TRUE
            WHERE id = v_journal.id;

            IF v_reversal_journal_id IS NOT NULL THEN
                UPDATE public."GeneralLedgerJournal"
                SET status = 'Cancelled', is_reversed = TRUE
                WHERE id = v_reversal_journal_id;
            END IF;
        END LOOP;

        -- 5. Rollback Bill Allocations (Dual-Key Support: invoice_id OR bill_id)
        IF v_voucher.bill_allocations IS NOT NULL THEN
            BEGIN
                v_alloc_array := v_voucher.bill_allocations::JSONB;
                IF jsonb_typeof(v_alloc_array) = 'array' THEN
                    FOR v_alloc IN SELECT * FROM jsonb_to_recordset(v_alloc_array) AS x(
                        invoice_id UUID, 
                        bill_id UUID, 
                        allocated_amount NUMERIC
                    )
                    LOOP
                        v_target_invoice_id := COALESCE(v_alloc.invoice_id, v_alloc.bill_id);
                        IF v_target_invoice_id IS NOT NULL AND COALESCE(v_alloc.allocated_amount, 0) > 0 THEN
                            IF v_voucher.voucher_type = 'Receipt' THEN
                                UPDATE public."SalesInvoice"
                                SET paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_alloc.allocated_amount),
                                    payment_status = CASE 
                                        WHEN GREATEST(0, COALESCE(paid_amount, 0) - v_alloc.allocated_amount) <= 0 THEN 'Unpaid'
                                        ELSE 'Partial Paid'
                                    END
                                WHERE id = v_target_invoice_id;
                            ELSIF v_voucher.voucher_type = 'Payment' THEN
                                UPDATE public."PurchaseInvoice"
                                SET paid_amount = GREATEST(0, COALESCE(paid_amount, 0) - v_alloc.allocated_amount),
                                    payment_status = CASE 
                                        WHEN GREATEST(0, COALESCE(paid_amount, 0) - v_alloc.allocated_amount) <= 0 THEN 'Unpaid'
                                        ELSE 'Partial Paid'
                                    END
                                WHERE id = v_target_invoice_id;
                            END IF;
                        END IF;
                    END LOOP;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'Allocation rollback skipped due to format anomaly: %', SQLERRM;
            END;
        END IF;

        -- 6. Safe Isolated Audit Logging (Never aborts primary transaction on schema drift)
        BEGIN
            INSERT INTO public."FinancialVoucherDeleteLog" (
                voucher_id, voucher_number, voucher_type, voucher_date, 
                total_amount, contact_name, action_type, performed_by, 
                reason, company_id, voucher_snapshot
            ) VALUES (
                v_voucher.id, v_voucher.voucher_number, v_voucher.voucher_type, v_voucher.voucher_date,
                v_voucher.total_amount, v_voucher.contact_name, 'Void', COALESCE(auth.jwt()->>'email', 'system'),
                p_reason, v_voucher.company_id, row_to_json(v_voucher)
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Audit logging to FinancialVoucherDeleteLog skipped: %', SQLERRM;
        END;

        RETURN jsonb_build_object(
            'success', true,
            'voucher_id', p_doc_id,
            'status', 'Cancelled',
            'reversal_journal_id', v_reversal_journal_id
        );

    -- ========================================================================
    -- BRANCH B: SALES INVOICE (Existing Logic Preserved)
    -- ========================================================================
    ELSIF p_doc_type = 'SalesInvoice' THEN
        UPDATE public."SalesInvoice" 
        SET status = 'Cancelled', cancellation_reason = p_reason, cancelled_date = CURRENT_TIMESTAMP
        WHERE id = p_doc_id;

        FOR v_journal IN 
            SELECT id, company_id FROM public."GeneralLedgerJournal" 
            WHERE source_document_id = p_doc_id AND source_document_type = p_doc_type
        LOOP
            PERFORM public.rpc_reverse_gl_journal(v_journal.company_id, v_journal.id, CURRENT_DATE, p_reason);
        END LOOP;

        INSERT INTO public."InventoryLedger" (
            company_id, item_id, transaction_type, godown_id, 
            quantity_in, quantity_out, transaction_date, reference_id, reference_type, 
            total_amount, description, voucher_no, wac_at_post
        )
        SELECT 
            company_id, item_id, transaction_type, godown_id, 
            quantity_out, quantity_in, CURRENT_TIMESTAMP, reference_id, reference_type, 
            total_amount, CONCAT('Cancelled: ', p_reason), CONCAT(voucher_no, '-REV'), wac_at_post
        FROM public."InventoryLedger"
        WHERE reference_id = p_doc_id AND reference_type = p_doc_type;

        RETURN jsonb_build_object('success', true, 'status', 'Cancelled');

    -- ========================================================================
    -- BRANCH C: PURCHASE INVOICE (Existing Logic Preserved)
    -- ========================================================================
    ELSIF p_doc_type = 'PurchaseInvoice' THEN
        UPDATE public."PurchaseInvoice" 
        SET status = 'Cancelled', cancellation_reason = p_reason, cancelled_date = CURRENT_TIMESTAMP
        WHERE id = p_doc_id;

        FOR v_journal IN 
            SELECT id, company_id FROM public."GeneralLedgerJournal" 
            WHERE source_document_id = p_doc_id AND source_document_type = p_doc_type
        LOOP
            PERFORM public.rpc_reverse_gl_journal(v_journal.company_id, v_journal.id, CURRENT_DATE, p_reason);
        END LOOP;

        INSERT INTO public."InventoryLedger" (
            company_id, item_id, transaction_type, godown_id, 
            quantity_in, quantity_out, transaction_date, reference_id, reference_type, 
            total_amount, description, voucher_no, wac_at_post
        )
        SELECT 
            company_id, item_id, transaction_type, godown_id, 
            quantity_out, quantity_in, CURRENT_TIMESTAMP, reference_id, reference_type, 
            total_amount, CONCAT('Cancelled: ', p_reason), CONCAT(voucher_no, '-REV'), wac_at_post
        FROM public."InventoryLedger"
        WHERE reference_id = p_doc_id AND reference_type = p_doc_type;

        RETURN jsonb_build_object('success', true, 'status', 'Cancelled');

    ELSE
        RAISE EXCEPTION 'ERR_INVALID_DOC_TYPE: Document type % is not supported for cancellation.', p_doc_type;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_cancel_document(UUID, TEXT, TEXT, UUID) TO authenticated, service_role;

COMMIT;
