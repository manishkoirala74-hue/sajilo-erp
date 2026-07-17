-- Check if total_purchases_amount column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'DailyMetricsRollup' AND column_name = 'total_purchases_amount';

-- Check total sum of purchases in the rollup table
SELECT SUM(total_purchases_amount) as total_purchases_in_rollup
FROM "DailyMetricsRollup";

-- Check actual sum of posted purchase invoices
SELECT SUM(grand_total) as actual_total_purchases
FROM "PurchaseInvoice"
WHERE status = 'Posted';
