CREATE OR REPLACE FUNCTION get_dashboard_summary(p_company_id uuid, p_start_date date, p_end_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_total_sales numeric;
  v_total_purchases numeric;
  v_unpaid_sales_count int;
  v_total_items int;
  v_active_items int;
  v_low_stock_items int;
  v_total_customers int;
  v_active_customers int;
  v_total_vendors int;
BEGIN
  -- Validate user membership
  IF NOT EXISTS (
    SELECT 1 FROM "UserCompany" 
    WHERE user_id = auth.uid() AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- 1. Total Sales & Purchases from DailyMetricsRollup within date range
  SELECT 
    COALESCE(SUM(total_sales_amount), 0),
    COALESCE(SUM(total_purchases_amount), 0)
  INTO v_total_sales, v_total_purchases
  FROM "DailyMetricsRollup"
  WHERE company_id = p_company_id 
    AND metric_date >= p_start_date 
    AND metric_date <= p_end_date;

  -- 2. Unpaid Sales Count
  SELECT COUNT(*) INTO v_unpaid_sales_count
  FROM "SalesInvoice"
  WHERE company_id = p_company_id
    AND status = 'Posted'
    AND payment_status = 'Unpaid';

  -- 3. Items metrics
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE COALESCE(is_active, true) = true),
    COUNT(*) FILTER (WHERE COALESCE(quantity_on_hand, 0) <= COALESCE(reorder_level, 0) AND COALESCE(reorder_level, 0) > 0)
  INTO v_total_items, v_active_items, v_low_stock_items
  FROM "Item"
  WHERE company_id = p_company_id;

  -- 4. Customer & Vendor metrics
  SELECT 
    COUNT(*) FILTER (WHERE is_customer = true),
    COUNT(*) FILTER (WHERE is_customer = true AND COALESCE(is_active, true) = true),
    COUNT(*) FILTER (WHERE is_vendor = true)
  INTO v_total_customers, v_active_customers, v_total_vendors
  FROM "BusinessPartner"
  WHERE company_id = p_company_id;

  -- Return payload
  RETURN jsonb_build_object(
    'total_sales', v_total_sales,
    'total_purchases', v_total_purchases,
    'unpaid_sales_count', v_unpaid_sales_count,
    'total_items', v_total_items,
    'active_items', v_active_items,
    'low_stock_items', v_low_stock_items,
    'total_customers', v_total_customers,
    'active_customers', v_active_customers,
    'total_vendors', v_total_vendors
  );
END;
$$;
