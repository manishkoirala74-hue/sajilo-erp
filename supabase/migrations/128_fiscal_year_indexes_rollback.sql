-- =============================================================================
-- Migration Rollback: 128_fiscal_year_indexes_rollback.sql
-- Description: Reverts 128_fiscal_year_indexes.sql
-- =============================================================================

DROP INDEX IF EXISTS idx_gl_journal_date;
DROP INDEX IF EXISTS idx_sales_invoice_date;
DROP INDEX IF EXISTS idx_purchase_invoice_date;
DROP INDEX IF EXISTS idx_sales_order_date;
DROP INDEX IF EXISTS idx_purchase_order_date;
DROP INDEX IF EXISTS idx_sales_return_date;
DROP INDEX IF EXISTS idx_purchase_return_date;
DROP INDEX IF EXISTS idx_financial_voucher_date;
DROP INDEX IF EXISTS idx_stock_adjustment_date;
DROP INDEX IF EXISTS idx_pos_sale_date;
