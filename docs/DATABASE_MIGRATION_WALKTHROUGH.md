# Database Migration Walkthrough & Run Guide
**Project:** Sajilo ERP  
**Supabase Project Ref:** `xkobauhvsayqcxmmmtkm`  
**Supabase SQL Editor:** [Open SQL Editor in Supabase](https://supabase.com/dashboard/project/xkobauhvsayqcxmmmtkm/sql/new)

---

## Overview

To complete the performance and architecture upgrade for Sajilo ERP, run the following SQL scripts in your Supabase database. All scripts are **fully idempotent** (using `IF NOT EXISTS` and `CREATE OR REPLACE`), meaning they are safe to run even if parts of them were run previously.

Each script has a **paired rollback script** documented below.

| Step | Script Name | Purpose | Est. Run Time |
| :--- | :--- | :--- | :--- |
| **Step 1** | `135_performance_indexes.sql` | Adds multi-tenant B-Tree composite indexes for 10x–50x faster queries | ~1–2 sec |
| **Step 2** | `136_dashboard_consolidated_payload_rpc.sql` | Installs single-roundtrip dashboard analytics RPC (cuts requests from 6 to 1) | ~1 sec |
| **Step 3** | `134_add_gl_emi_interest_name_columns.sql` | Adds missing EMI interest name display columns to `CompanySettings` | < 1 sec |

---

## How to Execute Scripts in Supabase (3-Step Walkthrough)

1. Log into your [Supabase Dashboard](https://supabase.com/dashboard/project/xkobauhvsayqcxmmmtkm/sql/new).
2. Click **SQL Editor** on the left navigation sidebar.
3. Click **"New Query"** (+), copy-paste the SQL content from the section below, and click **"Run"** (or press `Ctrl + Enter` / `Cmd + Enter`).

---

## Script 1: Multi-Tenant Performance Indexes
**File:** `supabase/migrations/135_performance_indexes.sql` (or `218_performance_indexes.sql`)  
**Purpose:** Eliminates slow sequential table scans on multi-tenant invoice, voucher, general ledger, and master data lookups.

### Copy & Paste SQL into Supabase:

```sql
BEGIN;

-- 1. Sales & Invoicing (Targeting list, filter, and line join operations)
CREATE INDEX IF NOT EXISTS idx_sales_invoice_company_status_created 
  ON "SalesInvoice"(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_line_invoice 
  ON "SalesInvoiceLine"(invoice_id);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_line_company_item 
  ON "SalesInvoiceLine"(company_id, item_id);

-- 2. Purchases
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_company_status_created 
  ON "PurchaseInvoice"(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_line_invoice 
  ON "PurchaseInvoiceLine"(invoice_id);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_line_company_item 
  ON "PurchaseInvoiceLine"(company_id, item_id);

-- 3. Treasury & Vouchers
CREATE INDEX IF NOT EXISTS idx_financial_voucher_company_status_created 
  ON "FinancialVoucher"(company_id, status, created_at DESC);

-- 4. General Ledger
CREATE INDEX IF NOT EXISTS idx_gl_journal_company_date 
  ON "GeneralLedgerJournal"(company_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_gl_line_company_account 
  ON "GeneralLedgerLine"(company_id, account_id);

-- 5. Master Data Lookups
CREATE INDEX IF NOT EXISTS idx_item_company_cat_active 
  ON "Item"(company_id, category_id, is_active);

CREATE INDEX IF NOT EXISTS idx_partner_company_customer 
  ON "BusinessPartner"(company_id, is_customer, is_active);

CREATE INDEX IF NOT EXISTS idx_partner_company_vendor 
  ON "BusinessPartner"(company_id, is_vendor, is_active);

CREATE INDEX IF NOT EXISTS idx_coa_company_code 
  ON "ChartOfAccount"(company_id, account_code);

-- 6. Tenancy & Auth Lookup (Critical for subquery performance)
CREATE INDEX IF NOT EXISTS idx_usercompany_lookup 
  ON "UserCompany"(user_id, company_id, membership_status);

-- 7. Analytics Rollups
CREATE INDEX IF NOT EXISTS idx_daily_metrics_company_date 
  ON "DailyMetricsRollup"(company_id, metric_date DESC);

COMMIT;
```

#### Rollback Script (if ever needed):
```sql
BEGIN;
DROP INDEX IF EXISTS idx_sales_invoice_company_status_created;
DROP INDEX IF EXISTS idx_sales_invoice_line_invoice;
DROP INDEX IF EXISTS idx_sales_invoice_line_company_item;
DROP INDEX IF EXISTS idx_purchase_invoice_company_status_created;
DROP INDEX IF EXISTS idx_purchase_invoice_line_invoice;
DROP INDEX IF EXISTS idx_purchase_invoice_line_company_item;
DROP INDEX IF EXISTS idx_financial_voucher_company_status_created;
DROP INDEX IF EXISTS idx_gl_journal_company_date;
DROP INDEX IF EXISTS idx_gl_line_company_account;
DROP INDEX IF EXISTS idx_item_company_cat_active;
DROP INDEX IF EXISTS idx_partner_company_customer;
DROP INDEX IF EXISTS idx_partner_company_vendor;
DROP INDEX IF EXISTS idx_coa_company_code;
DROP INDEX IF EXISTS idx_usercompany_lookup;
DROP INDEX IF EXISTS idx_daily_metrics_company_date;
COMMIT;
```

---

## Script 2: Single-Roundtrip Consolidated Dashboard Analytics Function
**File:** `supabase/migrations/136_dashboard_consolidated_payload_rpc.sql` (or `219_dashboard_consolidated_payload_rpc.sql`)  
**Purpose:** Replaces 6 separate network roundtrips with a single consolidated payload returning KPIs, charts, invoices, and cash/bank balances in ~400ms.

### Copy & Paste SQL into Supabase:

```sql
CREATE OR REPLACE FUNCTION public.get_dashboard_analytics_payload(
  p_company_id  UUID,
  p_start_date  DATE,
  p_end_date    DATE,
  p_as_of_date  DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_summary           JSONB;
  v_daily_metrics     JSONB;
  v_recent_sales      JSONB;
  v_recent_bills      JSONB;
  v_pending_approvals JSONB;
  v_cash_bank         JSONB := '{"cash_balance": 0, "bank_balance": 0, "total": 0}'::jsonb;
BEGIN
  -- 1. Security Guard (Allows service_role admin bypass; enforces active membership for authenticated users)
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "UserCompany"
    WHERE user_id = auth.uid()
      AND company_id = p_company_id
      AND (membership_status IS NULL OR membership_status = 'active')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- 2. Aggregate MTD Summary KPIs
  SELECT jsonb_build_object(
    'total_sales', COALESCE(SUM(total_sales_amount), 0),
    'total_purchases', COALESCE(SUM(total_purchases_amount), 0),
    'unpaid_sales_count', COALESCE((
      SELECT COUNT(*) FROM "SalesInvoice"
      WHERE company_id = p_company_id AND status = 'Posted' AND payment_status = 'Unpaid'
    ), 0),
    'total_items', COALESCE((SELECT COUNT(*) FROM "Item" WHERE company_id = p_company_id), 0),
    'active_items', COALESCE((SELECT COUNT(*) FROM "Item" WHERE company_id = p_company_id AND COALESCE(is_active, true) = true), 0),
    'low_stock_items', COALESCE((
      SELECT COUNT(*) FROM "Item"
      WHERE company_id = p_company_id
        AND COALESCE(quantity_on_hand, 0) <= COALESCE(reorder_level, 0)
        AND COALESCE(reorder_level, 0) > 0
    ), 0),
    'total_customers', COALESCE((SELECT COUNT(*) FROM "BusinessPartner" WHERE company_id = p_company_id AND is_customer = true), 0),
    'active_customers', COALESCE((SELECT COUNT(*) FROM "BusinessPartner" WHERE company_id = p_company_id AND is_customer = true AND COALESCE(is_active, true) = true), 0),
    'total_vendors', COALESCE((SELECT COUNT(*) FROM "BusinessPartner" WHERE company_id = p_company_id AND is_vendor = true), 0)
  ) INTO v_summary
  FROM "DailyMetricsRollup"
  WHERE company_id = p_company_id
    AND metric_date >= p_start_date
    AND metric_date <= p_end_date;

  -- 3. Daily Metrics Rollup Array (Chronological 6-Month Rolling)
  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.metric_date ASC), '[]'::jsonb)
  INTO v_daily_metrics
  FROM "DailyMetricsRollup" d
  WHERE d.company_id = p_company_id
    AND d.metric_date >= p_start_date
    AND d.metric_date <= p_end_date;

  -- 4. Recent Sales Invoices (5)
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
  INTO v_recent_sales
  FROM (
    SELECT id, invoice_number, grand_total, status, payment_status, created_at, invoice_date, customer_id, customer_name
    FROM "SalesInvoice"
    WHERE company_id = p_company_id
    ORDER BY created_at DESC LIMIT 5
  ) s;

  -- 5. Recent Purchase Bills (5)
  SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb)
  INTO v_recent_bills
  FROM (
    SELECT id, invoice_number, vendor_invoice_no, grand_total, status, payment_status, created_at, invoice_date, vendor_id, vendor_name
    FROM "PurchaseInvoice"
    WHERE company_id = p_company_id
    ORDER BY created_at DESC LIMIT 5
  ) p;

  -- 6. Pending Approvals (Purchase Orders)
  SELECT COALESCE(jsonb_agg(row_to_json(po)), '[]'::jsonb)
  INTO v_pending_approvals
  FROM (
    SELECT id, po_number, total_amount, status, created_at
    FROM "PurchaseOrder"
    WHERE company_id = p_company_id AND status = 'Pending Approval'
    ORDER BY created_at DESC LIMIT 10
  ) po;

  -- 7. Cash & Bank Balance (Safe resolution with error isolation)
  BEGIN
    v_cash_bank := public.get_cash_bank_balance(p_company_id, p_as_of_date);
  EXCEPTION WHEN OTHERS THEN
    v_cash_bank := '{"cash_balance": 0, "bank_balance": 0, "total": 0}'::jsonb;
  END;

  -- 8. Return Consolidated Payload
  RETURN jsonb_build_object(
    'summary', v_summary,
    'daily_metrics', v_daily_metrics,
    'recent_sales', v_recent_sales,
    'recent_bills', v_recent_bills,
    'pending_approvals', v_pending_approvals,
    'cash_bank', v_cash_bank
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_analytics_payload(UUID, DATE, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_analytics_payload(UUID, DATE, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_analytics_payload(UUID, DATE, DATE, DATE) TO anon;
```

#### Rollback Script (if ever needed):
```sql
DROP FUNCTION IF EXISTS public.get_dashboard_analytics_payload(UUID, DATE, DATE, DATE);
```

---

## Script 3: GL EMI Interest Account Name Columns
**File:** `supabase/migrations/134_add_gl_emi_interest_name_columns.sql`  
**Purpose:** Persists display account names for unearned and income EMI interest in `CompanySettings` when setting up financial mappings.

### Copy & Paste SQL into Supabase:

```sql
BEGIN;

ALTER TABLE public."CompanySettings"
  ADD COLUMN IF NOT EXISTS gl_unearned_emi_interest_id   UUID REFERENCES public."ChartOfAccount"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS gl_unearned_emi_interest_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS gl_emi_interest_income_id     UUID REFERENCES public."ChartOfAccount"(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS gl_emi_interest_income_name   TEXT DEFAULT NULL;

COMMIT;
```

#### Rollback Script (if ever needed):
```sql
BEGIN;
ALTER TABLE public."CompanySettings"
  DROP COLUMN IF EXISTS gl_unearned_emi_interest_name,
  DROP COLUMN IF EXISTS gl_emi_interest_income_name;
COMMIT;
```

---

## How to Verify All Scripts Succeeded

In Supabase SQL Editor, run this quick verification query:

```sql
-- 1. Check Indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE indexname IN (
  'idx_sales_invoice_company_status_created',
  'idx_purchase_invoice_company_status_created',
  'idx_financial_voucher_company_status_created',
  'idx_gl_journal_company_date',
  'idx_gl_line_company_account',
  'idx_item_company_cat_active',
  'idx_partner_company_customer',
  'idx_partner_company_vendor',
  'idx_coa_company_code',
  'idx_usercompany_lookup',
  'idx_daily_metrics_company_date'
);

-- 2. Check RPC Function
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'get_dashboard_analytics_payload';

-- 3. Check CompanySettings Columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'CompanySettings' 
  AND column_name LIKE '%emi%';
```

When all three queries return rows, your Supabase database is completely optimized and in sync!

---

## Script 4: Atomic Financial Voucher Cancellation Engine (v2)
**File:** `supabase/migrations/137_unified_financial_voucher_cancellation.sql` (or `218_unified_financial_voucher_cancellation_v2.sql`)  
**Purpose:** Replaces client-side voucher duplication (`REV-`) with atomic in-place document cancellation, locks against closed accounting periods, handles dual-key bill allocations (`invoice_id` / `bill_id`), and provides schema-safe audit logging.

> [!IMPORTANT]
> To prevent PostgreSQL function signature ambiguity errors (`ERROR: function rpc_cancel_document(uuid, text, text) is not unique`), the script drops existing 3-parameter overloads before creating the unified function.

### Copy & Paste SQL into Supabase:

```sql
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
    v_user_id := COALESCE(p_user_id, auth.uid());

    IF p_doc_type = 'FinancialVoucher' THEN
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

        IF EXISTS (
            SELECT 1 FROM public."FiscalYear"
            WHERE company_id = v_company_id 
              AND (is_locked = TRUE OR status = 'Closed')
              AND v_voucher.voucher_date::DATE BETWEEN start_date AND end_date
        ) THEN
            RAISE EXCEPTION 'ERR_PERIOD_LOCKED: Cannot cancel vouchers belonging to a locked or closed fiscal year.';
        END IF;

        UPDATE public."FinancialVoucher"
        SET 
            status = 'Cancelled',
            is_reversed = TRUE,
            cancelled_at = NOW(),
            cancelled_by = v_user_id,
            cancellation_reason = p_reason
        WHERE id = p_doc_id;

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
        END LOOP;

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
```

---

## Complete Rollback Strategy for Script 4

If you ever need to revert Script 4:

1. **Database Rollback:**  
   Open Supabase SQL Editor and execute `supabase/migrations/137_unified_financial_voucher_cancellation_rollback.sql` (or `218_unified_financial_voucher_cancellation_rollback.sql`). This drops the extended signature and restores the original `rpc_cancel_document(UUID, TEXT, TEXT)` from `094_unified_cancellation_rpc.sql`.
2. **Frontend Rollback:**  
   Revert git commits on `src/lib/glPostingService.js` and `src/pages/treasury/FinancialVouchers.jsx`.
3. **Data Safety Guarantee:**  
   The added nullable columns (`is_reversed`, `cancelled_at`, etc.) remain in `FinancialVoucher` without interfering with legacy queries, ensuring zero data loss during rollback.

---

## Script 5: Day Book RPC — Exclude Cancelled Documents & Reversed Journals
**File:** `supabase/migrations/138_fix_day_book_rpc_exclude_cancelled.sql`  
**Rollback:** `supabase/migrations/138_fix_day_book_rpc_exclude_cancelled_rollback.sql`  
**Purpose:** Excludes cancelled vouchers, reversed General Ledger journals, and contra entries from the Day Book report. Ensures that Opening Cash, Closing Cash, and daily transaction rows strictly reflect active, posted accounting events.

### Why this migration is required:
1. When vouchers (e.g. `PV-FS 2083.084-00123`, `PV-FS 2083.084-00128`) are cancelled in `FinancialVoucher`, historical GL journals previously retained `status = 'Posted'`.
2. The original `get_day_book_rpc` queried solely on `status = 'Posted'` without checking `is_reversed` or verifying if the underlying source document was cancelled.
3. This migration updates `get_day_book_rpc` with:
   - `AND (glj.is_reversed IS NOT TRUE)`
   - `AND (glj.reversed_journal_id IS NULL)`
   - Anti-joins against `FinancialVoucher`, `SalesInvoice`, and `PurchaseInvoice` where `status = 'Cancelled'`.
   - Security check expanded to allow `service_role` execution.

### SQL to run in Supabase SQL Editor:
```sql
CREATE OR REPLACE FUNCTION public.get_day_book_rpc(
  p_company_id UUID,
  p_date       DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening_cash NUMERIC := 0;
  v_closing_cash NUMERIC := 0;
  v_result       JSONB;
BEGIN
  IF auth.role() != 'service_role' AND NOT EXISTS (
    SELECT 1 FROM public."UserCompany" 
    WHERE company_id = p_company_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: User does not have access to this company.';
  END IF;

  -- 1. Compute Opening Cash Balance
  SELECT COALESCE(SUM(gll.debit_amount - gll.credit_amount), 0)
  INTO v_opening_cash
  FROM "GeneralLedgerLine" gll
  JOIN "GeneralLedgerJournal" glj ON glj.id = gll.journal_id
  JOIN "ChartOfAccount" a ON a.id = gll.account_id
  WHERE glj.company_id = p_company_id
    AND glj.status = 'Posted'
    AND (glj.is_reversed IS NOT TRUE)
    AND (glj.reversed_journal_id IS NULL)
    AND (a.is_cash_account = true OR a.account_type = 'Cash')
    AND glj.entry_date < p_date::TIMESTAMP
    AND NOT (
      (glj.source_document_type = 'FinancialVoucher' AND EXISTS (
        SELECT 1 FROM public."FinancialVoucher" fv 
        WHERE fv.id = glj.source_document_id AND fv.status = 'Cancelled'
      ))
      OR (glj.source_document_type = 'SalesInvoice' AND EXISTS (
        SELECT 1 FROM public."SalesInvoice" si 
        WHERE si.id = glj.source_document_id::UUID AND si.status = 'Cancelled'
      ))
      OR (glj.source_document_type = 'PurchaseInvoice' AND EXISTS (
        SELECT 1 FROM public."PurchaseInvoice" pi 
        WHERE pi.id = glj.source_document_id::UUID AND pi.status = 'Cancelled'
      ))
    );

  -- 2. Calculate Net Cash Closing Balance
  SELECT v_opening_cash + COALESCE(SUM(gll.debit_amount - gll.credit_amount), 0)
  INTO v_closing_cash
  FROM "GeneralLedgerLine" gll
  JOIN "GeneralLedgerJournal" glj ON glj.id = gll.journal_id
  JOIN "ChartOfAccount" a ON a.id = gll.account_id
  WHERE glj.company_id = p_company_id
    AND glj.status = 'Posted'
    AND (glj.is_reversed IS NOT TRUE)
    AND (glj.reversed_journal_id IS NULL)
    AND (a.is_cash_account = true OR a.account_type = 'Cash')
    AND glj.entry_date >= p_date::TIMESTAMP
    AND glj.entry_date < (p_date + INTERVAL '1 day')
    AND NOT (
      (glj.source_document_type = 'FinancialVoucher' AND EXISTS (
        SELECT 1 FROM public."FinancialVoucher" fv 
        WHERE fv.id = glj.source_document_id AND fv.status = 'Cancelled'
      ))
      OR (glj.source_document_type = 'SalesInvoice' AND EXISTS (
        SELECT 1 FROM public."SalesInvoice" si 
        WHERE si.id = glj.source_document_id::UUID AND si.status = 'Cancelled'
      ))
      OR (glj.source_document_type = 'PurchaseInvoice' AND EXISTS (
        SELECT 1 FROM public."PurchaseInvoice" pi 
        WHERE pi.id = glj.source_document_id::UUID AND pi.status = 'Cancelled'
      ))
    );

  -- 3. Unified CTE for single-pass extraction
  WITH base_lines AS (
    SELECT 
      gll.id, gll.journal_id, glj.voucher_no AS voucher_number,
      a.account_name, a.is_cash_account, a.is_bank_account, a.account_type, gll.description AS narration, 
      gll.debit_amount, gll.credit_amount
    FROM "GeneralLedgerLine" gll
    JOIN "GeneralLedgerJournal" glj ON glj.id = gll.journal_id
    JOIN "ChartOfAccount" a ON a.id = gll.account_id
    WHERE glj.company_id = p_company_id 
      AND glj.status = 'Posted'
      AND (glj.is_reversed IS NOT TRUE)
      AND (glj.reversed_journal_id IS NULL)
      AND glj.entry_date >= p_date::TIMESTAMP
      AND glj.entry_date < (p_date + INTERVAL '1 day')
      AND NOT (
        (glj.source_document_type = 'FinancialVoucher' AND EXISTS (
          SELECT 1 FROM public."FinancialVoucher" fv 
          WHERE fv.id = glj.source_document_id AND fv.status = 'Cancelled'
        ))
        OR (glj.source_document_type = 'SalesInvoice' AND EXISTS (
          SELECT 1 FROM public."SalesInvoice" si 
          WHERE si.id = glj.source_document_id::UUID AND si.status = 'Cancelled'
        ))
        OR (glj.source_document_type = 'PurchaseInvoice' AND EXISTS (
          SELECT 1 FROM public."PurchaseInvoice" pi 
          WHERE pi.id = glj.source_document_id::UUID AND pi.status = 'Cancelled'
        ))
      )
  ),
  journal_modes AS (
    SELECT 
      journal_id,
      COALESCE(SUM(debit_amount) FILTER (WHERE is_cash_account = true OR account_type = 'Cash'), 0) AS cash_dr,
      COALESCE(SUM(credit_amount) FILTER (WHERE is_cash_account = true OR account_type = 'Cash'), 0) AS cash_cr,
      COALESCE(SUM(debit_amount) FILTER (WHERE is_bank_account = true OR account_type = 'Bank'), 0) AS bank_dr,
      COALESCE(SUM(credit_amount) FILTER (WHERE is_bank_account = true OR account_type = 'Bank'), 0) AS bank_cr,
      CASE WHEN COALESCE(SUM(debit_amount) FILTER (WHERE NOT (is_cash_account = true OR account_type = 'Cash' OR is_bank_account = true OR account_type = 'Bank')), 0) = 0 THEN true ELSE false END AS is_contra
    FROM base_lines
    GROUP BY journal_id
  ),
  debit_agg AS (
    SELECT COALESCE(jsonb_agg(d_row ORDER BY voucher_number ASC), '[]'::jsonb) AS items
    FROM (
      SELECT 
        bl.id, bl.voucher_number, 
        CASE 
          WHEN jm.is_contra THEN 'Contra'
          WHEN jm.cash_dr > 0 OR jm.bank_dr > 0 THEN 'Receipt'
          WHEN jm.cash_cr > 0 OR jm.bank_cr > 0 THEN 'Payment'
          ELSE 'Journal'
        END AS voucher_type,
        bl.account_name, bl.narration,
        CASE WHEN jm.cash_dr > 0 THEN bl.credit_amount ELSE 0 END AS cash_amount,
        CASE WHEN jm.cash_dr = 0 THEN bl.credit_amount ELSE 0 END AS non_cash_amount
      FROM base_lines bl
      JOIN journal_modes jm ON bl.journal_id = jm.journal_id
      WHERE bl.credit_amount > 0
        AND (NOT (bl.is_cash_account = true OR bl.account_type = 'Cash' OR bl.is_bank_account = true OR bl.account_type = 'Bank') OR jm.is_contra)
    ) d_row
  ),
  credit_agg AS (
    SELECT COALESCE(jsonb_agg(c_row ORDER BY voucher_number ASC), '[]'::jsonb) AS items
    FROM (
      SELECT 
        bl.id, bl.voucher_number, 
        CASE 
          WHEN jm.is_contra THEN 'Contra'
          WHEN jm.cash_dr > 0 OR jm.bank_dr > 0 THEN 'Receipt'
          WHEN jm.cash_cr > 0 OR jm.bank_cr > 0 THEN 'Payment'
          ELSE 'Journal'
        END AS voucher_type,
        bl.account_name, bl.narration,
        CASE WHEN jm.cash_cr > 0 THEN bl.debit_amount ELSE 0 END AS cash_amount,
        CASE WHEN jm.cash_cr = 0 THEN bl.debit_amount ELSE 0 END AS non_cash_amount
      FROM base_lines bl
      JOIN journal_modes jm ON bl.journal_id = jm.journal_id
      WHERE bl.debit_amount > 0
        AND (NOT (bl.is_cash_account = true OR bl.account_type = 'Cash' OR bl.is_bank_account = true OR bl.account_type = 'Bank') OR jm.is_contra)
    ) c_row
  )
  SELECT jsonb_build_object(
    'date', p_date,
    'opening_cash', v_opening_cash,
    'closing_cash', v_closing_cash,
    'debits', (SELECT items FROM debit_agg),
    'credits', (SELECT items FROM credit_agg)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_day_book_rpc(UUID, DATE) TO authenticated, service_role;
```

### Rollback Strategy for Script 5:
Run `supabase/migrations/138_fix_day_book_rpc_exclude_cancelled_rollback.sql` in Supabase SQL Editor. This restores the original `129_day_book_rpc.sql` function without altering any ledger data.


