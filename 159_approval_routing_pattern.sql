-- 159_approval_routing_pattern.sql
-- Implements the Approval Queue Routing Pattern.
-- Replaces the Fail-Hard (RAISE EXCEPTION) approach with a non-blocking
-- status downgrade to 'Pending_Approval' + ApprovalQueue routing.
-- notification_sent BOOLEAN enables async background email worker polling.

BEGIN;

-- 1. ApprovalQueue table
CREATE TABLE IF NOT EXISTS public."ApprovalQueue" (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  document_type     TEXT NOT NULL, -- 'SalesInvoice' | 'PurchaseInvoice' | 'PurchaseOrder' | 'FinancialVoucher'
  document_id       UUID NOT NULL,
  requested_by      UUID NOT NULL,
  requested_at      TIMESTAMPTZ DEFAULT NOW(),
  amount            NUMERIC(18,2) NOT NULL,
  approval_limit    NUMERIC(18,2) NOT NULL, -- snapshot at time of submission
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by       UUID,
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT,
  notification_sent BOOLEAN DEFAULT false, -- polled by async background email worker
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public."ApprovalQueue" ENABLE ROW LEVEL SECURITY;

-- SELECT: submitter sees own; admins/owners see all in company
CREATE POLICY "select_ApprovalQueue" ON public."ApprovalQueue" FOR SELECT USING (
  requested_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public."UserCompany" uc
    WHERE uc.user_id::text = auth.uid()::text
      AND uc.company_id = public."ApprovalQueue".company_id
      AND (uc.is_tenant_admin = true OR uc.is_owner = true)
  )
);

-- INSERT: any active company member
CREATE POLICY "insert_ApprovalQueue" ON public."ApprovalQueue" FOR INSERT WITH CHECK (
  company_id IN (
    SELECT uc2.company_id::uuid
    FROM public."UserCompany" uc2
    WHERE uc2.user_id::text = auth.uid()::text
  )
);

-- UPDATE: only admins/owners can change status; background worker can set notification_sent
CREATE POLICY "update_ApprovalQueue" ON public."ApprovalQueue" FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public."UserCompany" uc
    WHERE uc.user_id::text = auth.uid()::text
      AND uc.company_id = public."ApprovalQueue".company_id
      AND (uc.is_tenant_admin = true OR uc.is_owner = true)
  )
)
WITH CHECK (
  status IN ('approved', 'rejected')
  OR (status = 'pending' AND notification_sent IS DISTINCT FROM false)
);

-- 2. Approval Routing Function
CREATE OR REPLACE FUNCTION public.route_for_approval_if_needed(
  p_company_id    UUID,
  p_document_type TEXT,
  p_document_id   UUID,
  p_amount        NUMERIC,
  p_submitted_by  UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings  RECORD;
  v_queue_id  UUID;
  v_is_admin  BOOLEAN;
BEGIN
  -- Safe: UNIQUE(company_id) guarantees at most 1 row (DEVELOPMENT_CHECKLIST §1)
  SELECT enable_approvals, approval_limit_amount
  INTO v_settings
  FROM public."CompanySettings"
  WHERE company_id = p_company_id
  LIMIT 1;

  IF NOT FOUND OR v_settings.enable_approvals IS NOT TRUE THEN
    RETURN jsonb_build_object('routed', false);
  END IF;

  IF p_amount <= COALESCE(v_settings.approval_limit_amount, 50000) THEN
    RETURN jsonb_build_object('routed', false);
  END IF;

  -- SECURITY: Strict allowlist guard before dynamic SQL execution.
  -- Prevents malicious table name injection (e.g. p_document_type = 'User').
  IF p_document_type NOT IN ('SalesInvoice', 'PurchaseInvoice', 'PurchaseOrder', 'FinancialVoucher') THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT_TYPE: % is not eligible for approval routing.', p_document_type
    USING ERRCODE = 'P0004';
  END IF;

  -- Admins bypass the approval gate.
  -- DEVELOPMENT_CHECKLIST §1: bool_or for privilege aggregation across duplicate rows.
  SELECT bool_or(COALESCE(uc.is_tenant_admin, false) OR COALESCE(uc.is_owner, false))
  INTO v_is_admin
  FROM public."UserCompany" uc
  WHERE uc.user_id::text = p_submitted_by::text
    AND uc.company_id = p_company_id;

  IF COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('routed', false);
  END IF;

  -- Downgrade document status to 'Pending_Approval'
  EXECUTE format(
    'UPDATE public.%I SET status = ''Pending_Approval'' WHERE id = $1 AND company_id = $2',
    p_document_type
  ) USING p_document_id, p_company_id;

  -- Insert into ApprovalQueue
  INSERT INTO public."ApprovalQueue" (
    company_id, document_type, document_id,
    requested_by, amount, approval_limit
  ) VALUES (
    p_company_id, p_document_type, p_document_id,
    p_submitted_by, p_amount, v_settings.approval_limit_amount
  ) RETURNING id INTO v_queue_id;

  RETURN jsonb_build_object('routed', true, 'queue_id', v_queue_id);
END;
$$;

-- DEVELOPMENT_CHECKLIST: Explicit RPC Execution Grant
GRANT EXECUTE ON FUNCTION public.route_for_approval_if_needed(UUID, TEXT, UUID, NUMERIC, UUID) TO authenticated;

COMMIT;
