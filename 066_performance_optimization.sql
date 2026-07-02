-- 066_performance_optimization.sql
-- Optimizes RLS and adds indexes for massive speedups

-- 1. Alter RLS checking function to be STABLE instead of VOLATILE
-- This allows Postgres to cache the result per statement for the same company_id
CREATE OR REPLACE FUNCTION public.user_has_company_access(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."User" 
    WHERE id = auth.uid() AND is_super_admin = true
  ) THEN
    RETURN TRUE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."UserCompany" 
    WHERE company_id = p_company_id AND user_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 2. Add performance indexes for RLS tenant isolation checks
CREATE INDEX IF NOT EXISTS idx_usercompany_user_company ON public."UserCompany"(user_id, company_id);
CREATE INDEX IF NOT EXISTS idx_user_id_superadmin ON public."User"(id, is_super_admin);

-- 3. Add index on company_id for all major transactional tables
CREATE INDEX IF NOT EXISTS idx_purchaseinvoice_company ON public."PurchaseInvoice"(company_id);
CREATE INDEX IF NOT EXISTS idx_salesinvoice_company ON public."SalesInvoice"(company_id);
CREATE INDEX IF NOT EXISTS idx_inventoryledger_company ON public."InventoryLedger"(company_id);
CREATE INDEX IF NOT EXISTS idx_currentstock_company ON public."CurrentStock"(company_id);
CREATE INDEX IF NOT EXISTS idx_item_company ON public."Item"(company_id);
CREATE INDEX IF NOT EXISTS idx_businesspartner_company ON public."BusinessPartner"(company_id);
CREATE INDEX IF NOT EXISTS idx_chartofaccount_company ON public."ChartOfAccount"(company_id);

-- Also add index for status on Invoices for faster filtering
CREATE INDEX IF NOT EXISTS idx_purchaseinvoice_status ON public."PurchaseInvoice"(status);
CREATE INDEX IF NOT EXISTS idx_salesinvoice_status ON public."SalesInvoice"(status);
