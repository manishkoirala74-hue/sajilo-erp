-- ============================================================================
-- 130_bank_reconciliation_schema.sql
-- Enterprise Bank Reconciliation Engine: Sessions, Batch Lines, & Atomic RPCs
-- ============================================================================

BEGIN;

-- 1. Bank Reconciliation Session Header
CREATE TABLE IF NOT EXISTS public."BankReconciliation" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES public."BankAccount"(id) ON DELETE RESTRICT,
  gl_account_id UUID NOT NULL REFERENCES public."ChartOfAccount"(id) ON DELETE RESTRICT,
  statement_date DATE NOT NULL,
  statement_balance NUMERIC NOT NULL DEFAULT 0,
  book_balance NUMERIC NOT NULL DEFAULT 0,
  bank_charges NUMERIC NOT NULL DEFAULT 0,
  bank_interest NUMERIC NOT NULL DEFAULT 0,
  adjustments_amount NUMERIC NOT NULL DEFAULT 0,
  reconciled_balance NUMERIC NOT NULL DEFAULT 0,
  difference_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Reconciled', 'Locked')),
  notes TEXT,
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  CONSTRAINT uq_bank_recon_statement UNIQUE (company_id, bank_account_id, statement_date)
);

CREATE INDEX IF NOT EXISTS idx_bank_recon_company_date 
  ON public."BankReconciliation" (company_id, bank_account_id, statement_date DESC);

ALTER TABLE public."BankReconciliation" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'BankReconciliation' AND policyname = 'select_BankReconciliation'
  ) THEN
    CREATE POLICY "select_BankReconciliation" ON public."BankReconciliation"
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM public."UserCompany" WHERE company_id = "BankReconciliation".company_id AND user_id = auth.uid())
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'BankReconciliation' AND policyname = 'insert_BankReconciliation'
  ) THEN
    CREATE POLICY "insert_BankReconciliation" ON public."BankReconciliation"
      FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public."UserCompany" WHERE company_id = "BankReconciliation".company_id AND user_id = auth.uid())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'BankReconciliation' AND policyname = 'update_BankReconciliation'
  ) THEN
    CREATE POLICY "update_BankReconciliation" ON public."BankReconciliation"
      FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public."UserCompany" WHERE company_id = "BankReconciliation".company_id AND user_id = auth.uid())
      ) WITH CHECK (
        EXISTS (SELECT 1 FROM public."UserCompany" WHERE company_id = "BankReconciliation".company_id AND user_id = auth.uid())
      );
  END IF;
END $$;

-- 2. Line-Level Clearing Tracking
CREATE TABLE IF NOT EXISTS public."BankReconciliationLine" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
  reconciliation_id UUID REFERENCES public."BankReconciliation"(id) ON DELETE SET NULL,
  gl_line_id UUID NOT NULL,
  journal_id UUID NOT NULL,
  voucher_no TEXT,
  reference_no TEXT,
  transaction_date DATE NOT NULL,
  cleared_date DATE,
  is_cleared BOOLEAN NOT NULL DEFAULT false,
  line_type TEXT NOT NULL CHECK (line_type IN ('Cheque', 'Deposit', 'BankCharge', 'BankInterest', 'Adjustment')),
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_recon_line_gl UNIQUE (company_id, gl_line_id)
);

CREATE INDEX IF NOT EXISTS idx_recon_line_lookup 
  ON public."BankReconciliationLine" (company_id, gl_line_id);

CREATE INDEX IF NOT EXISTS idx_recon_line_cleared_date 
  ON public."BankReconciliationLine" (company_id, cleared_date, is_cleared);

ALTER TABLE public."BankReconciliationLine" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'BankReconciliationLine' AND policyname = 'all_BankReconciliationLine'
  ) THEN
    CREATE POLICY "all_BankReconciliationLine" ON public."BankReconciliationLine"
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public."UserCompany" WHERE company_id = "BankReconciliationLine".company_id AND user_id = auth.uid())
      );
  END IF;
