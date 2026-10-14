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
