-- 061_purchase_price_history_views.sql
-- Migration to add views for Purchase Price Change History Report

-- 1. Create the chronological history view of all purchase invoice line items
CREATE OR REPLACE VIEW vw_purchase_price_history WITH (security_invoker = true) AS
SELECT
    p.company_id,
    p.id as invoice_id,
    p.invoice_number,
    p.invoice_date,
    p.vendor_id,
    p.vendor_name,
    (line_item->>'item_id')::uuid as item_id,
    line_item->>'item_code' as item_code,
    line_item->>'item_name' as item_name,
    i.category_id,
    c.category_name,
    (line_item->>'unit_price')::numeric as unit_price,
    (line_item->>'quantity')::numeric as quantity,
    p.created_at
FROM
    "PurchaseInvoice" p
    CROSS JOIN jsonb_array_elements(p.line_items) AS line_item
    LEFT JOIN "Item" i ON i.id = (line_item->>'item_id')::uuid
    LEFT JOIN "ItemCategory" c ON c.id = i.category_id
WHERE
    p.status = 'Posted';

-- 2. Create the latest purchase price view for the master table
CREATE OR REPLACE VIEW vw_latest_purchase_price WITH (security_invoker = true) AS
SELECT DISTINCT ON (item_id)
    company_id,
    item_id,
    item_code,
    item_name,
    category_id,
    category_name,
    unit_price,
    vendor_name,
    invoice_date,
    created_at
FROM vw_purchase_price_history
ORDER BY item_id, invoice_date DESC, created_at DESC;

-- Grant permissions
GRANT SELECT ON vw_purchase_price_history TO authenticated;
GRANT SELECT ON vw_latest_purchase_price TO authenticated;
GRANT SELECT ON vw_purchase_price_history TO service_role;
GRANT SELECT ON vw_latest_purchase_price TO service_role;
