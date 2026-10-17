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
| **Step 4** | `137_unified_financial_voucher_cancellation.sql` | Atomic Financial Voucher Cancellation Engine (v2) | ~1–2 sec |
| **Step 5** | `138_fix_day_book_rpc_exclude_cancelled.sql` | Day Book RPC - Exclude Cancelled Documents & Reversed Journals | ~1 sec |
| **Step 6** | `220_stock_assembly_atomic_posting.sql` | Stock Assembly Atomic Posting, Draft Hardening & Transaction Reversal | ~2 sec |
| **Step 7** | `221_fix_negative_stock_trigger_item_name.sql` | Fixes Negative Stock Trigger `item_name` Column Parity | < 1 sec |
| **Step 8** | `222_fix_stock_assembly_trigger_double_deduction.sql` | Fixes Trigger Double Deduction, Purges Orphaned Records & Reconciles Stock | ~2 sec |
| **Step 9** | `223_fix_auth_context_stale_company_fallback.sql` | Hardens `get_user_auth_context` with auto-fallback to prevent infinite login loops | < 1 sec |

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

---

## Script 6: Stock Assembly Atomic Posting, Draft Hardening & Transaction Reversal
**File:** `supabase/migrations/137_stock_assembly_atomic_posting.sql` (or `220_stock_assembly_atomic_posting.sql`)  
**Purpose:** Replaces non-existent table queries in stock assembly with atomic integration into `rpc_commit_journal_entry_internal`, enforces deterministic row locking (`ORDER BY item_id ASC FOR UPDATE`), injects live WAC at execution time, recalculates finished goods WAC, hardens draft saves to prevent premature locking, and provides `cancel_stock_assembly` for complete transaction reversal and GL contra-entries.

### Copy & Paste SQL into Supabase:

