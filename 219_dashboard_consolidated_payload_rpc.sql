-- ============================================================================
-- 219_dashboard_consolidated_payload_rpc.sql
--
-- Sajilo ERP Enterprise Performance Optimization: Single-Roundtrip Dashboard
-- Replaces 6-10 separate HTTP requests on dashboard load with a single
-- high-speed, server-side consolidated JSON payload.
--
-- Rollback : 219_dashboard_consolidated_payload_rpc_rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_dashboard_analytics_payload(
  p_company_id  UUID,
  p_start_date  DATE,
  p_end_date    DATE,
  p_as_of_date  DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_summary           JSONB;
  v_daily_metrics     JSONB;
  v_recent_sales      JSONB;
  v_recent_bills      JSONB;
  v_pending_approvals JSONB;
  v_cash_bank         JSONB := '{"cash_balance": 0, "bank_balance": 0, "total": 0}'::jsonb;
BEGIN
  -- 1. Security Guard (Allows service_role admin bypass; enforces active membership for authenticated users)
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "UserCompany"
    WHERE user_id = auth.uid()
      AND company_id = p_company_id
      AND (membership_status IS NULL OR membership_status = 'active')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- 2. Aggregate MTD Summary KPIs
  SELECT jsonb_build_object(
    'total_sales', COALESCE(SUM(total_sales_amount), 0),
    'total_purchases', COALESCE(SUM(total_purchases_amount), 0),
    'unpaid_sales_count', COALESCE((
      SELECT COUNT(*) FROM "SalesInvoice"
      WHERE company_id = p_company_id AND status = 'Posted' AND payment_status = 'Unpaid'
    ), 0),
    'total_items', COALESCE((SELECT COUNT(*) FROM "Item" WHERE company_id = p_company_id), 0),
    'active_items', COALESCE((SELECT COUNT(*) FROM "Item" WHERE company_id = p_company_id AND COALESCE(is_active, true) = true), 0),
    'low_stock_items', COALESCE((
      SELECT COUNT(*) FROM "Item"
      WHERE company_id = p_company_id
        AND COALESCE(quantity_on_hand, 0) <= COALESCE(reorder_level, 0)
        AND COALESCE(reorder_level, 0) > 0
    ), 0),
    'total_customers', COALESCE((SELECT COUNT(*) FROM "BusinessPartner" WHERE company_id = p_company_id AND is_customer = true), 0),
    'active_customers', COALESCE((SELECT COUNT(*) FROM "BusinessPartner" WHERE company_id = p_company_id AND is_customer = true AND COALESCE(is_active, true) = true), 0),
    'total_vendors', COALESCE((SELECT COUNT(*) FROM "BusinessPartner" WHERE company_id = p_company_id AND is_vendor = true), 0)
  ) INTO v_summary
  FROM "DailyMetricsRollup"
  WHERE company_id = p_company_id
    AND metric_date >= p_start_date
    AND metric_date <= p_end_date;

  -- 3. Daily Metrics Rollup Array (Chronological 6-Month Rolling)
  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.metric_date ASC), '[]'::jsonb)
  INTO v_daily_metrics
  FROM "DailyMetricsRollup" d
  WHERE d.company_id = p_company_id
    AND d.metric_date >= p_start_date
    AND d.metric_date <= p_end_date;

  -- 4. Recent Sales Invoices (5)
  SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
  INTO v_recent_sales
  FROM (
    SELECT id, invoice_number, grand_total, status, payment_status, created_at, invoice_date, customer_id, customer_name
    FROM "SalesInvoice"
    WHERE company_id = p_company_id
    ORDER BY created_at DESC LIMIT 5
  ) s;

  -- 5. Recent Purchase Bills (5)
  SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb)
  INTO v_recent_bills
  FROM (
    SELECT id, invoice_number, vendor_invoice_no, grand_total, status, payment_status, created_at, invoice_date, vendor_id, vendor_name
    FROM "PurchaseInvoice"
    WHERE company_id = p_company_id
    ORDER BY created_at DESC LIMIT 5
  ) p;

  -- 6. Pending Approvals (Purchase Orders)
  SELECT COALESCE(jsonb_agg(row_to_json(po)), '[]'::jsonb)
  INTO v_pending_approvals
  FROM (
    SELECT id, po_number, total_amount, status, created_at
    FROM "PurchaseOrder"
    WHERE company_id = p_company_id AND status = 'Pending Approval'
    ORDER BY created_at DESC LIMIT 10
  ) po;

  -- 7. Cash & Bank Balance (Safe resolution with error isolation)
  BEGIN
    v_cash_bank := public.get_cash_bank_balance(p_company_id, p_as_of_date);
  EXCEPTION WHEN OTHERS THEN
    v_cash_bank := '{"cash_balance": 0, "bank_balance": 0, "total": 0}'::jsonb;
  END;

  -- 8. Return Consolidated Payload
  RETURN jsonb_build_object(
    'summary', v_summary,
    'daily_metrics', v_daily_metrics,
    'recent_sales', v_recent_sales,
    'recent_bills', v_recent_bills,
    'pending_approvals', v_pending_approvals,
    'cash_bank', v_cash_bank
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_analytics_payload(UUID, DATE, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_analytics_payload(UUID, DATE, DATE, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_dashboard_analytics_payload(UUID, DATE, DATE, DATE) TO anon;
