-- ============================================================================
-- Migration: 132_emi_and_due_date_history.sql (v3)
-- Description: Day 0 Zero-Click Sweep, Reversible Interest Micro-Journals,
--              Soft-Delete Auditing & Bounded Cascading Rescheduling
-- ============================================================================

BEGIN;

-- 1. Extend CompanySettings for Accrual Interest Accounts
ALTER TABLE public."CompanySettings"
  ADD COLUMN IF NOT EXISTS gl_unearned_emi_interest_id UUID REFERENCES public."ChartOfAccount"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS gl_emi_interest_income_id UUID REFERENCES public."ChartOfAccount"(id) ON DELETE RESTRICT;

-- 2. Extend SalesInvoice & PurchaseInvoice
ALTER TABLE public."SalesInvoice"
  ADD COLUMN IF NOT EXISTS original_due_date DATE,
  ADD COLUMN IF NOT EXISTS due_date_revision_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_due_date_modified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_installment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS down_payment_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS down_payment_account_id UUID REFERENCES public."ChartOfAccount"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS down_payment_cleared BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS installment_frequency TEXT DEFAULT 'Monthly' 
    CHECK (installment_frequency IN ('Weekly', 'Monthly', 'Quarterly', 'Custom')),
  ADD COLUMN IF NOT EXISTS installment_count INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_interest_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS installment_interest_rate NUMERIC(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS installment_interest_type TEXT DEFAULT 'ZeroInterest' 
    CHECK (installment_interest_type IN ('ZeroInterest', 'Flat', 'Reducing')),
  ADD COLUMN IF NOT EXISTS installment_status TEXT DEFAULT 'NotApplicable' 
    CHECK (installment_status IN ('NotApplicable', 'Active', 'Completed', 'Defaulted'));

ALTER TABLE public."PurchaseInvoice"
  ADD COLUMN IF NOT EXISTS original_due_date DATE,
  ADD COLUMN IF NOT EXISTS due_date_revision_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_due_date_modified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_installment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS installment_count INT DEFAULT 1;

-- Backfill original_due_date for single-bullet invoices
UPDATE public."SalesInvoice" 
SET original_due_date = due_date::DATE 
WHERE original_due_date IS NULL AND due_date IS NOT NULL;

UPDATE public."PurchaseInvoice" 
SET original_due_date = due_date::DATE 
WHERE original_due_date IS NULL AND due_date IS NOT NULL;

-- 3. Create InvoiceInstallment (Permitting Installment #0 + Soft Delete Governance)
CREATE TABLE IF NOT EXISTS public."InvoiceInstallment" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
    invoice_type TEXT NOT NULL CHECK (invoice_type IN ('SalesInvoice', 'PurchaseInvoice')),
    invoice_id UUID NOT NULL,
    invoice_number TEXT NOT NULL,
    partner_id UUID,
    partner_name TEXT NOT NULL,
    -- CHECK constraint allows 0 for Day 0 Down Payment
    installment_no INT NOT NULL CHECK (installment_no >= 0),
    is_down_payment BOOLEAN NOT NULL DEFAULT false,
    due_date DATE NOT NULL,
    original_due_date DATE NOT NULL,
    revision_count INT NOT NULL DEFAULT 0,
    principal_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (principal_amount >= 0),
    interest_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (interest_amount >= 0),
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
    status TEXT NOT NULL DEFAULT 'Pending' 
      CHECK (status IN ('Pending', 'Partial', 'Paid', 'Overdue', 'Rescheduled')),
    paid_date DATE,
    last_rescheduled_at TIMESTAMPTZ,
    notes TEXT,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public."User"(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_invoice_installment UNIQUE (company_id, invoice_type, invoice_id, installment_no)
);

CREATE INDEX IF NOT EXISTS idx_installment_company_status_due 
    ON public."InvoiceInstallment" (company_id, status, due_date ASC) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_installment_lookup 
    ON public."InvoiceInstallment" (company_id, invoice_id, installment_no ASC) WHERE is_deleted = false;

-- 4. Create InvoiceDueDateHistory (Audit Trail)
CREATE TABLE IF NOT EXISTS public."InvoiceDueDateHistory" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
    invoice_type TEXT NOT NULL CHECK (invoice_type IN ('SalesInvoice', 'PurchaseInvoice')),
    invoice_id UUID NOT NULL,
    invoice_number TEXT NOT NULL,
    installment_id UUID REFERENCES public."InvoiceInstallment"(id) ON DELETE SET NULL,
    installment_no INT,
    reschedule_scope TEXT NOT NULL 
      CHECK (reschedule_scope IN ('SINGLE_INSTALLMENT', 'CASCADING_SCHEDULE', 'ENTIRE_INVOICE')),
    partner_id UUID,
    partner_name TEXT DEFAULT 'Unknown Partner',
    previous_due_date DATE NOT NULL,
    new_due_date DATE NOT NULL,
    days_extended INT NOT NULL,
    reason_code TEXT NOT NULL,
    reason_notes TEXT NOT NULL,
    contact_person TEXT,
    contact_channel TEXT,
    changed_by UUID NOT NULL REFERENCES public."User"(id),
    changed_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure partner_name constraint does not crash if table already existed with NOT NULL
ALTER TABLE public."InvoiceDueDateHistory" ALTER COLUMN partner_name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_due_history_invoice 
    ON public."InvoiceDueDateHistory" (company_id, invoice_type, invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_due_history_installment 
    ON public."InvoiceDueDateHistory" (company_id, installment_id, created_at DESC);

-- 5. RLS Policies
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

-- 6. Permissions Catalog
INSERT INTO public."Permission" (key, module, resource, action, description, risk_level) VALUES
  ('sales_invoices.emi_manage', 'sales', 'installments', 'manage', 'Create and manage EMI installment sales plans', 'medium'),
  ('sales_invoices.reschedule_due_date', 'sales', 'due_date', 'modify', 'Reschedule invoice and installment due dates', 'medium'),
  ('reports.installment_due_view', 'reports', 'installment_due', 'view', 'View installment maturity schedules and overdue list', 'low'),
  ('reports.installment_collection_view', 'reports', 'installment_collection', 'view', 'View realized cash inflow collection reports', 'low')
ON CONFLICT (key) DO NOTHING;

-- 7. Controlled Rescheduling Engine (Bounded Cascading RPC)
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

-- 8. Waterfall Receipt Allocation with Bound Interest Micro-Journals
CREATE OR REPLACE FUNCTION public.rpc_allocate_installment_receipt(
    p_company_id UUID,
    p_invoice_id UUID,
    p_receipt_voucher_id UUID,     -- Explicit binding to parent FinancialVoucher
    p_receipt_amount NUMERIC(15,2),
    p_voucher_number TEXT,
    p_receipt_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_unallocated NUMERIC(15,2) := p_receipt_amount;
    v_allocated_this_slice NUMERIC(15,2);
    v_interest_realized_this_slice NUMERIC(15,2);
    v_total_interest_realized NUMERIC(15,2) := 0.00;
    v_invoice_total NUMERIC(15,2);
    v_invoice_paid NUMERIC(15,2);
    v_settings RECORD;
    v_inst RECORD;
    v_allocation_log JSONB := '[]'::jsonb;
    v_interest_journal_id UUID := NULL;
BEGIN
    SELECT grand_total, COALESCE(paid_amount, 0)
    INTO v_invoice_total, v_invoice_paid
    FROM public."SalesInvoice"
    WHERE id = p_invoice_id AND company_id = p_company_id
    FOR UPDATE;

    SELECT gl_unearned_emi_interest_id, gl_emi_interest_income_id
    INTO v_settings
    FROM public."CompanySettings"
    WHERE company_id = p_company_id
    LIMIT 1;

    -- Waterfall FIFO sweep: Installment #0 first, then #1..N
    FOR v_inst IN 
        SELECT id, installment_no, is_down_payment, total_amount, paid_amount, 
               interest_amount, (total_amount - paid_amount) AS balance
        FROM public."InvoiceInstallment"
        WHERE invoice_id = p_invoice_id AND company_id = p_company_id 
          AND status != 'Paid' AND is_deleted = false
        ORDER BY installment_no ASC
        FOR UPDATE
    LOOP
        EXIT WHEN v_unallocated <= 0;

        v_allocated_this_slice := LEAST(v_inst.balance, v_unallocated);

        -- Calculate proportional earned interest
        IF v_inst.interest_amount > 0 AND v_inst.total_amount > 0 THEN
            v_interest_realized_this_slice := ROUND(
                v_allocated_this_slice * (v_inst.interest_amount / v_inst.total_amount), 2
            );
            v_total_interest_realized := v_total_interest_realized + v_interest_realized_this_slice;
        END IF;

        UPDATE public."InvoiceInstallment"
        SET paid_amount = paid_amount + v_allocated_this_slice,
            status = CASE 
                WHEN (paid_amount + v_allocated_this_slice) >= total_amount THEN 'Paid'
                ELSE 'Partial'
            END,
            paid_date = p_receipt_date,
            updated_at = now()
        WHERE id = v_inst.id;

        v_unallocated := v_unallocated - v_allocated_this_slice;

        v_allocation_log := v_allocation_log || jsonb_build_object(
            'installment_no', v_inst.installment_no,
            'is_down_payment', v_inst.is_down_payment,
            'allocated_amount', v_allocated_this_slice,
            'cleared', (v_inst.balance = v_allocated_this_slice)
        );
    END LOOP;

    -- Update Invoice Header (Capped at grand_total to protect against negative receivables)
    UPDATE public."SalesInvoice"
    SET paid_amount = LEAST(v_invoice_total, v_invoice_paid + (p_receipt_amount - v_unallocated)),
        payment_status = CASE 
            WHEN (v_invoice_paid + (p_receipt_amount - v_unallocated)) >= v_invoice_total THEN 'Paid'
            ELSE 'Partial'
        END,
        installment_status = CASE 
            WHEN (v_invoice_paid + (p_receipt_amount - v_unallocated)) >= v_invoice_total THEN 'Completed'
            ELSE 'Active'
        END
    WHERE id = p_invoice_id;

    -- Post interest micro-journal BOUND TO p_receipt_voucher_id
    IF v_total_interest_realized > 0 AND v_settings.gl_unearned_emi_interest_id IS NOT NULL 
       AND v_settings.gl_emi_interest_income_id IS NOT NULL THEN
        DECLARE
            v_gl_lines JSONB := jsonb_build_array(
                jsonb_build_object(
                    'account_id', v_settings.gl_unearned_emi_interest_id,
                    'debit_amount', v_total_interest_realized,
                    'credit_amount', 0,
                    'description', 'Realization of EMI Financing Interest (Voucher ' || p_voucher_number || ')'
                ),
                jsonb_build_object(
                    'account_id', v_settings.gl_emi_interest_income_id,
                    'debit_amount', 0,
                    'credit_amount', v_total_interest_realized,
                    'description', 'Interest Income earned on EMI collection'
                )
            );
        BEGIN
            v_interest_journal_id := public.rpc_commit_journal_entry_internal(
                p_company_id, p_receipt_date, 
                'EMI Interest Realization: ' || p_voucher_number,
                'EMI_INTEREST',                  -- reference_module
                p_receipt_voucher_id,            -- BOUND source_document_id (Parent Voucher UUID)
                'FinancialVoucher',              -- source_document_type
                'JV-INT-' || p_voucher_number, 
                v_gl_lines
            );
        END;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'allocated_total', (p_receipt_amount - v_unallocated),
        'unallocated_advance', v_unallocated,
        'interest_realized', v_total_interest_realized,
        'interest_journal_id', v_interest_journal_id,
        'allocations', v_allocation_log
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_allocate_installment_receipt(UUID, UUID, UUID, NUMERIC, TEXT, DATE) TO authenticated;

-- 9. Receipt Reversal & Cheque-Bounce RPC (Restores Exact Ledger & Installment State)
CREATE OR REPLACE FUNCTION public.rpc_reverse_receipt_voucher(
    p_company_id UUID,
    p_voucher_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_voucher RECORD;
    v_interest_journal RECORD;
    v_alloc_array JSONB;
    v_elem JSONB;
    v_rev_lines JSONB;
BEGIN
    SELECT * INTO v_voucher 
    FROM public."FinancialVoucher"
    WHERE id = p_voucher_id AND company_id = p_company_id
    FOR UPDATE;

    IF v_voucher IS NULL THEN RAISE EXCEPTION 'ERR_NOT_FOUND: Voucher not found.'; END IF;
    IF v_voucher.status = 'Cancelled' THEN RAISE EXCEPTION 'ERR_ALREADY_VOID: Voucher is already cancelled.'; END IF;

    -- 1. Un-allocate installment slices if bill_allocations exists
    IF v_voucher.bill_allocations IS NOT NULL THEN
        v_alloc_array := CASE 
            WHEN jsonb_typeof(v_voucher.bill_allocations::jsonb) = 'array' THEN v_voucher.bill_allocations::jsonb 
            ELSE '[]'::jsonb 
        END;

        FOR v_elem IN SELECT * FROM jsonb_array_elements(v_alloc_array)
        LOOP
            IF (v_elem->>'installment_no') IS NOT NULL AND (v_elem->>'invoice_id') IS NOT NULL THEN
                UPDATE public."InvoiceInstallment"
                SET paid_amount = GREATEST(0.00, paid_amount - (v_elem->>'allocated_amount')::NUMERIC),
                    status = CASE 
                        WHEN (paid_amount - (v_elem->>'allocated_amount')::NUMERIC) <= 0.00 THEN 'Pending'
                        ELSE 'Partial'
                    END,
                    updated_at = now()
                WHERE invoice_id = (v_elem->>'invoice_id')::UUID
                  AND installment_no = (v_elem->>'installment_no')::INT
                  AND company_id = p_company_id;

                UPDATE public."SalesInvoice"
                SET paid_amount = GREATEST(0.00, paid_amount - (v_elem->>'allocated_amount')::NUMERIC),
                    payment_status = 'Partial',
                    installment_status = 'Active'
                WHERE id = (v_elem->>'invoice_id')::UUID;
            END IF;
        END LOOP;
    END IF;

    -- 2. Reverse any linked EMI Interest Micro-Journals
    FOR v_interest_journal IN
        SELECT id, voucher_no, total_debit, total_credit
        FROM public."GeneralLedgerJournal"
        WHERE source_document_id = p_voucher_id 
          AND reference_module = 'EMI_INTEREST' 
          AND status = 'Posted'
    LOOP
        -- Build contra reversal entry: Debit Revenue, Credit Liability
        SELECT jsonb_agg(
            jsonb_build_object(
                'account_id', l.account_id,
                'debit_amount', l.credit_amount,
                'credit_amount', l.debit_amount,
                'description', 'Reversal of EMI Interest: ' || p_reason
            )
        ) INTO v_rev_lines
        FROM public."GeneralLedgerLine" l
        WHERE l.journal_id = v_interest_journal.id;

        PERFORM public.rpc_commit_journal_entry_internal(
            p_company_id, CURRENT_DATE,
            'Reversal: ' || v_interest_journal.voucher_no || ' (' || p_reason || ')',
            'EMI_INTEREST_REVERSAL', p_voucher_id, 'FinancialVoucher',
            'REV-' || v_interest_journal.voucher_no, v_rev_lines
        );

        UPDATE public."GeneralLedgerJournal"
        SET status = 'Cancelled'
        WHERE id = v_interest_journal.id;
    END LOOP;

    -- 3. Mark Voucher as Cancelled
    UPDATE public."FinancialVoucher"
    SET status = 'Cancelled',
        narration = narration || ' [Cancelled: ' || p_reason || ']'
    WHERE id = p_voucher_id;

    RETURN jsonb_build_object('success', true, 'voucher_id', p_voucher_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reverse_receipt_voucher(UUID, UUID, TEXT) TO authenticated;

-- 10. Update rpc_internal_save_sales_invoice with EMI Column Persistence
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
        goods_subtotal, sundry_charges_total, total_tax_amount, grand_total, notes, line_items, company_id, godown_id,
        is_installment, down_payment_amount, down_payment_account_id, down_payment_cleared,
        installment_frequency, installment_count, total_interest_amount, installment_interest_rate,
        installment_interest_type, installment_status, original_due_date
    ) VALUES (
        v_invoice_id, p_payload->>'invoice_number', NULLIF(TRIM(p_payload->>'customer_id'), '')::UUID, p_payload->>'customer_name', NULLIF(TRIM(p_payload->>'sales_order_id'), '')::UUID,
        (p_payload->>'invoice_date')::TIMESTAMP WITH TIME ZONE, (p_payload->>'due_date')::TIMESTAMP WITH TIME ZONE, 'Posted', COALESCE(p_payload->>'payment_status', 'Unpaid'),
        (p_payload->>'goods_subtotal')::NUMERIC, (p_payload->>'sundry_charges_total')::NUMERIC, (p_payload->>'total_tax_amount')::NUMERIC, (p_payload->>'grand_total')::NUMERIC,
        p_payload->>'notes', p_payload->'line_items', NULLIF(TRIM(p_payload->>'company_id'), '')::UUID, NULLIF(TRIM(p_payload->>'godown_id'), '')::UUID,
        COALESCE((p_payload->>'is_installment')::BOOLEAN, false),
        COALESCE((p_payload->>'down_payment_amount')::NUMERIC, 0.00),
        NULLIF(TRIM(p_payload->>'down_payment_account_id'), '')::UUID,
        COALESCE((p_payload->>'down_payment_cleared')::BOOLEAN, false),
        COALESCE(p_payload->>'installment_frequency', 'Monthly'),
        COALESCE((p_payload->>'installment_count')::INT, 1),
        COALESCE((p_payload->>'total_interest_amount')::NUMERIC, 0.00),
        COALESCE((p_payload->>'installment_interest_rate')::NUMERIC, 0.00),
        COALESCE(p_payload->>'installment_interest_type', 'ZeroInterest'),
        COALESCE(p_payload->>'installment_status', 'NotApplicable'),
        COALESCE((p_payload->>'original_due_date')::DATE, (p_payload->>'due_date')::DATE)
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
        godown_id = EXCLUDED.godown_id,
        is_installment = EXCLUDED.is_installment,
        down_payment_amount = EXCLUDED.down_payment_amount,
        down_payment_account_id = EXCLUDED.down_payment_account_id,
        down_payment_cleared = EXCLUDED.down_payment_cleared,
        installment_frequency = EXCLUDED.installment_frequency,
        installment_count = EXCLUDED.installment_count,
        total_interest_amount = EXCLUDED.total_interest_amount,
        installment_interest_rate = EXCLUDED.installment_interest_rate,
        installment_interest_type = EXCLUDED.installment_interest_type,
        installment_status = EXCLUDED.installment_status,
        original_due_date = EXCLUDED.original_due_date
    RETURNING id INTO v_invoice_id;

    IF v_invoice_id IS NULL THEN
        RAISE EXCEPTION 'ERR_SILENT_FAIL: Failed to insert or update Sales Invoice.';
    END IF;

    RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.rpc_internal_save_sales_invoice(JSONB) TO authenticated;

-- 11. Update rpc_checkout_sales_invoice (Zero-Trust Penny Validation & Day 0 Clearance)
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

    -- Zero-Trust Backend Penny Validation for EMI Installment Sales
    IF v_is_installment AND (p_payload ? 'installments') AND jsonb_typeof(p_payload->'installments') = 'array' THEN
        SELECT SUM(COALESCE((elem->>'total_amount')::NUMERIC, 0)) INTO v_schedule_sum 
        FROM jsonb_array_elements(p_payload->'installments') elem;

        IF ABS(COALESCE(v_schedule_sum, 0) - v_grand_total) > 0.01 THEN
            RAISE EXCEPTION 'ERR_IMBALANCE: Installment schedule sum (%) does not match invoice grand total (%).', v_schedule_sum, v_grand_total;
        END IF;
    END IF;

    -- 1. Save Sales Invoice record (trigger will generate invoice_number if AUTO/NULL)
    v_invoice_id := rpc_internal_save_sales_invoice(p_payload);
    
    -- 2. CRITICAL: Refresh real generated invoice_number from table
    SELECT invoice_number INTO v_invoice_number FROM "SalesInvoice" WHERE id = v_invoice_id;
    IF v_invoice_number IS NULL OR v_invoice_number = 'AUTO' OR TRIM(v_invoice_number) = '' THEN
        v_invoice_number := get_next_voucher_number(v_company_id, 'SalesInvoice', v_invoice_date);
        UPDATE "SalesInvoice" SET invoice_number = v_invoice_number WHERE id = v_invoice_id;
    END IF;

    -- 2b. Insert Installment Schedule rows if EMI
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

        -- Day 0 Frictionless Down Payment Clearance
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

    -- 3. Construct clean notes/narration
    IF TRIM(COALESCE(p_payload->>'notes', '')) != '' AND (p_payload->>'notes') NOT ILIKE '%AUTO%' THEN
        v_notes := p_payload->>'notes';
    ELSE
        v_notes := 'Sales Invoice ' || v_invoice_number;
    END IF;

    -- 4. Inventory deduction
    IF NOT v_is_from_challan THEN
        PERFORM rpc_internal_deduct_stock(v_company_id, v_invoice_id);
    END IF;

    -- 5. Commit Journal entry with verified invoice_number
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