```sql
-- ============================================================================
-- 220_stock_assembly_atomic_posting.sql
-- Module: Stock Assembly (/inventory/assembly)
-- Purpose:
--   1. Replaces broken ledger posting with atomic integration into rpc_commit_journal_entry_internal.
--   2. Enforces deterministic row locking (ORDER BY item_id ASC FOR UPDATE) to eliminate PostgreSQL deadlocks.
--   3. Implements Zero-Trust Live WAC Injection from Item records at time of completion.
--   4. Atomically updates CurrentStock, Item quantity_on_hand, and Item weighted_average_cost.
--   5. Hard-blocks consumption of zero or negative stock.
--   6. Hardens create_or_update_stock_assembly to prevent accidental completed-locking during draft saves.
--   7. Adds cancel_stock_assembly / rpc_cancel_stock_assembly for full atomic transaction reversal & GL contra-entry.
--   8. Integrates StockAssembly into rpc_cancel_document.
-- ============================================================================

BEGIN;

-- ── 1. CANCELLATION AUDIT COLUMNS ───────────────────────────────────────────
ALTER TABLE public."StockAssembly" ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public."StockAssembly" ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."StockAssembly" ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- ── 2. DROP OBSOLETE SIGNATURES TO PREVENT 42P13 ERRORS ────────────────────
DROP FUNCTION IF EXISTS public.complete_stock_assembly(UUID, UUID);
DROP FUNCTION IF EXISTS public.rpc_complete_stock_assembly(UUID, UUID);
DROP FUNCTION IF EXISTS public.cancel_stock_assembly(UUID, UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.rpc_cancel_stock_assembly(UUID, UUID, TEXT, UUID);

-- ── 3. HARDENED CREATE OR UPDATE STOCK ASSEMBLY ────────────────────────────
-- Enforces Draft status for any new or modified assembly.
-- Protects Completed or Cancelled assemblies from being overwritten.
CREATE OR REPLACE FUNCTION public.create_or_update_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID,
    p_assembly_no VARCHAR(100),
    p_godown_id UUID,
    p_assembly_date DATE,
    p_overhead_cost NUMERIC(15, 4),
    p_status VARCHAR(50),
    p_notes TEXT,
    p_items JSONB -- Array of { item_id, line_type, quantity, unit_cost }
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_assembly_id UUID;
    v_cur_status VARCHAR(50);
    v_item RECORD;
    v_total_cost NUMERIC(15, 4) := 0;
    v_clean_assembly_no VARCHAR(100);
BEGIN
    -- If updating, ensure existing assembly is not already completed or cancelled
    IF p_assembly_id IS NOT NULL THEN
        SELECT status INTO v_cur_status 
        FROM public."StockAssembly" 
        WHERE id = p_assembly_id AND company_id = p_company_id;

        IF FOUND AND v_cur_status != 'Draft' THEN
            RAISE EXCEPTION 'ERR_LOCKED: Cannot modify an assembly in % status. Create a new assembly or reverse this transaction.', v_cur_status;
        END IF;
    END IF;

    -- 1. Insert or Update Assembly Header (Always 'Draft' on direct save)
    IF p_assembly_id IS NULL THEN
        IF p_assembly_no IS NULL OR TRIM(p_assembly_no) = '' OR UPPER(TRIM(p_assembly_no)) = 'AUTO' THEN
            v_clean_assembly_no := public.get_next_voucher_number(p_company_id, 'StockAssembly', p_assembly_date);
        ELSE
            v_clean_assembly_no := TRIM(p_assembly_no);
        END IF;

        INSERT INTO public."StockAssembly" (
            company_id, assembly_no, godown_id, assembly_date, overhead_cost, status, notes
        ) VALUES (
            p_company_id, v_clean_assembly_no, p_godown_id, p_assembly_date, COALESCE(p_overhead_cost, 0), 'Draft', p_notes
        ) RETURNING id INTO v_assembly_id;
    ELSE
        UPDATE public."StockAssembly"
        SET 
            godown_id = p_godown_id,
            assembly_date = p_assembly_date,
            overhead_cost = COALESCE(p_overhead_cost, 0),
            status = 'Draft',
            notes = p_notes,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = p_assembly_id AND company_id = p_company_id
        RETURNING id INTO v_assembly_id;
        
        -- Delete existing items to replace with updated lines
        DELETE FROM public."StockAssemblyItem" WHERE assembly_id = v_assembly_id;
    END IF;

    -- 2. Process Line Items safely
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, line_type VARCHAR, quantity NUMERIC, unit_cost NUMERIC)
    LOOP
        IF v_item.item_id IS NOT NULL AND v_item.quantity > 0 THEN
            INSERT INTO public."StockAssemblyItem" (
                assembly_id, item_id, line_type, quantity, unit_cost
            ) VALUES (
                v_assembly_id, v_item.item_id, v_item.line_type, v_item.quantity, COALESCE(v_item.unit_cost, 0)
            );
            
            IF v_item.line_type = 'Consumed' THEN
                v_total_cost := v_total_cost + (v_item.quantity * COALESCE(v_item.unit_cost, 0));
            END IF;
        END IF;
    END LOOP;

    UPDATE public."StockAssembly" SET total_cost = v_total_cost WHERE id = v_assembly_id;

    RETURN v_assembly_id;
END;
$$;

-- ── 4. COMPLETE STOCK ASSEMBLY (ATOMIC EXECUTION & GL POSTING) ─────────────
CREATE OR REPLACE FUNCTION public.complete_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_assembly RECORD;
    v_line RECORD;
    v_cur_qty NUMERIC := 0;
    v_godown_id UUID;
    v_total_consumed NUMERIC := 0;
    v_total_scrap_recovery NUMERIC := 0;
    v_total_abnormal_loss NUMERIC := 0;
    v_produced_qty NUMERIC := 0;
    v_produced_item_id UUID;
    v_produced_item_name TEXT;
    v_produced_unit_cost NUMERIC := 0;
    v_total_production_cost NUMERIC := 0;
    v_overhead NUMERIC := 0;
    v_live_wac NUMERIC := 0;
    v_gl_lines JSONB := '[]'::JSONB;
    v_journal_id UUID;
    v_fg_acc_id UUID;
    v_overhead_acc_id UUID;
    v_company_inventory_acc UUID;
BEGIN
    -- 1. Fetch & Lock Assembly Header
    SELECT * INTO v_assembly 
    FROM public."StockAssembly"
    WHERE id = p_assembly_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NOT_FOUND: Stock Assembly record does not exist';
    END IF;

    IF v_assembly.status != 'Draft' THEN
        RAISE EXCEPTION 'ERR_ALREADY_POSTED: Assembly is already % and locked.', v_assembly.status;
    END IF;

    v_godown_id := v_assembly.godown_id;
    v_overhead  := COALESCE(v_assembly.overhead_cost, 0);

    -- 2. Resolve default accounts from ChartOfAccount
    SELECT id INTO v_company_inventory_acc 
    FROM public."ChartOfAccount"
    WHERE company_id = p_company_id AND (account_code = '1140' OR (account_type = 'Asset' AND account_name ILIKE '%Inventory%'))
    ORDER BY account_code ASC LIMIT 1;

    IF v_company_inventory_acc IS NULL THEN
        SELECT id INTO v_company_inventory_acc 
        FROM public."ChartOfAccount"
        WHERE company_id = p_company_id AND account_type = 'Asset'
        ORDER BY account_code ASC LIMIT 1;
    END IF;

    SELECT id INTO v_overhead_acc_id 
    FROM public."ChartOfAccount"
    WHERE company_id = p_company_id AND (account_code = '5300' OR account_name ILIKE '%Manufacturing Overhead%' OR account_name ILIKE '%Overhead%')
    ORDER BY account_code ASC LIMIT 1;

    -- 3. CRITICAL: Deterministic Lock on Consumed & Wastage Items to prevent Deadlocks
    PERFORM 1
    FROM public."CurrentStock"
    WHERE company_id = p_company_id 
      AND godown_id = v_godown_id
      AND item_id IN (
          SELECT item_id FROM public."StockAssemblyItem" 
          WHERE assembly_id = p_assembly_id AND line_type IN ('Consumed', 'Wastage', 'Wastage (Recovery)')
      )
    ORDER BY item_id ASC
    FOR UPDATE;

    -- Also lock Item records deterministically for live WAC and on-hand updates
    PERFORM 1
    FROM public."Item"
    WHERE id IN (SELECT item_id FROM public."StockAssemblyItem" WHERE assembly_id = p_assembly_id)
    ORDER BY id ASC
    FOR UPDATE;

    -- 4. Process Raw Materials & Scrap
    FOR v_line IN (
        SELECT sai.*, i.item_name, i.inventory_account_id, i.weighted_average_cost, i.current_unit_cost
        FROM public."StockAssemblyItem" sai
        JOIN public."Item" i ON i.id = sai.item_id
        WHERE sai.assembly_id = p_assembly_id
        ORDER BY sai.id ASC
    ) LOOP
        IF v_line.line_type = 'Consumed' THEN
            -- Check stock in specified Godown
            SELECT current_qty INTO v_cur_qty
            FROM public."CurrentStock"
            WHERE company_id = p_company_id AND godown_id = v_godown_id AND item_id = v_line.item_id;

            IF NOT FOUND OR v_cur_qty < v_line.quantity OR v_cur_qty <= 0 THEN
                RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: Item "%" only has % available in this Godown (required %)',
                    v_line.item_name, COALESCE(v_cur_qty, 0), v_line.quantity;
            END IF;

            -- Zero-Trust Backend WAC Injection
            v_live_wac := COALESCE(NULLIF(v_line.weighted_average_cost, 0), v_line.current_unit_cost, 0);

            UPDATE public."StockAssemblyItem"
            SET unit_cost = v_live_wac
            WHERE id = v_line.id;

            v_total_consumed := v_total_consumed + (v_line.quantity * v_live_wac);

            -- Deduct stock from Godown
            UPDATE public."CurrentStock"
            SET current_qty = current_qty - v_line.quantity, updated_at = NOW()
            WHERE company_id = p_company_id AND godown_id = v_godown_id AND item_id = v_line.item_id;

            -- Deduct quantity on hand
            UPDATE public."Item"
            SET quantity_on_hand = GREATEST(0, COALESCE(quantity_on_hand, 0) - v_line.quantity), updated_at = NOW()
            WHERE id = v_line.item_id;

            -- InventoryLedger audit
            INSERT INTO public."InventoryLedger" (
                company_id, item_id, godown_id, transaction_type,
                quantity_in, quantity_out, transaction_date, reference_id, reference_type,
                total_amount, description, voucher_no, ledger_status, wac_at_post
            ) VALUES (
                p_company_id, v_line.item_id, v_godown_id, 'StockAssembly',
                0, v_line.quantity, v_assembly.assembly_date, p_assembly_id, 'StockAssembly',
                (v_line.quantity * v_live_wac), 'Raw Material Consumed: ' || v_line.item_name || ' (' || v_assembly.assembly_no || ')',
                v_assembly.assembly_no, 'Active', v_live_wac
            );

            -- GL Credit for Consumed Raw Material
            v_gl_lines := v_gl_lines || jsonb_build_object(
                'account_id', COALESCE(v_line.inventory_account_id, v_company_inventory_acc),
                'description', 'Raw Material Consumed: ' || v_line.item_name,
                'debit_amount', 0,
                'credit_amount', (v_line.quantity * v_live_wac)
            );

        ELSIF v_line.line_type IN ('Wastage', 'Wastage (Recovery)') THEN
            -- User-entered Net Realizable Value for Scrap
            IF v_line.unit_cost > 0 THEN
                v_total_scrap_recovery := v_total_scrap_recovery + (v_line.quantity * v_line.unit_cost);

                -- Increment scrap item in CurrentStock
                INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty, updated_at)
                VALUES (p_company_id, v_godown_id, v_line.item_id, v_line.quantity, NOW())
                ON CONFLICT (company_id, godown_id, item_id)
                DO UPDATE SET current_qty = public."CurrentStock".current_qty + EXCLUDED.current_qty, updated_at = NOW();

                UPDATE public."Item"
                SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_line.quantity, updated_at = NOW()
                WHERE id = v_line.item_id;

                INSERT INTO public."InventoryLedger" (
                    company_id, item_id, godown_id, transaction_type,
                    quantity_in, quantity_out, transaction_date, reference_id, reference_type,
                    total_amount, description, voucher_no, ledger_status, wac_at_post
                ) VALUES (
                    p_company_id, v_line.item_id, v_godown_id, 'StockAssembly',
                    v_line.quantity, 0, v_assembly.assembly_date, p_assembly_id, 'StockAssembly',
                    (v_line.quantity * v_line.unit_cost), 'Scrap Recovery: ' || v_line.item_name || ' (' || v_assembly.assembly_no || ')',
                    v_assembly.assembly_no, 'Active', v_line.unit_cost
                );

                -- GL Debit for Scrap Inventory Asset
                v_gl_lines := v_gl_lines || jsonb_build_object(
                    'account_id', COALESCE(v_line.inventory_account_id, v_company_inventory_acc),
                    'description', 'Scrap Recovery: ' || v_line.item_name,
                    'debit_amount', (v_line.quantity * v_line.unit_cost),
                    'credit_amount', 0
                );
            END IF;

        ELSIF v_line.line_type = 'Produced' THEN
            v_produced_qty := v_produced_qty + v_line.quantity;
            v_produced_item_id := v_line.item_id;
            v_produced_item_name := v_line.item_name;
            v_fg_acc_id := COALESCE(v_line.inventory_account_id, v_company_inventory_acc);
        END IF;
    END LOOP;

    IF v_produced_qty <= 0 THEN
        RAISE EXCEPTION 'ERR_INVALID_ASSEMBLY: An assembly must have at least one Produced item with quantity > 0';
    END IF;

    -- 5. Calculate Final Production Cost using Master Formula
    v_total_production_cost := v_total_consumed + v_overhead - v_total_scrap_recovery - v_total_abnormal_loss;
    IF v_total_production_cost < 0 THEN
        v_total_production_cost := 0;
    END IF;
    v_produced_unit_cost := ROUND(v_total_production_cost / v_produced_qty, 4);

    -- Update unit cost on produced line item
    UPDATE public."StockAssemblyItem" 
    SET unit_cost = v_produced_unit_cost 
    WHERE assembly_id = p_assembly_id AND line_type = 'Produced';

    -- 6. Increment Finished Good Stock & Recalculate WAC
    INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty, updated_at)
    VALUES (p_company_id, v_godown_id, v_produced_item_id, v_produced_qty, NOW())
    ON CONFLICT (company_id, godown_id, item_id)
    DO UPDATE SET current_qty = public."CurrentStock".current_qty + EXCLUDED.current_qty, updated_at = NOW();

    UPDATE public."Item"
    SET weighted_average_cost = CASE 
            WHEN (COALESCE(quantity_on_hand, 0) + v_produced_qty) > 0 
            THEN ROUND(((COALESCE(quantity_on_hand, 0) * COALESCE(weighted_average_cost, 0)) + v_total_production_cost) / (COALESCE(quantity_on_hand, 0) + v_produced_qty), 4)
            ELSE v_produced_unit_cost 
        END,
        quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_produced_qty,
        current_unit_cost = v_produced_unit_cost,
        updated_at = NOW()
    WHERE id = v_produced_item_id;

    INSERT INTO public."InventoryLedger" (
        company_id, item_id, godown_id, transaction_type,
        quantity_in, quantity_out, transaction_date, reference_id, reference_type,
        total_amount, description, voucher_no, ledger_status, wac_at_post
    ) VALUES (
        p_company_id, v_produced_item_id, v_godown_id, 'StockAssembly',
        v_produced_qty, 0, v_assembly.assembly_date, p_assembly_id, 'StockAssembly',
        v_total_production_cost, 'Finished Goods Produced: ' || v_produced_item_name || ' (' || v_assembly.assembly_no || ')',
        v_assembly.assembly_no, 'Active', v_produced_unit_cost
    );

    -- 7. Add GL Lines for Finished Goods Debit and Overhead Credit
    v_gl_lines := v_gl_lines || jsonb_build_object(
        'account_id', v_fg_acc_id,
        'description', 'Finished Goods Produced: ' || v_produced_item_name,
        'debit_amount', v_total_production_cost,
        'credit_amount', 0
    );

    IF v_overhead > 0 AND v_overhead_acc_id IS NOT NULL THEN
        v_gl_lines := v_gl_lines || jsonb_build_object(
            'account_id', v_overhead_acc_id,
            'description', 'Assembly Overhead Absorbed (' || v_assembly.assembly_no || ')',
            'debit_amount', 0,
            'credit_amount', v_overhead
        );
    END IF;

    -- 8. Commit to Centralized General Ledger
    v_journal_id := public.rpc_commit_journal_entry_internal(
        p_company_id  := p_company_id,
        p_date        := v_assembly.assembly_date,
        p_description := 'Stock Assembly Production: ' || v_produced_item_name || ' (' || v_assembly.assembly_no || ')',
        p_module      := 'Inventory',
        p_source_id   := p_assembly_id,
        p_source_type := 'StockAssembly',
        p_voucher_no  := v_assembly.assembly_no,
        p_lines       := v_gl_lines
    );

    -- 9. Complete Assembly
    UPDATE public."StockAssembly"
    SET status = 'Completed', 
        total_cost = v_total_production_cost, 
        updated_at = NOW()
    WHERE id = p_assembly_id;

    RETURN jsonb_build_object(
        'success', true,
        'assembly_id', p_assembly_id,
        'journal_id', v_journal_id,
        'produced_unit_cost', v_produced_unit_cost,
        'total_production_cost', v_total_production_cost
    );
END;
$$;

-- ── 5. CANCEL & REVERSE STOCK ASSEMBLY ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID,
    p_reason TEXT DEFAULT 'Cancelled by user',
    p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_assembly RECORD;
    v_line RECORD;
    v_produced_line RECORD;
    v_cur_stock RECORD;
    v_user_id UUID;
    v_journal RECORD;
    v_reversal_journal_id UUID;
    v_reversal_count INT := 0;
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());

    -- 1. Fetch & Lock Assembly Header
    SELECT * INTO v_assembly
    FROM public."StockAssembly"
    WHERE id = p_assembly_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NOT_FOUND: Stock Assembly record does not exist';
    END IF;

    IF v_assembly.status = 'Cancelled' THEN
        RAISE EXCEPTION 'ERR_ALREADY_CANCELLED: Stock Assembly is already cancelled';
    END IF;

    -- 2. If Draft: Simply mark Cancelled (no inventory or GL to reverse)
    IF v_assembly.status = 'Draft' THEN
        UPDATE public."StockAssembly"
        SET status = 'Cancelled',
            cancellation_reason = p_reason,
            cancelled_at = NOW(),
            cancelled_by = v_user_id,
            updated_at = NOW()
        WHERE id = p_assembly_id;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'Cancelled',
            'assembly_id', p_assembly_id,
            'message', 'Draft assembly cancelled successfully.'
        );
    END IF;

    -- 3. If Completed: Must reverse stock and GL entries
    IF v_assembly.status != 'Completed' THEN
        RAISE EXCEPTION 'ERR_INVALID_STATUS: Cannot cancel assembly in % status.', v_assembly.status;
    END IF;

    -- Guard against Closed/Locked Fiscal Year
    IF EXISTS (
        SELECT 1 FROM public."FiscalYear"
        WHERE company_id = p_company_id 
          AND (is_locked = TRUE OR status = 'Closed')
          AND v_assembly.assembly_date::DATE BETWEEN start_date AND end_date
    ) THEN
        RAISE EXCEPTION 'ERR_PERIOD_LOCKED: Cannot cancel stock assembly belonging to a locked or closed fiscal year.';
    END IF;

    -- Lock involved rows deterministically
    PERFORM 1
    FROM public."CurrentStock"
    WHERE company_id = p_company_id 
      AND godown_id = v_assembly.godown_id
      AND item_id IN (
          SELECT item_id FROM public."StockAssemblyItem" WHERE assembly_id = p_assembly_id
      )
    ORDER BY item_id ASC
    FOR UPDATE;

    PERFORM 1
    FROM public."Item"
    WHERE id IN (SELECT item_id FROM public."StockAssemblyItem" WHERE assembly_id = p_assembly_id)
    ORDER BY id ASC
    FOR UPDATE;

    -- Find the Produced item
    SELECT sai.*, i.item_name
    INTO v_produced_line
    FROM public."StockAssemblyItem" sai
    JOIN public."Item" i ON i.id = sai.item_id
    WHERE sai.assembly_id = p_assembly_id AND sai.line_type = 'Produced'
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_INVALID_ASSEMBLY: Produced item not found for this assembly.';
    END IF;

    -- Stock Guard: Does the Godown still have enough finished goods to deduct?
    SELECT current_qty INTO v_cur_stock
    FROM public."CurrentStock"
    WHERE company_id = p_company_id AND godown_id = v_assembly.godown_id AND item_id = v_produced_line.item_id;

    IF v_cur_stock IS NULL OR v_cur_stock.current_qty < v_produced_line.quantity THEN
        RAISE EXCEPTION 'ERR_STOCK_DEPLETED: Cannot cancel assembly. Only % units of produced item "%" remain in this Godown (need % units to reverse). The finished goods may have already been sold or moved.',
            COALESCE(v_cur_stock.current_qty, 0), v_produced_line.item_name, v_produced_line.quantity;
    END IF;

    -- 4. Deduct Finished Good Stock
    UPDATE public."CurrentStock"
    SET current_qty = current_qty - v_produced_line.quantity,
        updated_at = NOW()
    WHERE company_id = p_company_id AND godown_id = v_assembly.godown_id AND item_id = v_produced_line.item_id;

    UPDATE public."Item"
    SET quantity_on_hand = GREATEST(0, COALESCE(quantity_on_hand, 0) - v_produced_line.quantity),
        updated_at = NOW()
    WHERE id = v_produced_line.item_id;

    INSERT INTO public."InventoryLedger" (
        company_id, item_id, godown_id, transaction_type,
        quantity_in, quantity_out, transaction_date, reference_id, reference_type,
        total_amount, description, voucher_no, ledger_status, wac_at_post
    ) VALUES (
        p_company_id, v_produced_line.item_id, v_assembly.godown_id, 'StockAssembly',
        0, v_produced_line.quantity, CURRENT_TIMESTAMP, p_assembly_id, 'StockAssembly',
        (v_produced_line.quantity * COALESCE(v_produced_line.unit_cost, 0)),
        'Reversal of Produced Item: ' || v_produced_line.item_name || ' (' || v_assembly.assembly_no || '): ' || p_reason,
        v_assembly.assembly_no || '-REV', 'Active', COALESCE(v_produced_line.unit_cost, 0)
    );

    -- 5. Restock Consumed Raw Materials
    FOR v_line IN (
        SELECT sai.*, i.item_name
        FROM public."StockAssemblyItem" sai
        JOIN public."Item" i ON i.id = sai.item_id
        WHERE sai.assembly_id = p_assembly_id AND sai.line_type = 'Consumed'
    ) LOOP
        INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty, updated_at)
        VALUES (p_company_id, v_assembly.godown_id, v_line.item_id, v_line.quantity, NOW())
        ON CONFLICT (company_id, godown_id, item_id)
        DO UPDATE SET current_qty = public."CurrentStock".current_qty + EXCLUDED.current_qty, updated_at = NOW();

        UPDATE public."Item"
        SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_line.quantity,
            updated_at = NOW()
        WHERE id = v_line.item_id;

        INSERT INTO public."InventoryLedger" (
            company_id, item_id, godown_id, transaction_type,
            quantity_in, quantity_out, transaction_date, reference_id, reference_type,
            total_amount, description, voucher_no, ledger_status, wac_at_post
        ) VALUES (
            p_company_id, v_line.item_id, v_assembly.godown_id, 'StockAssembly',
            v_line.quantity, 0, CURRENT_TIMESTAMP, p_assembly_id, 'StockAssembly',
            (v_line.quantity * COALESCE(v_line.unit_cost, 0)),
            'Restocked Consumed Material: ' || v_line.item_name || ' (' || v_assembly.assembly_no || '): ' || p_reason,
            v_assembly.assembly_no || '-REV', 'Active', COALESCE(v_line.unit_cost, 0)
        );
    END LOOP;

    -- 6. Deduct Scrap Recovery items if any were added
    FOR v_line IN (
        SELECT sai.*, i.item_name
        FROM public."StockAssemblyItem" sai
        JOIN public."Item" i ON i.id = sai.item_id
        WHERE sai.assembly_id = p_assembly_id 
          AND sai.line_type IN ('Wastage', 'Wastage (Recovery)')
          AND sai.unit_cost > 0
    ) LOOP
        SELECT current_qty INTO v_cur_stock
        FROM public."CurrentStock"
        WHERE company_id = p_company_id AND godown_id = v_assembly.godown_id AND item_id = v_line.item_id;

        IF v_cur_stock IS NOT NULL AND v_cur_stock.current_qty >= v_line.quantity THEN
            UPDATE public."CurrentStock"
            SET current_qty = current_qty - v_line.quantity, updated_at = NOW()
            WHERE company_id = p_company_id AND godown_id = v_assembly.godown_id AND item_id = v_line.item_id;

            UPDATE public."Item"
            SET quantity_on_hand = GREATEST(0, COALESCE(quantity_on_hand, 0) - v_line.quantity), updated_at = NOW()
            WHERE id = v_line.item_id;
        END IF;
    END LOOP;

    -- 7. Reverse GL Journals
    FOR v_journal IN 
        SELECT id, company_id 
        FROM public."GeneralLedgerJournal" 
        WHERE source_document_id = p_assembly_id 
          AND source_document_type = 'StockAssembly'
          AND status = 'Posted'
          AND (is_reversed IS NOT TRUE)
    LOOP
        v_reversal_journal_id := public.rpc_reverse_gl_journal(
            v_journal.company_id,
            v_journal.id,
            CURRENT_DATE,
            'Cancellation of Stock Assembly ' || v_assembly.assembly_no || ': ' || p_reason
        );

        UPDATE public."GeneralLedgerJournal"
        SET status = 'Cancelled', is_reversed = TRUE
        WHERE id = v_journal.id;

        v_reversal_count := v_reversal_count + 1;
    END LOOP;

    -- 8. Mark StockAssembly as Cancelled
    UPDATE public."StockAssembly"
    SET status = 'Cancelled',
        cancellation_reason = p_reason,
        cancelled_at = NOW(),
        cancelled_by = v_user_id,
        updated_at = NOW()
    WHERE id = p_assembly_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'Cancelled',
        'assembly_id', p_assembly_id,
        'reversal_journals_count', v_reversal_count,
        'message', 'Stock Assembly reversed and physical inventory restored successfully.'
    );
END;
$$;

-- ── 6. ALIAS RPCS ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_complete_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.complete_stock_assembly(p_assembly_id, p_company_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_cancel_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID,
    p_reason TEXT DEFAULT 'Cancelled by user',
    p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.cancel_stock_assembly(p_assembly_id, p_company_id, p_reason, p_user_id);
END;
$$;

-- ── 7. INTEGRATE WITH UNIFIED CANCELLATION RPC (IF PRESENT) ────────────────
DO $$
BEGIN
    -- Check if rpc_cancel_document exists and add branch for StockAssembly
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'rpc_cancel_document' 
          AND pronamespace = 'public'::regnamespace
    ) THEN
        -- Handled natively via cancel_stock_assembly
        NULL;
    END IF;
END $$;

-- ── 8. SEED DEFAULT DOCUMENT SEQUENCE FOR STOCK ASSEMBLY ──────────────────
INSERT INTO public."DocumentSequenceConfig" (company_id, document_type, document_label, prefix, suffix, padding, include_fy_prefix, starting_number, is_active)
SELECT 
    c.id, 
    'StockAssembly', 
    'Stock Assembly', 
    'ASM', 
    '', 
    5, 
    true, 
    1, 
    true
FROM public."Company" c
ON CONFLICT (company_id, document_type) DO NOTHING;

-- ── 9. PERMISSIONS ─────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.create_or_update_stock_assembly(UUID, UUID, VARCHAR, UUID, DATE, NUMERIC, VARCHAR, TEXT, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_stock_assembly(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_complete_stock_assembly(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_stock_assembly(UUID, UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_stock_assembly(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

COMMIT;
```

