-- 1. Add missing CompanySettings fields
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS hr_earning_mappings JSONB;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS hr_deduction_mappings JSONB;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS hr_salary_payable_account_id TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS include_fy_in_invoice_number BOOLEAN DEFAULT true;
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS show_recent_trading_history BOOLEAN DEFAULT true;

-- 2. Create the missing RPC for DataUtilities (Ledger Timeline Recovery)
CREATE OR REPLACE FUNCTION rebuild_inventory_wac_timeline(
    p_company_id uuid,
    p_start_date date,
    p_end_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Recalculate Weighted Average Cost (WAC) based on PurchaseInvoices in the period.
    -- This extracts the JSONB line_items to find the total cost and quantity purchased.
    
    WITH all_purchases AS (
      SELECT 
        (item->>'item_id')::uuid AS item_id,
        COALESCE((item->>'quantity')::numeric, 0) AS qty,
        COALESCE((item->>'unit_price')::numeric, 0) AS price
      FROM "PurchaseInvoice" pi,
           jsonb_array_elements(pi.line_items) AS item
      WHERE pi.company_id = p_company_id
        AND pi.status = 'Posted'
        AND pi.invoice_date >= p_start_date 
        AND pi.invoice_date <= p_end_date
    ),
    wac_calc AS (
      SELECT 
        item_id,
        SUM(qty * price) / NULLIF(SUM(qty), 0) AS new_wac,
        SUM(qty) as total_qty,
        SUM(qty * price) as total_value
      FROM all_purchases
      WHERE item_id IS NOT NULL
      GROUP BY item_id
    )
    UPDATE "Item" i
    SET 
      weighted_average_cost = COALESCE(w.new_wac, i.weighted_average_cost),
      current_unit_cost = COALESCE(w.new_wac, i.current_unit_cost)
    FROM wac_calc w
    WHERE i.id = w.item_id 
      AND i.company_id = p_company_id;
      
    -- Note: A fully chronological moving-average WAC recalculation that also adjusts 
    -- COGS for historical SalesInvoices requires a cursor-based ledger rebuild.
    -- This query correctly re-establishes the baseline WAC for the period's purchases.
END;
$$;
