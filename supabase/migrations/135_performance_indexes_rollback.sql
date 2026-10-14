-- ============================================================================
-- 135_performance_indexes_rollback.sql
--
-- Rollback for 135_performance_indexes.sql
-- Drops the B-tree composite performance indexes added in migration 135.
-- ============================================================================

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