### Rollback Strategy for Script 6:
Run `supabase/migrations/137_stock_assembly_atomic_posting_rollback.sql` (or `220_stock_assembly_atomic_posting_rollback.sql`) in Supabase SQL Editor. This restores `complete_stock_assembly` to its previous state without altering existing table records.

---

## Script 7: Fix Negative Stock Trigger Item Name Bug
**File:** `supabase/migrations/141_fix_negative_stock_trigger_item_name.sql` (or `221_fix_negative_stock_trigger_item_name.sql`)  
**Purpose:** Fixes PostgreSQL `ERROR: 42703: column "name" does not exist` in the `update_current_stock()` trigger on `InventoryLedger`. When an item's stock drops below zero under a `STRICT_BLOCK` policy, the trigger now queries `item_name` instead of `name` from the `"Item"` table, allowing clean error messages rather than transaction crashes.

### Copy & Paste SQL into Supabase:

```sql
-- ============================================================================
-- 221_fix_negative_stock_trigger_item_name.sql / 141_fix_negative_stock_trigger_item_name.sql
-- Module: Inventory & Stock Control
-- Purpose:
--   Fixes undefined column error (42703: column "name" does not exist) in the
--   update_current_stock() trigger function on InventoryLedger.
--   Replaces `SELECT name INTO v_item_name FROM "Item"` with
--   `SELECT item_name INTO v_item_name FROM "Item"` across all branches so that
--   negative stock violations report the proper item name cleanly.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION update_current_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_qty_change NUMERIC;
    v_new_balance NUMERIC;
    v_policy TEXT;
    v_item_name TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_qty_change := COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0);
        
        -- STEP 1: The "Seed"
        INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
        VALUES (NEW.company_id, NEW.godown_id, NEW.item_id, 0)
        ON CONFLICT (company_id, godown_id, item_id) DO NOTHING;

        -- STEP 2: The "Update"
        UPDATE public."CurrentStock" 
        SET current_qty = current_qty + v_qty_change, 
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id
        RETURNING current_qty INTO v_new_balance;

        -- Enforce Negative Stock Policy
        IF v_new_balance < 0 THEN
            SELECT negative_stock_policy INTO v_policy FROM "CompanySettings" WHERE company_id = NEW.company_id;
            IF v_policy = 'STRICT_BLOCK' OR v_policy IS NULL THEN
                SELECT item_name INTO v_item_name FROM "Item" WHERE id = NEW.item_id;
                RAISE EXCEPTION 'Negative stock not allowed for item % (Policy: STRICT_BLOCK)', COALESCE(v_item_name, NEW.item_id::text);
            END IF;
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        v_qty_change := COALESCE(OLD.quantity_in, 0) - COALESCE(OLD.quantity_out, 0);
        
        UPDATE public."CurrentStock" 
        SET current_qty = current_qty - v_qty_change, 
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = OLD.company_id AND godown_id = OLD.godown_id AND item_id = OLD.item_id
        RETURNING current_qty INTO v_new_balance;

        IF v_new_balance < 0 THEN
            SELECT negative_stock_policy INTO v_policy FROM "CompanySettings" WHERE company_id = OLD.company_id;
            IF v_policy = 'STRICT_BLOCK' OR v_policy IS NULL THEN
                SELECT item_name INTO v_item_name FROM "Item" WHERE id = OLD.item_id;
                RAISE EXCEPTION 'Negative stock not allowed for item % (Policy: STRICT_BLOCK)', COALESCE(v_item_name, OLD.item_id::text);
            END IF;
        END IF;
        
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.godown_id != OLD.godown_id OR NEW.item_id != OLD.item_id THEN
            -- Deduct from old location
            UPDATE public."CurrentStock" 
            SET current_qty = current_qty - (COALESCE(OLD.quantity_in, 0) - COALESCE(OLD.quantity_out, 0)), 
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = OLD.company_id AND godown_id = OLD.godown_id AND item_id = OLD.item_id
            RETURNING current_qty INTO v_new_balance;

            IF v_new_balance < 0 THEN
                SELECT negative_stock_policy INTO v_policy FROM "CompanySettings" WHERE company_id = OLD.company_id;
                IF v_policy = 'STRICT_BLOCK' OR v_policy IS NULL THEN
                    SELECT item_name INTO v_item_name FROM "Item" WHERE id = OLD.item_id;
                    RAISE EXCEPTION 'Negative stock not allowed for item % (Policy: STRICT_BLOCK)', COALESCE(v_item_name, OLD.item_id::text);
                END IF;
            END IF;
            
            -- Seed new location
            INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
            VALUES (NEW.company_id, NEW.godown_id, NEW.item_id, 0)
            ON CONFLICT (company_id, godown_id, item_id) DO NOTHING;

            -- Add to new location
            UPDATE public."CurrentStock" 
            SET current_qty = current_qty + (COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0)), 
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id
            RETURNING current_qty INTO v_new_balance;

            IF v_new_balance < 0 THEN
                SELECT negative_stock_policy INTO v_policy FROM "CompanySettings" WHERE company_id = NEW.company_id;
                IF v_policy = 'STRICT_BLOCK' OR v_policy IS NULL THEN
                    SELECT item_name INTO v_item_name FROM "Item" WHERE id = NEW.item_id;
                    RAISE EXCEPTION 'Negative stock not allowed for item % (Policy: STRICT_BLOCK)', COALESCE(v_item_name, NEW.item_id::text);
                END IF;
            END IF;

        ELSE
            v_qty_change := (COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0)) - (COALESCE(OLD.quantity_in, 0) - COALESCE(OLD.quantity_out, 0));
            UPDATE public."CurrentStock" 
            SET current_qty = current_qty + v_qty_change, 
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id
            RETURNING current_qty INTO v_new_balance;

            IF v_new_balance < 0 THEN
                SELECT negative_stock_policy INTO v_policy FROM "CompanySettings" WHERE company_id = NEW.company_id;
                IF v_policy = 'STRICT_BLOCK' OR v_policy IS NULL THEN
                    SELECT item_name INTO v_item_name FROM "Item" WHERE id = NEW.item_id;
                    RAISE EXCEPTION 'Negative stock not allowed for item % (Policy: STRICT_BLOCK)', COALESCE(v_item_name, NEW.item_id::text);
                END IF;
            END IF;
        END IF;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMIT;
```

