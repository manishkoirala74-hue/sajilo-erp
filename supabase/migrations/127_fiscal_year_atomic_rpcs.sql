-- =============================================================================
-- Migration: 127_fiscal_year_atomic_rpcs.sql
-- Description: Hardens fiscal year management with:
--   1. btree_gist exclusion constraint (DB-level overlap prevention)
--   2. create_new_fiscal_year RPC (atomic create + auto-soft-close)
--   3. delete_empty_fiscal_year RPC (safe deletion, FOR UPDATE locking)
--   4. correct_fiscal_year_dates RPC (date correction, orphan-based, FOR UPDATE)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exclude_overlapping_fiscal_years'
  ) THEN
    ALTER TABLE public."FiscalYear"
    ADD CONSTRAINT exclude_overlapping_fiscal_years
    EXCLUDE USING gist (
      company_id WITH =,
      daterange(start_date, end_date, '[]') WITH &&
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: create_new_fiscal_year
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_new_fiscal_year(
  p_company_id  UUID,
  p_name        TEXT,
  p_start_date  DATE,
  p_end_date    DATE,
  p_status      TEXT DEFAULT 'OPEN'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_fy_id UUID;
  v_days      INTEGER;
BEGIN
  -- Strict Admin Guard
  IF NOT EXISTS (
    SELECT 1 FROM public."UserCompany" uc
    JOIN public."CompanyRole" cr ON uc.role_id = cr.id
    WHERE uc.user_id = auth.uid() 
      AND uc.company_id = p_company_id
      AND cr.name IN ('Admin', 'Owner')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied: Admin privileges required.');
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Fiscal year name is required.');
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Start date and end date are required.');
  END IF;
  IF p_end_date <= p_start_date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'End date must be after start date.');
  END IF;

  v_days := (p_end_date - p_start_date);
  IF v_days < 28 THEN
    RETURN jsonb_build_object('ok', false, 'error', format('Fiscal year must span at least 28 days (given: %s days).', v_days));
  END IF;
  IF v_days > 400 THEN
    RETURN jsonb_build_object('ok', false, 'error', format('Fiscal year cannot exceed 400 days (given: %s days).', v_days));
  END IF;
  IF p_status NOT IN ('OPEN', 'SOFT_CLOSED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Status must be OPEN or SOFT_CLOSED.');
  END IF;

  IF p_status = 'OPEN' THEN
    UPDATE public."FiscalYear"
    SET status = 'SOFT_CLOSED', updated_at = NOW()
    WHERE company_id = p_company_id AND status = 'OPEN';

    INSERT INTO public."SecurityAuditLog" (company_id, actor_id, action_type, details, created_at)
    VALUES (p_company_id, auth.uid(), 'AUTO_SOFT_CLOSE_FY', jsonb_build_object('reason', 'New OPEN fiscal year created: ' || p_name, 'triggered_by', auth.uid()), NOW());
  END IF;

  BEGIN
    INSERT INTO public."FiscalYear" (company_id, fiscal_year_name, start_date, end_date, status, created_at, updated_at)
    VALUES (p_company_id, p_name, p_start_date, p_end_date, p_status, NOW(), NOW())
    RETURNING id INTO v_new_fy_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Dates overlap with an existing fiscal year for this company.');
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'A fiscal year with this name already exists.');
  END;

  INSERT INTO public."SecurityAuditLog" (company_id, actor_id, action_type, details, created_at)
  VALUES (p_company_id, auth.uid(), 'CREATE_FISCAL_YEAR', jsonb_build_object('fy_id', v_new_fy_id, 'name', p_name, 'start', p_start_date, 'end', p_end_date, 'status', p_status), NOW());

  RETURN jsonb_build_object('ok', true, 'fy_id', v_new_fy_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_new_fiscal_year(UUID, TEXT, DATE, DATE, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: delete_empty_fiscal_year
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_empty_fiscal_year(
  p_company_id  UUID,
  p_fy_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy            RECORD;
  v_was_open      BOOLEAN;
BEGIN
  -- Strict Admin Guard
  IF NOT EXISTS (
    SELECT 1 FROM public."UserCompany" uc
    JOIN public."CompanyRole" cr ON uc.role_id = cr.id
    WHERE uc.user_id = auth.uid() 
      AND uc.company_id = p_company_id
      AND cr.name IN ('Admin', 'Owner')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied: Admin privileges required.');
  END IF;

  -- Lock the row to prevent concurrent inserts matching this window
  SELECT * INTO v_fy
  FROM public."FiscalYear"
  WHERE id = p_fy_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Fiscal year not found.');
  END IF;

  IF v_fy.status = 'HARD_CLOSED' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'HARD_CLOSED fiscal years cannot be deleted. They are legally locked for statutory audit.');
  END IF;

  -- Orphan Check: Sub-Ledger transactions (10 tables)
  IF EXISTS (SELECT 1 FROM public."GeneralLedgerJournal" WHERE company_id = p_company_id AND entry_date BETWEEN v_fy.start_date AND v_fy.end_date LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot delete: General Ledger Journal entries exist within this fiscal year window. Void or delete those records first, then retry.');
  END IF;
  IF EXISTS (SELECT 1 FROM public."SalesInvoice" WHERE company_id = p_company_id AND invoice_date BETWEEN v_fy.start_date AND v_fy.end_date LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot delete: Sales Invoices exist within this fiscal year window.');
  END IF;
  IF EXISTS (SELECT 1 FROM public."PurchaseInvoice" WHERE company_id = p_company_id AND invoice_date BETWEEN v_fy.start_date AND v_fy.end_date LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot delete: Purchase Invoices exist within this fiscal year window.');
  END IF;
  IF EXISTS (SELECT 1 FROM public."SalesOrder" WHERE company_id = p_company_id AND order_date BETWEEN v_fy.start_date AND v_fy.end_date LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot delete: Sales Orders exist within this fiscal year window.');
  END IF;
  IF EXISTS (SELECT 1 FROM public."PurchaseOrder" WHERE company_id = p_company_id AND order_date BETWEEN v_fy.start_date AND v_fy.end_date LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot delete: Purchase Orders exist within this fiscal year window.');
  END IF;
  IF EXISTS (SELECT 1 FROM public."SalesReturn" WHERE company_id = p_company_id AND return_date BETWEEN v_fy.start_date AND v_fy.end_date LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot delete: Sales Returns exist within this fiscal year window.');
  END IF;
  IF EXISTS (SELECT 1 FROM public."PurchaseReturn" WHERE company_id = p_company_id AND return_date BETWEEN v_fy.start_date AND v_fy.end_date LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot delete: Purchase Returns exist within this fiscal year window.');
  END IF;
  IF EXISTS (SELECT 1 FROM public."FinancialVoucher" WHERE company_id = p_company_id AND voucher_date BETWEEN v_fy.start_date AND v_fy.end_date LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot delete: Financial Vouchers exist within this fiscal year window.');
  END IF;
  IF EXISTS (SELECT 1 FROM public."StockAdjustment" WHERE company_id = p_company_id AND adjustment_date BETWEEN v_fy.start_date AND v_fy.end_date LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot delete: Stock Adjustments exist within this fiscal year window.');
  END IF;
  IF EXISTS (SELECT 1 FROM public."POSSale" WHERE company_id = p_company_id AND sale_date BETWEEN v_fy.start_date AND v_fy.end_date LIMIT 1) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot delete: POS Sales exist within this fiscal year window.');
  END IF;

  v_was_open := (v_fy.status = 'OPEN');

  DELETE FROM public."FiscalYear"
  WHERE id = p_fy_id AND company_id = p_company_id;

  INSERT INTO public."SecurityAuditLog" (company_id, actor_id, action_type, details, created_at)
  VALUES (p_company_id, auth.uid(), 'DELETE_FISCAL_YEAR', jsonb_build_object('fy_id', p_fy_id, 'name', v_fy.fiscal_year_name, 'start', v_fy.start_date, 'end', v_fy.end_date, 'status', v_fy.status), NOW());

  -- Explicitly returning no_open_fy flag. UI must force manual re-open.
  RETURN jsonb_build_object('ok', true, 'deleted_name', v_fy.fiscal_year_name, 'no_open_fy', v_was_open);
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_empty_fiscal_year(UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: correct_fiscal_year_dates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correct_fiscal_year_dates(
  p_company_id  UUID,
  p_fy_id       UUID,
  p_new_start   DATE,
  p_new_end     DATE,
  p_reason      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fy            RECORD;
  v_days          INTEGER;
  v_orphan_count  INTEGER;
BEGIN
  -- Strict Admin Guard
  IF NOT EXISTS (
    SELECT 1 FROM public."UserCompany" uc
    JOIN public."CompanyRole" cr ON uc.role_id = cr.id
    WHERE uc.user_id = auth.uid() 
      AND uc.company_id = p_company_id
      AND cr.name IN ('Admin', 'Owner')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied: Admin privileges required.');
  END IF;

  -- Lock the row
  SELECT * INTO v_fy
  FROM public."FiscalYear"
  WHERE id = p_fy_id AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Fiscal year not found.');
  END IF;
  IF v_fy.status <> 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only OPEN fiscal years can have their dates corrected. Use Re-Open to unlock a closed year first.');
  END IF;
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A justification reason is required.');
  END IF;
  IF p_new_end <= p_new_start THEN
    RETURN jsonb_build_object('ok', false, 'error', 'End date must be after start date.');
  END IF;

  v_days := (p_new_end - p_new_start);
  IF v_days < 28 THEN
    RETURN jsonb_build_object('ok', false, 'error', format('Fiscal year must span at least 28 days (given: %s days).', v_days));
  END IF;
  IF v_days > 400 THEN
    RETURN jsonb_build_object('ok', false, 'error', format('Fiscal year cannot exceed 400 days (given: %s days).', v_days));
  END IF;

  -- Orphan Check (Only blocks if existing transactions fall OUTSIDE the newly proposed window)
  -- 1. GeneralLedgerJournal
  SELECT COUNT(*) INTO v_orphan_count FROM public."GeneralLedgerJournal"
  WHERE company_id = p_company_id AND entry_date BETWEEN v_fy.start_date AND v_fy.end_date AND entry_date NOT BETWEEN p_new_start AND p_new_end;
  IF v_orphan_count > 0 THEN RETURN jsonb_build_object('ok', false, 'error', format('Cannot shrink dates: %s General Ledger entries would fall outside the new window.', v_orphan_count)); END IF;
  
  -- 2. SalesInvoice
  SELECT COUNT(*) INTO v_orphan_count FROM public."SalesInvoice"
  WHERE company_id = p_company_id AND invoice_date BETWEEN v_fy.start_date AND v_fy.end_date AND invoice_date NOT BETWEEN p_new_start AND p_new_end;
  IF v_orphan_count > 0 THEN RETURN jsonb_build_object('ok', false, 'error', format('Cannot shrink dates: %s Sales Invoices would fall outside the new window.', v_orphan_count)); END IF;
  
  -- 3. PurchaseInvoice
  SELECT COUNT(*) INTO v_orphan_count FROM public."PurchaseInvoice"
  WHERE company_id = p_company_id AND invoice_date BETWEEN v_fy.start_date AND v_fy.end_date AND invoice_date NOT BETWEEN p_new_start AND p_new_end;
  IF v_orphan_count > 0 THEN RETURN jsonb_build_object('ok', false, 'error', format('Cannot shrink dates: %s Purchase Invoices would fall outside the new window.', v_orphan_count)); END IF;

  -- 4. SalesOrder
  SELECT COUNT(*) INTO v_orphan_count FROM public."SalesOrder"
  WHERE company_id = p_company_id AND order_date BETWEEN v_fy.start_date AND v_fy.end_date AND order_date NOT BETWEEN p_new_start AND p_new_end;
  IF v_orphan_count > 0 THEN RETURN jsonb_build_object('ok', false, 'error', format('Cannot shrink dates: %s Sales Orders would fall outside the new window.', v_orphan_count)); END IF;

  -- 5. PurchaseOrder
  SELECT COUNT(*) INTO v_orphan_count FROM public."PurchaseOrder"
  WHERE company_id = p_company_id AND order_date BETWEEN v_fy.start_date AND v_fy.end_date AND order_date NOT BETWEEN p_new_start AND p_new_end;
  IF v_orphan_count > 0 THEN RETURN jsonb_build_object('ok', false, 'error', format('Cannot shrink dates: %s Purchase Orders would fall outside the new window.', v_orphan_count)); END IF;

  -- 6. SalesReturn
  SELECT COUNT(*) INTO v_orphan_count FROM public."SalesReturn"
  WHERE company_id = p_company_id AND return_date BETWEEN v_fy.start_date AND v_fy.end_date AND return_date NOT BETWEEN p_new_start AND p_new_end;
  IF v_orphan_count > 0 THEN RETURN jsonb_build_object('ok', false, 'error', format('Cannot shrink dates: %s Sales Returns would fall outside the new window.', v_orphan_count)); END IF;

  -- 7. PurchaseReturn
  SELECT COUNT(*) INTO v_orphan_count FROM public."PurchaseReturn"
  WHERE company_id = p_company_id AND return_date BETWEEN v_fy.start_date AND v_fy.end_date AND return_date NOT BETWEEN p_new_start AND p_new_end;
  IF v_orphan_count > 0 THEN RETURN jsonb_build_object('ok', false, 'error', format('Cannot shrink dates: %s Purchase Returns would fall outside the new window.', v_orphan_count)); END IF;

  -- 8. FinancialVoucher
  SELECT COUNT(*) INTO v_orphan_count FROM public."FinancialVoucher"
  WHERE company_id = p_company_id AND voucher_date BETWEEN v_fy.start_date AND v_fy.end_date AND voucher_date NOT BETWEEN p_new_start AND p_new_end;
  IF v_orphan_count > 0 THEN RETURN jsonb_build_object('ok', false, 'error', format('Cannot shrink dates: %s Financial Vouchers would fall outside the new window.', v_orphan_count)); END IF;

  -- 9. StockAdjustment
  SELECT COUNT(*) INTO v_orphan_count FROM public."StockAdjustment"
  WHERE company_id = p_company_id AND adjustment_date BETWEEN v_fy.start_date AND v_fy.end_date AND adjustment_date NOT BETWEEN p_new_start AND p_new_end;
  IF v_orphan_count > 0 THEN RETURN jsonb_build_object('ok', false, 'error', format('Cannot shrink dates: %s Stock Adjustments would fall outside the new window.', v_orphan_count)); END IF;

  -- 10. POSSale
  SELECT COUNT(*) INTO v_orphan_count FROM public."POSSale"
  WHERE company_id = p_company_id AND sale_date BETWEEN v_fy.start_date AND v_fy.end_date AND sale_date NOT BETWEEN p_new_start AND p_new_end;
  IF v_orphan_count > 0 THEN RETURN jsonb_build_object('ok', false, 'error', format('Cannot shrink dates: %s POS Sales would fall outside the new window.', v_orphan_count)); END IF;

  BEGIN
    UPDATE public."FiscalYear"
    SET start_date = p_new_start, end_date = p_new_end, updated_at = NOW()
    WHERE id = p_fy_id AND company_id = p_company_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'New dates overlap with an existing fiscal year.');
  END;

  INSERT INTO public."SecurityAuditLog" (company_id, actor_id, action_type, details, created_at)
  VALUES (p_company_id, auth.uid(), 'CORRECT_FISCAL_YEAR_DATES', jsonb_build_object('fy_id', p_fy_id, 'name', v_fy.fiscal_year_name, 'old_start', v_fy.start_date, 'old_end', v_fy.end_date, 'new_start', p_new_start, 'new_end', p_new_end, 'reason', p_reason), NOW());

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.correct_fiscal_year_dates(UUID, UUID, DATE, DATE, TEXT) TO authenticated;
