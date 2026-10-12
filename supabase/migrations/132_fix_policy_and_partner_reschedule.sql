-- ============================================================================
-- Hotfix / Patch: Fix Reschedule Due Date partner_name and RLS Policies
-- ============================================================================

-- 1. Ensure partner_name is flexible and does not crash if null
ALTER TABLE IF EXISTS public."InvoiceDueDateHistory" 
    ALTER COLUMN partner_name DROP NOT NULL;

ALTER TABLE IF EXISTS public."InvoiceDueDateHistory" 
    ALTER COLUMN partner_name SET DEFAULT 'Unknown Partner';

-- 2. Safely recreate RLS policies without "already exists" errors
ALTER TABLE public."InvoiceInstallment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."InvoiceDueDateHistory" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "installment_select_policy" ON public."InvoiceInstallment";
CREATE POLICY "installment_select_policy" ON public."InvoiceInstallment"
    FOR SELECT TO authenticated
    USING (
      is_deleted = false AND
      EXISTS (
        SELECT 1 FROM public."UserCompany" uc 
        WHERE uc.company_id = "InvoiceInstallment".company_id 
          AND uc.user_id = auth.uid()
      )
    );

DROP POLICY IF EXISTS "due_history_select_policy" ON public."InvoiceDueDateHistory";
CREATE POLICY "due_history_select_policy" ON public."InvoiceDueDateHistory"
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public."UserCompany" uc 
        WHERE uc.company_id = "InvoiceDueDateHistory".company_id 
          AND uc.user_id = auth.uid()
      )
    );

