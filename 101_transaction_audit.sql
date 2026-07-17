-- 101_transaction_audit.sql
-- Comprehensive Audit Script to Verify ERP Transaction Integrity

WITH unbalanced_journals AS (
    SELECT id, source_document_id, entry_date 
    FROM "GeneralLedgerJournal" 
    WHERE is_balanced = false
),
missing_sales_legs AS (
    SELECT j.id, j.source_document_id
    FROM "GeneralLedgerJournal" j
    WHERE j.source_document_type = 'SalesInvoice'
    AND NOT EXISTS (
        SELECT 1 FROM "GeneralLedgerLine" l
        JOIN "ChartOfAccount" a ON a.id = l.account_id
        WHERE l.journal_id = j.id AND (a.account_type ILIKE '%receivable%' OR a.account_name ILIKE '%receivable%' OR a.account_type ILIKE '%cash%' OR a.account_type ILIKE '%bank%')
    )
),
missing_purchase_legs AS (
    SELECT j.id, j.source_document_id
    FROM "GeneralLedgerJournal" j
    WHERE j.source_document_type = 'PurchaseInvoice'
    AND NOT EXISTS (
        SELECT 1 FROM "GeneralLedgerLine" l
        JOIN "ChartOfAccount" a ON a.id = l.account_id
        WHERE l.journal_id = j.id AND (a.account_type ILIKE '%payable%' OR a.account_name ILIKE '%payable%' OR a.account_type ILIKE '%cash%' OR a.account_type ILIKE '%bank%')
    )
),
missing_cogs_legs AS (
    SELECT si.id, si.invoice_number
    FROM "SalesInvoice" si
    JOIN "GeneralLedgerJournal" j ON j.source_document_id = si.id
    WHERE si.status = 'Posted'
    AND EXISTS (
        -- Check if the invoice has at least one physical item sold
        SELECT 1 FROM jsonb_array_elements(si.line_items) AS item
        JOIN "Item" i ON i.id = (item->>'item_id')::UUID
        WHERE i.is_physical = true
    )
    AND NOT EXISTS (
        -- Verify that a COGS leg exists in the journal
        SELECT 1 FROM "GeneralLedgerLine" l
        JOIN "ChartOfAccount" a ON a.id = l.account_id
        WHERE l.journal_id = j.id AND (a.account_type ILIKE '%expense%' OR a.account_type ILIKE '%cogs%' OR a.account_type ILIKE '%cost of%')
    )
),
metric_discrepancies AS (
    SELECT 'Sales' as metric_type, 
           (SELECT COALESCE(SUM(total_sales_amount), 0) FROM "DailyMetricsRollup") as expected,
           (SELECT COALESCE(SUM(grand_total), 0) FROM "SalesInvoice" WHERE status = 'Posted') as actual
    UNION ALL
    SELECT 'Purchases' as metric_type,
           (SELECT COALESCE(SUM(total_purchases_amount), 0) FROM "DailyMetricsRollup") as expected,
           (SELECT COALESCE(SUM(grand_total), 0) FROM "PurchaseInvoice" WHERE status = 'Posted') as actual
)
SELECT 
    (SELECT COUNT(*) FROM unbalanced_journals) as unbalanced_journal_count,
    (SELECT COUNT(*) FROM missing_sales_legs) as invalid_sales_journals_count,
    (SELECT COUNT(*) FROM missing_purchase_legs) as invalid_purchase_journals_count,
    (SELECT COUNT(*) FROM missing_cogs_legs) as missing_cogs_sales_count,
    (SELECT json_agg(row_to_json(md)) FROM metric_discrepancies md) as metrics_check;