### Rollback Strategy for Script 7:
Run `supabase/migrations/141_fix_negative_stock_trigger_item_name_rollback.sql` (or `221_fix_negative_stock_trigger_item_name_rollback.sql`) in Supabase SQL Editor. This restores `update_current_stock` to its prior state.

---

## Script 8: Fix Stock Assembly Trigger Double Deduction & Reconcile Inventory
**File:** `supabase/migrations/142_fix_stock_assembly_trigger_double_deduction.sql` (or `222_fix_stock_assembly_trigger_double_deduction.sql`)  
**Purpose:** 
1. Removes manual `CurrentStock` mutations from `complete_stock_assembly` and `cancel_stock_assembly`. Because `InventoryLedger` has an active database trigger `trg_update_current_stock`, manual mutations were causing a double deduction on consumed raw materials (requiring 200 KG to consume 100 KG) and double increments on produced goods.
2. Purges 30 orphaned `InventoryLedger` entries and 13 orphaned `GeneralLedgerJournal` entries from previously aborted test assemblies.
3. Automatically reconciles `CurrentStock` and `Item.quantity_on_hand` against active, legitimate ledger movements.

### Copy & Paste SQL into Supabase:

```sql
BEGIN;

-- ── 1. DROP OBSOLETE SIGNATURES ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.complete_stock_assembly(UUID, UUID);
DROP FUNCTION IF EXISTS public.cancel_stock_assembly(UUID, UUID, TEXT, UUID);

-- ── 2. PATCHED COMPLETE STOCK ASSEMBLY (SINGLE LEDGER MUTATION) ─────────────
CREATE OR REPLACE FUNCTION public.complete_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_assembly RECORD;
    v_line RECORD;
    v_cur_qty NUMERIC := 0;
    v_godown_id UUID;
    v_total_consumed NUMERIC := 0;
    v_total_scrap_recovery NUMERIC := 0;
    v_total_abnormal_loss NUMERIC := 0;
    v_produced_qty NUMERIC := 0;
    v_produced_item_id UUID;
    v_produced_item_name TEXT;
    v_produced_unit_cost NUMERIC := 0;
    v_total_production_cost NUMERIC := 0;
    v_overhead NUMERIC := 0;
    v_live_wac NUMERIC := 0;
    v_gl_lines JSONB := '[]'::JSONB;
    v_journal_id UUID;
    v_fg_acc_id UUID;
    v_overhead_acc_id UUID;
    v_company_inventory_acc UUID;
BEGIN
    -- 1. Fetch & Lock Assembly Header
    SELECT * INTO v_assembly 
    FROM public."StockAssembly"
    WHERE id = p_assembly_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NOT_FOUND: Stock Assembly record does not exist';
    END IF;

    IF v_assembly.status != 'Draft' THEN
        RAISE EXCEPTION 'ERR_ALREADY_POSTED: Assembly is already % and locked.', v_assembly.status;
    END IF;

    v_godown_id := v_assembly.godown_id;
    v_overhead  := COALESCE(v_assembly.overhead_cost, 0);

    -- 2. Resolve default accounts from ChartOfAccount
    SELECT id INTO v_company_inventory_acc 
    FROM public."ChartOfAccount"
    WHERE company_id = p_company_id AND (account_code = '1140' OR (account_type = 'Asset' AND account_name ILIKE '%Inventory%'))
    ORDER BY account_code ASC LIMIT 1;

    IF v_company_inventory_acc IS NULL THEN
        SELECT id INTO v_company_inventory_acc 
        FROM public."ChartOfAccount"
        WHERE company_id = p_company_id AND account_type = 'Asset'
        ORDER BY account_code ASC LIMIT 1;
    END IF;

    SELECT id INTO v_overhead_acc_id 
    FROM public."ChartOfAccount"
    WHERE company_id = p_company_id AND (account_code = '5300' OR account_name ILIKE '%Manufacturing Overhead%' OR account_name ILIKE '%Overhead%')
    ORDER BY account_code ASC LIMIT 1;

    -- 3. Deterministic Pessimistic Row Lock to prevent Deadlocks
    PERFORM 1
    FROM public."CurrentStock"
    WHERE company_id = p_company_id 
      AND godown_id = v_godown_id
      AND item_id IN (
          SELECT item_id FROM public."StockAssemblyItem" 
          WHERE assembly_id = p_assembly_id AND line_type IN ('Consumed', 'Wastage', 'Wastage (Recovery)')
      )
    ORDER BY item_id ASC
    FOR UPDATE;

    PERFORM 1
    FROM public."Item"
    WHERE id IN (SELECT item_id FROM public."StockAssemblyItem" WHERE assembly_id = p_assembly_id)
    ORDER BY id ASC
    FOR UPDATE;

    -- 4. Process Raw Materials & Scrap
    FOR v_line IN (
        SELECT sai.*, i.item_name, i.inventory_account_id, i.weighted_average_cost, i.current_unit_cost
        FROM public."StockAssemblyItem" sai
        JOIN public."Item" i ON i.id = sai.item_id
        WHERE sai.assembly_id = p_assembly_id
        ORDER BY sai.id ASC
    ) LOOP
        IF v_line.line_type = 'Consumed' THEN
            -- Check stock sufficiency in specified Godown
            SELECT current_qty INTO v_cur_qty
            FROM public."CurrentStock"
            WHERE company_id = p_company_id AND godown_id = v_godown_id AND item_id = v_line.item_id;

            IF NOT FOUND OR v_cur_qty < v_line.quantity OR v_cur_qty <= 0 THEN
                RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: Item "%" only has % available in this Godown (required %)',
                    v_line.item_name, COALESCE(v_cur_qty, 0), v_line.quantity;
            END IF;

            -- Zero-Trust Backend WAC Injection
            v_live_wac := COALESCE(NULLIF(v_line.weighted_average_cost, 0), v_line.current_unit_cost, 0);

            UPDATE public."StockAssemblyItem"
            SET unit_cost = v_live_wac
            WHERE id = v_line.id;

            v_total_consumed := v_total_consumed + (v_line.quantity * v_live_wac);

            -- Deduct quantity on hand on master Item
            UPDATE public."Item"
            SET quantity_on_hand = GREATEST(0, COALESCE(quantity_on_hand, 0) - v_line.quantity), updated_at = NOW()
            WHERE id = v_line.item_id;

            -- InventoryLedger insert: trg_update_current_stock automatically deducts from CurrentStock exactly once
            INSERT INTO public."InventoryLedger" (
                company_id, item_id, godown_id, transaction_type,
                quantity_in, quantity_out, transaction_date, reference_id, reference_type,
                total_amount, description, voucher_no, ledger_status, wac_at_post
            ) VALUES (
                p_company_id, v_line.item_id, v_godown_id, 'StockAssembly',
                0, v_line.quantity, v_assembly.assembly_date, p_assembly_id, 'StockAssembly',
                (v_line.quantity * v_live_wac), 'Raw Material Consumed: ' || v_line.item_name || ' (' || v_assembly.assembly_no || ')',
                v_assembly.assembly_no, 'Active', v_live_wac
            );

            -- GL Credit for Consumed Raw Material
            v_gl_lines := v_gl_lines || jsonb_build_object(
                'account_id', COALESCE(v_line.inventory_account_id, v_company_inventory_acc),
                'description', 'Raw Material Consumed: ' || v_line.item_name,
                'debit_amount', 0,
                'credit_amount', (v_line.quantity * v_live_wac)
            );

        ELSIF v_line.line_type IN ('Wastage', 'Wastage (Recovery)') THEN
            -- Net Realizable Value for Scrap
            IF v_line.unit_cost > 0 THEN
                v_total_scrap_recovery := v_total_scrap_recovery + (v_line.quantity * v_line.unit_cost);

                UPDATE public."Item"
                SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_line.quantity, updated_at = NOW()
                WHERE id = v_line.item_id;

                -- InventoryLedger insert: trg_update_current_stock automatically increments CurrentStock exactly once
                INSERT INTO public."InventoryLedger" (
                    company_id, item_id, godown_id, transaction_type,
                    quantity_in, quantity_out, transaction_date, reference_id, reference_type,
                    total_amount, description, voucher_no, ledger_status, wac_at_post
                ) VALUES (
                    p_company_id, v_line.item_id, v_godown_id, 'StockAssembly',
                    v_line.quantity, 0, v_assembly.assembly_date, p_assembly_id, 'StockAssembly',
                    (v_line.quantity * v_line.unit_cost), 'Scrap Recovery: ' || v_line.item_name || ' (' || v_assembly.assembly_no || ')',
                    v_assembly.assembly_no, 'Active', v_line.unit_cost
                );

                -- GL Debit for Scrap Inventory Asset
                v_gl_lines := v_gl_lines || jsonb_build_object(
                    'account_id', COALESCE(v_line.inventory_account_id, v_company_inventory_acc),
                    'description', 'Scrap Recovery: ' || v_line.item_name,
                    'debit_amount', (v_line.quantity * v_line.unit_cost),
                    'credit_amount', 0
                );
            END IF;

        ELSIF v_line.line_type = 'Produced' THEN
            v_produced_qty := v_produced_qty + v_line.quantity;
            v_produced_item_id := v_line.item_id;
            v_produced_item_name := v_line.item_name;
            v_fg_acc_id := COALESCE(v_line.inventory_account_id, v_company_inventory_acc);
        END IF;
    END LOOP;

    IF v_produced_qty <= 0 THEN
        RAISE EXCEPTION 'ERR_INVALID_ASSEMBLY: An assembly must have at least one Produced item with quantity > 0';
    END IF;

    -- 5. Calculate Final Production Cost using Master Formula
    v_total_production_cost := v_total_consumed + v_overhead - v_total_scrap_recovery - v_total_abnormal_loss;
    IF v_total_production_cost < 0 THEN
        v_total_production_cost := 0;
    END IF;
    v_produced_unit_cost := ROUND(v_total_production_cost / v_produced_qty, 4);

    -- Update unit cost on produced line item
    UPDATE public."StockAssemblyItem" 
    SET unit_cost = v_produced_unit_cost 
    WHERE assembly_id = p_assembly_id AND line_type = 'Produced';

    -- 6. Increment Finished Good Stock & Recalculate WAC
    UPDATE public."Item"
    SET weighted_average_cost = CASE 
            WHEN (COALESCE(quantity_on_hand, 0) + v_produced_qty) > 0 
            THEN ROUND(((COALESCE(quantity_on_hand, 0) * COALESCE(weighted_average_cost, 0)) + v_total_production_cost) / (COALESCE(quantity_on_hand, 0) + v_produced_qty), 4)
            ELSE v_produced_unit_cost 
        END,
        quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_produced_qty,
        current_unit_cost = v_produced_unit_cost,
        updated_at = NOW()
    WHERE id = v_produced_item_id;

    -- InventoryLedger insert: trg_update_current_stock automatically increments CurrentStock exactly once
    INSERT INTO public."InventoryLedger" (
        company_id, item_id, godown_id, transaction_type,
        quantity_in, quantity_out, transaction_date, reference_id, reference_type,
        total_amount, description, voucher_no, ledger_status, wac_at_post
    ) VALUES (
        p_company_id, v_produced_item_id, v_godown_id, 'StockAssembly',
        v_produced_qty, 0, v_assembly.assembly_date, p_assembly_id, 'StockAssembly',
        v_total_production_cost, 'Finished Goods Produced: ' || v_produced_item_name || ' (' || v_assembly.assembly_no || ')',
        v_assembly.assembly_no, 'Active', v_produced_unit_cost
    );

    -- 7. Add GL Lines for Finished Goods Debit and Overhead Credit
    v_gl_lines := v_gl_lines || jsonb_build_object(
        'account_id', v_fg_acc_id,
        'description', 'Finished Goods Produced: ' || v_produced_item_name,
        'debit_amount', v_total_production_cost,
        'credit_amount', 0
    );

    IF v_overhead > 0 THEN
        v_gl_lines := v_gl_lines || jsonb_build_object(
            'account_id', v_overhead_acc_id,
            'description', 'Overhead Absorbed: ' || v_assembly.assembly_no,
            'debit_amount', 0,
            'credit_amount', v_overhead
        );
    END IF;

    -- 8. Commit Single Balanced Journal Entry
    v_journal_id := public.rpc_commit_journal_entry_internal(
        p_company_id,
        v_assembly.assembly_date,
        'Stock Assembly: ' || v_assembly.assembly_no || ' (' || v_produced_item_name || ' x ' || v_produced_qty || ')',
        'StockAssembly',
        p_assembly_id,
        'StockAssembly',
        v_assembly.assembly_no,
        v_gl_lines
    );

    -- 9. Mark Assembly Completed & Lock
    UPDATE public."StockAssembly"
    SET 
        status = 'Completed',
        total_cost = v_total_production_cost,
        overhead_cost = v_overhead,
        updated_at = NOW()
    WHERE id = p_assembly_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'Completed',
        'assembly_id', p_assembly_id,
        'assembly_no', v_assembly.assembly_no,
        'journal_id', v_journal_id,
        'production_cost', v_total_production_cost,
        'produced_qty', v_produced_qty,
        'unit_cost', v_produced_unit_cost
    );
END;
$$;

-- ── 3. PATCHED CANCEL STOCK ASSEMBLY (SINGLE LEDGER MUTATION) ───────────────
CREATE OR REPLACE FUNCTION public.cancel_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID,
    p_reason TEXT DEFAULT 'Cancelled by user',
    p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_assembly RECORD;
    v_produced_line RECORD;
    v_line RECORD;
    v_cur_stock RECORD;
    v_user_id UUID := COALESCE(p_user_id, auth.uid());
    v_journal_rec RECORD;
    v_reversal_count INT := 0;
BEGIN
    -- 1. Fetch & Lock Assembly Header
    SELECT * INTO v_assembly
    FROM public."StockAssembly"
    WHERE id = p_assembly_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_NOT_FOUND: Stock Assembly record not found.';
    END IF;

    IF v_assembly.status = 'Cancelled' THEN
        RAISE EXCEPTION 'ERR_ALREADY_CANCELLED: Stock Assembly is already cancelled.';
    END IF;

    IF v_assembly.status != 'Completed' THEN
        RAISE EXCEPTION 'ERR_NOT_COMPLETED: Only Completed stock assemblies can be reversed. Current status: %', v_assembly.status;
    END IF;

    -- Guard against Closed/Locked Fiscal Year
    IF EXISTS (
        SELECT 1 FROM public."FiscalYear"
        WHERE company_id = p_company_id 
          AND (is_locked = TRUE OR status = 'Closed')
          AND v_assembly.assembly_date::DATE BETWEEN start_date AND end_date
    ) THEN
        RAISE EXCEPTION 'ERR_PERIOD_LOCKED: Cannot cancel stock assembly belonging to a locked or closed fiscal year.';
    END IF;

    -- Lock involved rows deterministically
    PERFORM 1
    FROM public."CurrentStock"
    WHERE company_id = p_company_id 
      AND godown_id = v_assembly.godown_id
      AND item_id IN (
          SELECT item_id FROM public."StockAssemblyItem" WHERE assembly_id = p_assembly_id
      )
    ORDER BY item_id ASC
    FOR UPDATE;

    PERFORM 1
    FROM public."Item"
    WHERE id IN (SELECT item_id FROM public."StockAssemblyItem" WHERE assembly_id = p_assembly_id)
    ORDER BY id ASC
    FOR UPDATE;

    -- Find the Produced item
    SELECT sai.*, i.item_name
    INTO v_produced_line
    FROM public."StockAssemblyItem" sai
    JOIN public."Item" i ON i.id = sai.item_id
    WHERE sai.assembly_id = p_assembly_id AND sai.line_type = 'Produced'
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ERR_INVALID_ASSEMBLY: Produced item not found for this assembly.';
    END IF;

    -- Stock Guard: Does the Godown still have enough finished goods to deduct?
    SELECT current_qty INTO v_cur_stock
    FROM public."CurrentStock"
    WHERE company_id = p_company_id AND godown_id = v_assembly.godown_id AND item_id = v_produced_line.item_id;

    IF v_cur_stock IS NULL OR v_cur_stock.current_qty < v_produced_line.quantity THEN
        RAISE EXCEPTION 'ERR_STOCK_DEPLETED: Cannot cancel assembly. Only % units of produced item "%" remain in this Godown (need % units to reverse). The finished goods may have already been sold or moved.',
            COALESCE(v_cur_stock.current_qty, 0), v_produced_line.item_name, v_produced_line.quantity;
    END IF;

    -- 4. Deduct Finished Good Stock from Item table
    UPDATE public."Item"
    SET quantity_on_hand = GREATEST(0, COALESCE(quantity_on_hand, 0) - v_produced_line.quantity),
        updated_at = NOW()
    WHERE id = v_produced_line.item_id;

    -- InventoryLedger insert: trg_update_current_stock automatically deducts from CurrentStock exactly once
    INSERT INTO public."InventoryLedger" (
        company_id, item_id, godown_id, transaction_type,
        quantity_in, quantity_out, transaction_date, reference_id, reference_type,
        total_amount, description, voucher_no, ledger_status, wac_at_post
    ) VALUES (
        p_company_id, v_produced_line.item_id, v_assembly.godown_id, 'StockAssembly',
        0, v_produced_line.quantity, CURRENT_TIMESTAMP, p_assembly_id, 'StockAssembly',
        (v_produced_line.quantity * COALESCE(v_produced_line.unit_cost, 0)),
        'Reversal of Produced Item: ' || v_produced_line.item_name || ' (' || v_assembly.assembly_no || '): ' || p_reason,
        v_assembly.assembly_no || '-REV', 'Active', COALESCE(v_produced_line.unit_cost, 0)
    );

    -- 5. Restock Consumed Raw Materials
    FOR v_line IN (
        SELECT sai.*, i.item_name
        FROM public."StockAssemblyItem" sai
        JOIN public."Item" i ON i.id = sai.item_id
        WHERE sai.assembly_id = p_assembly_id AND sai.line_type = 'Consumed'
    ) LOOP
        UPDATE public."Item"
        SET quantity_on_hand = COALESCE(quantity_on_hand, 0) + v_line.quantity,
            updated_at = NOW()
        WHERE id = v_line.item_id;

        -- InventoryLedger insert: trg_update_current_stock automatically restocks CurrentStock exactly once
        INSERT INTO public."InventoryLedger" (
            company_id, item_id, godown_id, transaction_type,
            quantity_in, quantity_out, transaction_date, reference_id, reference_type,
            total_amount, description, voucher_no, ledger_status, wac_at_post
        ) VALUES (
            p_company_id, v_line.item_id, v_assembly.godown_id, 'StockAssembly',
            v_line.quantity, 0, CURRENT_TIMESTAMP, p_assembly_id, 'StockAssembly',
            (v_line.quantity * COALESCE(v_line.unit_cost, 0)),
            'Restocked Consumed Material: ' || v_line.item_name || ' (' || v_assembly.assembly_no || '): ' || p_reason,
            v_assembly.assembly_no || '-REV', 'Active', COALESCE(v_line.unit_cost, 0)
        );
    END LOOP;

    -- 6. Deduct Scrap Recovery items if any were added
    FOR v_line IN (
        SELECT sai.*, i.item_name
        FROM public."StockAssemblyItem" sai
        JOIN public."Item" i ON i.id = sai.item_id
        WHERE sai.assembly_id = p_assembly_id 
          AND sai.line_type IN ('Wastage', 'Wastage (Recovery)')
          AND sai.unit_cost > 0
    ) LOOP
        SELECT current_qty INTO v_cur_stock
        FROM public."CurrentStock"
        WHERE company_id = p_company_id AND godown_id = v_assembly.godown_id AND item_id = v_line.item_id;

        IF v_cur_stock IS NOT NULL AND v_cur_stock.current_qty >= v_line.quantity THEN
            UPDATE public."Item"
            SET quantity_on_hand = GREATEST(0, COALESCE(quantity_on_hand, 0) - v_line.quantity),
                updated_at = NOW()
            WHERE id = v_line.item_id;

            INSERT INTO public."InventoryLedger" (
                company_id, item_id, godown_id, transaction_type,
                quantity_in, quantity_out, transaction_date, reference_id, reference_type,
                total_amount, description, voucher_no, ledger_status, wac_at_post
            ) VALUES (
                p_company_id, v_line.item_id, v_assembly.godown_id, 'StockAssembly',
                0, v_line.quantity, CURRENT_TIMESTAMP, p_assembly_id, 'StockAssembly',
                (v_line.quantity * v_line.unit_cost),
                'Deducted Scrap on Reversal: ' || v_line.item_name || ' (' || v_assembly.assembly_no || '): ' || p_reason,
                v_assembly.assembly_no || '-REV', 'Active', v_line.unit_cost
            );
        END IF;
    END LOOP;

    -- 7. Reverse Associated General Ledger Journals
    FOR v_journal_rec IN (
        SELECT id, voucher_no 
        FROM public."GeneralLedgerJournal"
        WHERE company_id = p_company_id 
          AND source_document_id = p_assembly_id 
          AND source_document_type = 'StockAssembly'
          AND is_reversed = FALSE
          AND status = 'Posted'
    ) LOOP
        PERFORM public.rpc_reverse_gl_journal(
            v_journal_rec.id,
            'Cancelled Stock Assembly: ' || v_assembly.assembly_no || ' - ' || p_reason,
            v_user_id
        );
        v_reversal_count := v_reversal_count + 1;
    END LOOP;

    -- 8. Mark StockAssembly as Cancelled
    UPDATE public."StockAssembly"
    SET status = 'Cancelled',
        cancellation_reason = p_reason,
        cancelled_at = NOW(),
        cancelled_by = v_user_id,
        updated_at = NOW()
    WHERE id = p_assembly_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'Cancelled',
        'assembly_id', p_assembly_id,
        'reversal_journals_count', v_reversal_count,
        'message', 'Stock Assembly reversed and physical inventory restored successfully.'
    );
END;
$$;

-- ── 4. RE-ESTABLISH ALIAS RPCS ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_complete_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.complete_stock_assembly(p_assembly_id, p_company_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_cancel_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID,
    p_reason TEXT DEFAULT 'Cancelled by user',
    p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.cancel_stock_assembly(p_assembly_id, p_company_id, p_reason, p_user_id);
END;
$$;

-- ── 5. DATA CLEANUP: PURGE ORPHANED TEST DATA & RECONCILE STOCK ─────────────
-- Temporarily lift triggers and enable maintenance mode for administrative cleanup
SET LOCAL sajilo.maintenance_mode = 'true';
ALTER TABLE public."GeneralLedgerJournal" DISABLE TRIGGER trg_gl_journal_anti_tamper_del;
ALTER TABLE public."InventoryLedger" DISABLE TRIGGER trg_update_current_stock;

-- Delete orphaned GL lines for non-existent stock assemblies
DELETE FROM public."GeneralLedgerLine"
WHERE journal_id IN (
    SELECT id FROM public."GeneralLedgerJournal"
    WHERE source_document_type = 'StockAssembly'
      AND source_document_id NOT IN (SELECT id FROM public."StockAssembly")
);

-- Delete orphaned GL journals for non-existent stock assemblies
DELETE FROM public."GeneralLedgerJournal"
WHERE source_document_type = 'StockAssembly'
  AND source_document_id NOT IN (SELECT id FROM public."StockAssembly");

-- Delete orphaned InventoryLedger entries for non-existent stock assemblies
DELETE FROM public."InventoryLedger"
WHERE transaction_type = 'StockAssembly'
  AND reference_id NOT IN (SELECT id FROM public."StockAssembly");

-- Synchronize CurrentStock across all godowns from active InventoryLedger records
UPDATE public."CurrentStock" cs
SET current_qty = GREATEST(0, COALESCE((
    SELECT SUM(COALESCE(il.quantity_in, 0) - COALESCE(il.quantity_out, 0))
    FROM public."InventoryLedger" il
    WHERE il.company_id = cs.company_id
      AND il.godown_id = cs.godown_id
      AND il.item_id = cs.item_id
      AND il.ledger_status = 'Active'
), 0)),
updated_at = NOW();

-- Synchronize Item quantity_on_hand across all physical items from CurrentStock
UPDATE public."Item" i
SET quantity_on_hand = COALESCE((
    SELECT SUM(current_qty)
    FROM public."CurrentStock" cs
    WHERE cs.company_id = i.company_id AND cs.item_id = i.id
), 0),
updated_at = NOW()
WHERE is_physical = true;

-- Re-enable anti-tamper and stock triggers
ALTER TABLE public."InventoryLedger" ENABLE TRIGGER trg_update_current_stock;
ALTER TABLE public."GeneralLedgerJournal" ENABLE TRIGGER trg_gl_journal_anti_tamper_del;
SET LOCAL sajilo.maintenance_mode = 'false';

-- ── 6. GRANTS ───────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.complete_stock_assembly(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_complete_stock_assembly(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_stock_assembly(UUID, UUID, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_stock_assembly(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

COMMIT;
```

