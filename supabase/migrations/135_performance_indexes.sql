-- ============================================================================
-- 135_performance_indexes.sql
--
-- Sajilo ERP Enterprise Performance Optimization: Multi-Tenant Indexes
-- Adds high-cardinality B-tree composite indexes on tenant columns, status flags,
-- date ordering, and foreign keys across verified core tables.
--
-- Rollback : 135_performance_indexes_rollback.sql
-- ============================================================================

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

-- 5. Master Data Lookups (Using verified column names)
CREATE INDEX IF NOT EXISTS idx_item_company_cat_active 
  ON "Item"(company_id, category_id, is_active);

CREATE INDEX IF NOT EXISTS idx_partner_company_customer 
  ON "BusinessPartner"(company_id, is_customer, is_active);

CREATE INDEX IF NOT EXISTS idx_partner_company_vendor 
  ON "BusinessPartner"(company_id, is_vendor, is_active);

CREATE INDEX IF NOT EXISTS idx_coa_company_code 
  ON "ChartOfAccount"(company_id, account_code);

-- 6. Tenancy & RLS Performance (Critical for auth subqueries)
CREATE INDEX IF NOT EXISTS idx_usercompany_lookup 
  ON "UserCompany"(user_id, company_id, membership_status);

-- 7. Analytics Rollups
CREATE INDEX IF NOT EXISTS idx_daily_metrics_company_date 
  ON "DailyMetricsRollup"(company_id, metric_date DESC);

COMMIT;