END $$;

-- 3. Dedicated Read RPC: get_bank_reconciliation_report
CREATE OR REPLACE FUNCTION public.get_bank_reconciliation_report(
  p_company_id         UUID,
  p_bank_account_id    UUID,
  p_statement_date     DATE,
  p_statement_balance  NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_gl_account_id      UUID;
  v_bank_name          TEXT;
  v_account_no         TEXT;
  v_currency           TEXT;
  v_book_balance       NUMERIC := 0;
  v_uncleared_cheques  JSONB;
  v_uncleared_deposits JSONB;
  v_cleared_items      JSONB;
  v_total_uncleared_cheques  NUMERIC := 0;
  v_total_uncleared_deposits NUMERIC := 0;
  v_total_cleared_cheques    NUMERIC := 0;
  v_total_cleared_deposits   NUMERIC := 0;
  v_bank_charges       NUMERIC := 0;
  v_bank_interest      NUMERIC := 0;
  v_adjustments        NUMERIC := 0;
  v_saved_recon        RECORD;
BEGIN
  -- Strict Workspace Authorization
  IF NOT EXISTS (
    SELECT 1 FROM public."UserCompany"
    WHERE company_id = p_company_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Resolve Bank Account & GL Mapping
  SELECT gl_account_id::UUID, account_name, account_number, currency
  INTO v_gl_account_id, v_bank_name, v_account_no, v_currency
  FROM public."BankAccount"
  WHERE id = p_bank_account_id AND company_id = p_company_id;

  IF v_gl_account_id IS NULL THEN
    RAISE EXCEPTION 'Selected bank account has no mapped GL account';
  END IF;

  -- 1. Compute Live ERP Book Balance up to statement_date
  SELECT COALESCE(SUM(gll.debit_amount - gll.credit_amount), 0)
  INTO v_book_balance
  FROM public."GeneralLedgerLine" gll
  JOIN public."GeneralLedgerJournal" glj ON glj.id = gll.journal_id::UUID
  WHERE gll.company_id = p_company_id
    AND gll.account_id::UUID = v_gl_account_id
    AND glj.status = 'Posted'
    AND glj.entry_date::DATE <= p_statement_date;

  -- 2. Check for Saved Reconciliation Session
  SELECT * INTO v_saved_recon
  FROM public."BankReconciliation"
  WHERE company_id = p_company_id
    AND bank_account_id = p_bank_account_id
    AND statement_date = p_statement_date
  LIMIT 1;

  IF v_saved_recon.id IS NOT NULL THEN
    v_bank_charges := v_saved_recon.bank_charges;
    v_bank_interest := v_saved_recon.bank_interest;
    v_adjustments := v_saved_recon.adjustments_amount;
  END IF;

  -- 3. Query Payments (Cheques) up to cutoff
  WITH payments AS (
    SELECT 
      gll.id AS gl_line_id,
      glj.id AS journal_id,
      glj.voucher_no,
      COALESCE(fv.reference_no, glj.source_document_id, '—') AS cheque_no,
      glj.entry_date::DATE AS transaction_date,
      gll.description AS narration,
      gll.credit_amount AS amount,
      COALESCE(rl.is_cleared, false) AS is_cleared,
      rl.cleared_date
    FROM public."GeneralLedgerLine" gll
    JOIN public."GeneralLedgerJournal" glj ON glj.id = gll.journal_id::UUID
    LEFT JOIN public."FinancialVoucher" fv ON fv.id = glj.source_document_id::UUID
    LEFT JOIN public."BankReconciliationLine" rl ON rl.gl_line_id = gll.id
    WHERE gll.company_id = p_company_id
      AND gll.account_id::UUID = v_gl_account_id
      AND glj.status = 'Posted'
      AND gll.credit_amount > 0
      AND glj.entry_date::DATE <= p_statement_date
  )
  SELECT 
    COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.transaction_date ASC) FILTER (WHERE NOT p.is_cleared OR p.cleared_date > p_statement_date), '[]'::jsonb),
    COALESCE(SUM(p.amount) FILTER (WHERE NOT p.is_cleared OR p.cleared_date > p_statement_date), 0),
    COALESCE(SUM(p.amount) FILTER (WHERE p.is_cleared AND p.cleared_date <= p_statement_date), 0)
  INTO v_uncleared_cheques, v_total_uncleared_cheques, v_total_cleared_cheques
  FROM payments p;

  -- 4. Query Receipts (Deposits) up to cutoff
  WITH receipts AS (
    SELECT 
      gll.id AS gl_line_id,
      glj.id AS journal_id,
      glj.voucher_no,
      COALESCE(fv.reference_no, glj.source_document_id, '—') AS slip_no,
      glj.entry_date::DATE AS transaction_date,
      gll.description AS narration,
      gll.debit_amount AS amount,
      COALESCE(rl.is_cleared, false) AS is_cleared,
      rl.cleared_date
    FROM public."GeneralLedgerLine" gll
    JOIN public."GeneralLedgerJournal" glj ON glj.id = gll.journal_id::UUID
    LEFT JOIN public."FinancialVoucher" fv ON fv.id = glj.source_document_id::UUID
    LEFT JOIN public."BankReconciliationLine" rl ON rl.gl_line_id = gll.id
    WHERE gll.company_id = p_company_id
      AND gll.account_id::UUID = v_gl_account_id
      AND glj.status = 'Posted'
      AND gll.debit_amount > 0
      AND glj.entry_date::DATE <= p_statement_date
  )
  SELECT 
    COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.transaction_date ASC) FILTER (WHERE NOT r.is_cleared OR r.cleared_date > p_statement_date), '[]'::jsonb),
    COALESCE(SUM(r.amount) FILTER (WHERE NOT r.is_cleared OR r.cleared_date > p_statement_date), 0),
    COALESCE(SUM(r.amount) FILTER (WHERE r.is_cleared AND r.cleared_date <= p_statement_date), 0)
  INTO v_uncleared_deposits, v_total_uncleared_deposits, v_total_cleared_deposits
  FROM receipts r;

  -- 5. Query All Cleared Items for Period
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.cleared_date DESC), '[]'::jsonb)
  INTO v_cleared_items
  FROM (
    SELECT 
      rl.gl_line_id, rl.voucher_no, rl.reference_no, rl.transaction_date, 
      rl.cleared_date, rl.line_type, rl.amount, rl.notes
    FROM public."BankReconciliationLine" rl
    WHERE rl.company_id = p_company_id
      AND rl.is_cleared = true
      AND rl.cleared_date <= p_statement_date
  ) c;

  RETURN jsonb_build_object(
    'bank_account', jsonb_build_object(
      'id', p_bank_account_id,
      'account_name', v_bank_name,
      'account_number', v_account_no,
      'currency', COALESCE(v_currency, 'NPR')
    ),
    'statement_date', p_statement_date,
    'statement_balance', p_statement_balance,
    'book_balance', v_book_balance,
    'total_uncleared_cheques', v_total_uncleared_cheques,
    'total_uncleared_deposits', v_total_uncleared_deposits,
    'total_cleared_cheques', v_total_cleared_cheques,
    'total_cleared_deposits', v_total_cleared_deposits,
    'bank_charges', v_bank_charges,
    'bank_interest', v_bank_interest,
    'adjustments', v_adjustments,
    'uncleared_cheques', v_uncleared_cheques,
    'uncleared_deposits', v_uncleared_deposits,
    'cleared_items', v_cleared_items,
    'session_status', COALESCE(v_saved_recon.status, 'Draft'),
    'reconciliation_id', v_saved_recon.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_bank_reconciliation_report(UUID, UUID, DATE, NUMERIC) TO authenticated;

-- 4. Dedicated Batch Save RPC: save_bank_reconciliation_session
CREATE OR REPLACE FUNCTION public.save_bank_reconciliation_session(
  p_company_id         UUID,
  p_bank_account_id    UUID,
  p_statement_date     DATE,
  p_statement_balance  NUMERIC,
  p_book_balance       NUMERIC,
  p_bank_charges       NUMERIC,
  p_bank_interest      NUMERIC,
  p_adjustments        NUMERIC,
  p_reconciled_balance NUMERIC,
  p_difference_amount  NUMERIC,
  p_status             TEXT,
  p_notes              TEXT,
  p_line_updates       JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_recon_id UUID;
  v_gl_account_id UUID;
  v_line RECORD;
BEGIN
  -- Strict Workspace Authorization
  IF NOT EXISTS (
    SELECT 1 FROM public."UserCompany"
    WHERE company_id = p_company_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT gl_account_id::UUID INTO v_gl_account_id
  FROM public."BankAccount"
  WHERE id = p_bank_account_id AND company_id = p_company_id;

  -- 1. Upsert Session Header
  INSERT INTO public."BankReconciliation" (
    company_id, bank_account_id, gl_account_id, statement_date,
    statement_balance, book_balance, bank_charges, bank_interest,
    adjustments_amount, reconciled_balance, difference_amount, status,
    notes, reconciled_at, updated_at, updated_by
  ) VALUES (
    p_company_id, p_bank_account_id, v_gl_account_id, p_statement_date,
    p_statement_balance, p_book_balance, p_bank_charges, p_bank_interest,
    p_adjustments, p_reconciled_balance, p_difference_amount, p_status,
    p_notes, CASE WHEN p_status = 'Reconciled' THEN now() ELSE NULL END, now(), auth.uid()
  )
  ON CONFLICT (company_id, bank_account_id, statement_date)
  DO UPDATE SET
    statement_balance  = EXCLUDED.statement_balance,
    book_balance       = EXCLUDED.book_balance,
    bank_charges       = EXCLUDED.bank_charges,
    bank_interest      = EXCLUDED.bank_interest,
    adjustments_amount = EXCLUDED.adjustments_amount,
    reconciled_balance = EXCLUDED.reconciled_balance,
    difference_amount  = EXCLUDED.difference_amount,
    status             = EXCLUDED.status,
    notes              = EXCLUDED.notes,
    reconciled_at      = CASE WHEN EXCLUDED.status = 'Reconciled' THEN now() ELSE "BankReconciliation".reconciled_at END,
    updated_at         = now(),
    updated_by         = auth.uid()
  RETURNING id INTO v_recon_id;

  -- 2. Atomic Batch Upsert for Line Clearances
  IF p_line_updates IS NOT NULL AND jsonb_array_length(p_line_updates) > 0 THEN
    FOR v_line IN SELECT * FROM jsonb_to_recordset(p_line_updates) AS (
      gl_line_id UUID, journal_id UUID, voucher_no TEXT, reference_no TEXT,
      transaction_date DATE, cleared_date DATE, is_cleared BOOLEAN,
      line_type TEXT, amount NUMERIC
    )
    LOOP
      INSERT INTO public."BankReconciliationLine" (
        company_id, reconciliation_id, gl_line_id, journal_id,
        voucher_no, reference_no, transaction_date, cleared_date,
        is_cleared, line_type, amount, updated_at
      ) VALUES (
        p_company_id, v_recon_id, v_line.gl_line_id, v_line.journal_id,
        v_line.voucher_no, v_line.reference_no, v_line.transaction_date,
        v_line.cleared_date, v_line.is_cleared, v_line.line_type, v_line.amount, now()
      )
      ON CONFLICT (company_id, gl_line_id)
      DO UPDATE SET
        reconciliation_id = v_recon_id,
        cleared_date      = EXCLUDED.cleared_date,
        is_cleared        = EXCLUDED.is_cleared,
        updated_at        = now();
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reconciliation_id', v_recon_id,
    'status', p_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_bank_reconciliation_session(UUID, UUID, DATE, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, JSONB) TO authenticated;

COMMIT;
