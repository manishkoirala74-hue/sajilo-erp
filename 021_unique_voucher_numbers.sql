ALTER TABLE "FinancialVoucher" ADD CONSTRAINT "FinancialVoucher_voucher_number_key" UNIQUE (voucher_number);
ALTER TABLE "SalesInvoice" ADD CONSTRAINT "SalesInvoice_invoice_number_key" UNIQUE (invoice_number);
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_invoice_number_key" UNIQUE (invoice_number);
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_return_number_key" UNIQUE (return_number);
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_return_number_key" UNIQUE (return_number);
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_adjustment_number_key" UNIQUE (adjustment_number);
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_quotation_number_key" UNIQUE (quotation_number);