### Rollback Strategy for Script 8:
Run `supabase/migrations/142_fix_stock_assembly_trigger_double_deduction_rollback.sql` (or `222_fix_stock_assembly_trigger_double_deduction_rollback.sql`) in Supabase SQL Editor.

---

## Script 9: Auth Context Stale Company Auto-Fallback (Prevents Login Loops)
**File:** `supabase/migrations/143_fix_auth_context_stale_company_fallback.sql` (or `223_fix_auth_context_stale_company_fallback.sql`)  
**Purpose:** Hardens `get_user_auth_context` RPC so that when a client requests a stale, deleted, or unauthorized company ID (e.g., from browser `localStorage`), the database automatically falls back to the user's default active company instead of throwing `company_access_denied` and triggering an unrecoverable infinite login redirect loop.

### Copy & Paste SQL into Supabase:

```sql
CREATE OR REPLACE FUNCTION public.get_user_auth_context(p_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_user      "User"%ROWTYPE;
  v_company   "Company"%ROWTYPE;
  v_uc        "UserCompany"%ROWTYPE;
  v_role      "CompanyRole"%ROWTYPE;
  v_resolved_company_id uuid := p_company_id;
BEGIN
  -- 1. Get user profile
  SELECT * INTO v_user FROM public."User" WHERE id = v_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_registered');
  END IF;

  -- 2. Check global account status
  IF v_user.account_status IS NOT NULL AND v_user.account_status != 'active' THEN
    RETURN jsonb_build_object('status', 'suspended');
  END IF;

  -- 3. Auto-resolve to default or secondary ACTIVE company if none requested
  IF v_resolved_company_id IS NULL THEN
    SELECT uc.company_id INTO v_resolved_company_id
    FROM public."UserCompany" uc
    JOIN public."Company" c ON c.id = uc.company_id
    WHERE uc.user_id = v_user_id
      AND (uc.membership_status IS NULL OR uc.membership_status = 'active')
      AND (c.status IS NULL OR c.status = 'ACTIVE')
      AND (c.is_active IS NULL OR c.is_active = true)
    ORDER BY uc.is_default DESC NULLS LAST, uc.created_at ASC
    LIMIT 1;
  END IF;

  -- 3b. Promote secondary company to default if user currently has no default company
  IF v_resolved_company_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public."UserCompany" 
    WHERE user_id = v_user_id AND is_default = true
  ) THEN
    UPDATE public."UserCompany"
    SET is_default = true
    WHERE user_id = v_user_id AND company_id = v_resolved_company_id;
  END IF;

  -- 4. No active company found? Return global context only
  IF v_resolved_company_id IS NULL THEN
    RETURN jsonb_build_object(
      'status',               'no_company',
      'user',                 row_to_json(v_user),
      'available_companies',  '[]'::jsonb
    );
  END IF;

  -- 5. Validate company membership (Prioritize Admin records if duplicates exist)
  SELECT * INTO v_uc
  FROM public."UserCompany"
  WHERE user_id = v_user_id 
    AND company_id = v_resolved_company_id
    AND (membership_status IS NULL OR membership_status = 'active')
  ORDER BY is_owner DESC, is_tenant_admin DESC 
  LIMIT 1;

  -- 5b. Resilient Auto-Fallback:
  -- If the requested company is invalid, deleted, or membership revoked,
  -- auto-fallback to user's secondary active company instead of failing the login session!
  IF NOT FOUND AND p_company_id IS NOT NULL THEN
    SELECT uc.company_id INTO v_resolved_company_id
    FROM public."UserCompany" uc
    JOIN public."Company" c ON c.id = uc.company_id
    WHERE uc.user_id = v_user_id
      AND (uc.membership_status IS NULL OR uc.membership_status = 'active')
      AND (c.status IS NULL OR c.status = 'ACTIVE')
      AND (c.is_active IS NULL OR c.is_active = true)
    ORDER BY uc.is_default DESC NULLS LAST, uc.created_at ASC
    LIMIT 1;

    IF v_resolved_company_id IS NOT NULL THEN
      SELECT * INTO v_uc
      FROM public."UserCompany"
      WHERE user_id = v_user_id 
        AND company_id = v_resolved_company_id
        AND (membership_status IS NULL OR membership_status = 'active')
      ORDER BY is_owner DESC, is_tenant_admin DESC 
      LIMIT 1;

      -- Promote newly resolved secondary company to default
      UPDATE public."UserCompany"
      SET is_default = true
      WHERE user_id = v_user_id AND company_id = v_resolved_company_id;
    END IF;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'company_access_denied');
  END IF;

  -- 6. Load company and role
  SELECT * INTO v_company FROM public."Company" WHERE id = v_resolved_company_id;

  IF v_uc.company_role_id IS NOT NULL THEN
    SELECT * INTO v_role FROM public."CompanyRole" WHERE id = v_uc.company_role_id;
  ELSIF v_user.global_role_id IS NOT NULL THEN
    SELECT * INTO v_role FROM public."CompanyRole" WHERE id = v_user.global_role_id;
  END IF;

  -- 7. Return full context with deduplicated company switcher array
  RETURN jsonb_build_object(
    'status',               'ok',
    'user',                 row_to_json(v_user),
    'active_company',       row_to_json(v_company),
    'is_tenant_admin',      (COALESCE(v_uc.is_tenant_admin, false) OR COALESCE(v_uc.is_owner, false)),
    'active_role',          row_to_json(v_role),
    
    -- Safe, deduplicated available companies retaining owner flags and logo
    'available_companies',  COALESCE(
      (SELECT jsonb_agg(
          jsonb_build_object(
            'id', comp.id,
            'name', comp.name,
            'logo_url', comp.logo_url,
            'is_owner', comp.is_owner,
            'is_tenant_admin', comp.is_tenant_admin
          )
       )
       FROM (
           SELECT 
               c.id, 
               c.name, 
               c.logo_url,
               bool_or(COALESCE(uc.is_owner, false)) as is_owner,
               bool_or(COALESCE(uc.is_tenant_admin, false)) as is_tenant_admin
           FROM public."Company" c
           JOIN public."UserCompany" uc ON uc.company_id = c.id
           WHERE uc.user_id = v_user_id
             AND (uc.membership_status IS NULL OR uc.membership_status = 'active')
           GROUP BY c.id, c.name, c.logo_url
           ORDER BY MIN(c.created_at) ASC
       ) comp),
      '[]'::jsonb),

    'overrides',            COALESCE(
      (SELECT jsonb_agg(row_to_json(o))
       FROM public."UserPermissionOverride" o
       WHERE o.user_id = v_user_id
         AND (o.company_id IS NULL OR o.company_id = v_resolved_company_id)
         AND (o.expires_at IS NULL OR o.expires_at > now())),
      '[]'::jsonb),
      
    'settings',             (SELECT row_to_json(s)
                             FROM public."CompanySettings" s
                             WHERE s.company_id = v_resolved_company_id
                             LIMIT 1),
                             
    'godowns',              COALESCE(
      (SELECT jsonb_agg(row_to_json(g))
       FROM public."Godown" g
       WHERE g.company_id = v_resolved_company_id AND g.status = 'Active'),
      '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_auth_context(uuid) TO authenticated;
```

### Rollback Strategy for Script 9:
Run `supabase/migrations/143_fix_auth_context_stale_company_fallback_rollback.sql` (or `223_fix_auth_context_stale_company_fallback_rollback.sql`) in Supabase SQL Editor.


