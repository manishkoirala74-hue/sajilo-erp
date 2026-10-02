-- =============================================================================
-- Migration: 128_fiscal_year_indexes.sql
-- Description: Non-blocking creation of composite B-Tree indexes for transaction 
-- date columns. Optimizes the EXISTS checks in fiscal year RPCs.
-- Note: CONCURRENTLY cannot run inside a transaction block.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_gl_journal_date ON public."GeneralLedgerJournal" (company_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_date ON public."SalesInvoice" (company_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchase_invoice_date ON public."PurchaseInvoice" (company_id, invoice_date);
CREATE INDEX IF NOT EXISTS idx_sales_order_date ON public."SalesOrder" (company_id, order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_order_date ON public."PurchaseOrder" (company_id, order_date);
CREATE INDEX IF NOT EXISTS idx_sales_return_date ON public."SalesReturn" (company_id, return_date);
CREATE INDEX IF NOT EXISTS idx_purchase_return_date ON public."PurchaseReturn" (company_id, return_date);
CREATE INDEX IF NOT EXISTS idx_financial_voucher_date ON public."FinancialVoucher" (company_id, voucher_date);
CREATE INDEX IF NOT EXISTS idx_stock_adjustment_date ON public."StockAdjustment" (company_id, adjustment_date);
CREATE INDEX IF NOT EXISTS idx_pos_sale_date ON public."POSSale" (company_id, sale_date);