-- 3. Replace rpc_reschedule_invoice_payment with complete partner logging
CREATE OR REPLACE FUNCTION public.rpc_reschedule_invoice_payment(
    p_company_id UUID,
    p_invoice_type TEXT,
    p_invoice_id UUID,
    p_installment_id UUID,          -- NULL if standard bullet invoice
    p_reschedule_scope TEXT,         -- 'SINGLE_INSTALLMENT', 'CASCADING_SCHEDULE', or 'ENTIRE_INVOICE'
    p_new_due_date DATE,
    p_reason_code TEXT,
    p_reason_notes TEXT,
    p_contact_person TEXT DEFAULT NULL,
    p_contact_channel TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_uuid UUID := auth.uid();
    v_user_name TEXT;
    v_inv_number TEXT;
    v_partner_id UUID;
    v_partner_name TEXT;
    v_prev_due_date DATE;
    v_target_installment_no INT;
    v_days_delta INT;
    v_history_id UUID;
    v_journal_id UUID;
BEGIN
    IF v_user_uuid IS NULL THEN
        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Authentication required.';
    END IF;

    SELECT full_name INTO v_user_name FROM public."User" WHERE id = v_user_uuid;

    IF TRIM(COALESCE(p_reason_notes, '')) = '' THEN
        RAISE EXCEPTION 'ERR_MANDATORY_REASON: Detailed justification notes are required for due date changes.';
    END IF;

    -- CASE 1: Standard / Bullet Invoice
    IF p_reschedule_scope = 'ENTIRE_INVOICE' OR p_installment_id IS NULL THEN
        IF p_invoice_type = 'SalesInvoice' THEN
            SELECT invoice_number, customer_id::UUID, customer_name, due_date::DATE
            INTO v_inv_number, v_partner_id, v_partner_name, v_prev_due_date
            FROM public."SalesInvoice" WHERE id = p_invoice_id AND company_id = p_company_id FOR UPDATE;
        ELSE
            SELECT invoice_number, vendor_id::UUID, vendor_name, due_date::DATE
            INTO v_inv_number, v_partner_id, v_partner_name, v_prev_due_date
            FROM public."PurchaseInvoice" WHERE id = p_invoice_id AND company_id = p_company_id FOR UPDATE;
        END IF;

        IF v_inv_number IS NULL THEN RAISE EXCEPTION 'ERR_NOT_FOUND: Invoice not found.'; END IF;
        IF v_prev_due_date = p_new_due_date THEN RAISE EXCEPTION 'ERR_NO_CHANGE: New date matches current date.'; END IF;

        v_days_delta := (p_new_due_date - v_prev_due_date);

        INSERT INTO public."InvoiceDueDateHistory" (
            company_id, invoice_type, invoice_id, invoice_number,
            partner_id, partner_name,
            reschedule_scope, previous_due_date, new_due_date, days_extended,
            reason_code, reason_notes, contact_person, contact_channel,
            changed_by, changed_by_name
        ) VALUES (
            p_company_id, p_invoice_type, p_invoice_id, v_inv_number,
            v_partner_id, COALESCE(v_partner_name, 'Unknown Partner'),
            'ENTIRE_INVOICE', v_prev_due_date, p_new_due_date, v_days_delta,
            p_reason_code, p_reason_notes, p_contact_person, p_contact_channel,
            v_user_uuid, COALESCE(v_user_name, 'Staff')
        ) RETURNING id INTO v_history_id;

        IF p_invoice_type = 'SalesInvoice' THEN
            UPDATE public."SalesInvoice"
            SET due_date = p_new_due_date,
                due_date_revision_count = due_date_revision_count + 1,
                last_due_date_modified_at = now()
            WHERE id = p_invoice_id;
        ELSE
            UPDATE public."PurchaseInvoice"
            SET due_date = p_new_due_date,
                due_date_revision_count = due_date_revision_count + 1,
                last_due_date_modified_at = now()
            WHERE id = p_invoice_id;
        END IF;

        -- Synchronize GeneralLedgerLine
        SELECT id INTO v_journal_id FROM public."GeneralLedgerJournal"
        WHERE source_document_id = p_invoice_id AND source_document_type = p_invoice_type LIMIT 1;
        IF v_journal_id IS NOT NULL THEN
            UPDATE public."GeneralLedgerLine" SET due_date = p_new_due_date WHERE journal_id = v_journal_id;
        END IF;

    -- CASE 2: Single Installment Extension
    ELSIF p_reschedule_scope = 'SINGLE_INSTALLMENT' THEN
        SELECT installment_no, due_date, invoice_number, partner_id, partner_name
        INTO v_target_installment_no, v_prev_due_date, v_inv_number, v_partner_id, v_partner_name
        FROM public."InvoiceInstallment" WHERE id = p_installment_id AND company_id = p_company_id FOR UPDATE;

        IF v_inv_number IS NULL THEN RAISE EXCEPTION 'ERR_NOT_FOUND: Installment slice not found.'; END IF;
        v_days_delta := (p_new_due_date - v_prev_due_date);

        IF v_partner_name IS NULL THEN
            IF p_invoice_type = 'SalesInvoice' THEN
                SELECT customer_id::UUID, customer_name INTO v_partner_id, v_partner_name
                FROM public."SalesInvoice" WHERE id = p_invoice_id;
            ELSE
                SELECT vendor_id::UUID, vendor_name INTO v_partner_id, v_partner_name
                FROM public."PurchaseInvoice" WHERE id = p_invoice_id;
            END IF;
        END IF;

        INSERT INTO public."InvoiceDueDateHistory" (
            company_id, invoice_type, invoice_id, invoice_number,
            installment_id, installment_no, reschedule_scope,
            partner_id, partner_name,
            previous_due_date, new_due_date, days_extended,
            reason_code, reason_notes, contact_person, contact_channel,
            changed_by, changed_by_name
        ) VALUES (
            p_company_id, p_invoice_type, p_invoice_id, v_inv_number,
            p_installment_id, v_target_installment_no, 'SINGLE_INSTALLMENT',
            v_partner_id, COALESCE(v_partner_name, 'Unknown Partner'),
            v_prev_due_date, p_new_due_date, v_days_delta,
            p_reason_code, p_reason_notes, p_contact_person, p_contact_channel,
            v_user_uuid, COALESCE(v_user_name, 'Staff')
        ) RETURNING id INTO v_history_id;

        UPDATE public."InvoiceInstallment"
        SET due_date = p_new_due_date,
            revision_count = revision_count + 1,
            last_rescheduled_at = now(),
            status = CASE 
                WHEN p_new_due_date < CURRENT_DATE AND paid_amount < total_amount THEN 'Overdue'
                ELSE 'Rescheduled'
            END
        WHERE id = p_installment_id;

    -- CASE 3: Bounded Cascading Schedule Shift
    ELSIF p_reschedule_scope = 'CASCADING_SCHEDULE' THEN
        SELECT installment_no, due_date, invoice_number, partner_id, partner_name
        INTO v_target_installment_no, v_prev_due_date, v_inv_number, v_partner_id, v_partner_name
        FROM public."InvoiceInstallment" WHERE id = p_installment_id AND company_id = p_company_id FOR UPDATE;

        IF v_inv_number IS NULL THEN RAISE EXCEPTION 'ERR_NOT_FOUND: Installment slice not found.'; END IF;
        v_days_delta := (p_new_due_date - v_prev_due_date);

        IF v_partner_name IS NULL THEN
            IF p_invoice_type = 'SalesInvoice' THEN
                SELECT customer_id::UUID, customer_name INTO v_partner_id, v_partner_name
                FROM public."SalesInvoice" WHERE id = p_invoice_id;
            ELSE
                SELECT vendor_id::UUID, vendor_name INTO v_partner_id, v_partner_name
                FROM public."PurchaseInvoice" WHERE id = p_invoice_id;
            END IF;
        END IF;

        INSERT INTO public."InvoiceDueDateHistory" (
            company_id, invoice_type, invoice_id, invoice_number,
            installment_id, installment_no, reschedule_scope,
            partner_id, partner_name,
            previous_due_date, new_due_date, days_extended,
            reason_code, reason_notes, contact_person, contact_channel,
            changed_by, changed_by_name
        ) VALUES (
            p_company_id, p_invoice_type, p_invoice_id, v_inv_number,
            p_installment_id, v_target_installment_no, 'CASCADING_SCHEDULE',
            v_partner_id, COALESCE(v_partner_name, 'Unknown Partner'),
            v_prev_due_date, p_new_due_date, v_days_delta,
            p_reason_code, p_reason_notes || ' (Cascading shift of ' || v_days_delta || ' days applied to remaining unpaid slices)',
            p_contact_person, p_contact_channel, v_user_uuid, COALESCE(v_user_name, 'Staff')
        ) RETURNING id INTO v_history_id;

        -- Strictly bounded: only shifts future slices that are NOT yet Paid
        UPDATE public."InvoiceInstallment"
        SET due_date = (due_date + (v_days_delta || ' days')::INTERVAL)::DATE,
            revision_count = revision_count + 1,
            last_rescheduled_at = now(),
            status = CASE 
                WHEN (due_date + (v_days_delta || ' days')::INTERVAL)::DATE < CURRENT_DATE 
                     AND paid_amount < total_amount THEN 'Overdue'
                ELSE 'Rescheduled'
            END
        WHERE invoice_id = p_invoice_id 
          AND company_id = p_company_id 
          AND installment_no >= v_target_installment_no 
          AND status NOT IN ('Paid');

        -- Update SalesInvoice header due_date to match latest maturity date
        UPDATE public."SalesInvoice"
        SET due_date = (SELECT MAX(due_date) FROM public."InvoiceInstallment" WHERE invoice_id = p_invoice_id AND is_deleted = false),
            due_date_revision_count = due_date_revision_count + 1,
            last_due_date_modified_at = now()
        WHERE id = p_invoice_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'history_id', v_history_id,
        'scope', p_reschedule_scope,
        'days_extended', v_days_delta
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reschedule_invoice_payment(UUID, TEXT, UUID, UUID, TEXT, DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;
