-- Add enable_bill_wise_entry to CompanySettings
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS enable_bill_wise_entry BOOLEAN DEFAULT false;

-- Add paid_amount to SalesInvoice
ALTER TABLE "SalesInvoice" ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;

-- Add paid_amount to PurchaseInvoice
ALTER TABLE "PurchaseInvoice" ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;

-- Add bill_allocations to FinancialVoucher
ALTER TABLE "FinancialVoucher" ADD COLUMN IF NOT EXISTS bill_allocations JSONB;

-- Add bill_allocations to GeneralLedgerJournal
ALTER TABLE "GeneralLedgerJournal" ADD COLUMN IF NOT EXISTS bill_allocations JSONB;
