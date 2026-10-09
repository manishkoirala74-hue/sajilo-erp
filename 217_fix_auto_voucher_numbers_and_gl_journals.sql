-- ============================================================================
-- 217_fix_auto_voucher_numbers_and_gl_journals.sql
-- Fixes "AUTO" voucher numbers across Sales, Purchases, POS, Returns, Reversals,
-- and ensures GeneralLedgerJournal / GeneralLedgerLine always store and display
-- the actual generated document number and meaningful descriptions.
-- ============================================================================

BEGIN;

-- ─── 1. ENHANCED VOUCHER SEQUENCE GENERATOR (Add SalesReturn & PurchaseReturn) ───
CREATE OR REPLACE FUNCTION get_next_voucher_number(
    p_company_id UUID,
    p_voucher_type TEXT,
    p_date DATE
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_fy RECORD;
    v_seq RECORD;
    v_config RECORD;
    v_result TEXT;
    v_prefix TEXT;
    v_suffix TEXT;
    v_fy_prefix TEXT := '';
    v_padding INTEGER := 5;
    v_effective_padding INTEGER;
    v_starting_no INTEGER := 1;
    v_number_str TEXT;
BEGIN
    IF p_date IS NULL THEN
        p_date := CURRENT_DATE;
    END IF;

    -- 1. Resolve Fiscal Year
    SELECT * INTO v_fy FROM "FiscalYear" 
    WHERE company_id = p_company_id AND p_date BETWEEN start_date AND end_date LIMIT 1;
    
    IF NOT FOUND THEN
        SELECT * INTO v_fy FROM "FiscalYear" 
        WHERE company_id = p_company_id ORDER BY start_date DESC LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No Fiscal Year found for company % on date %', p_company_id, p_date;
    END IF;

    -- 2. Fetch Dynamic Config for Document Type
    SELECT * INTO v_config FROM "DocumentSequenceConfig"
    WHERE company_id = p_company_id AND document_type = p_voucher_type AND is_active = true LIMIT 1;

    IF FOUND THEN
        v_prefix := COALESCE(v_config.prefix, '');
        v_suffix := COALESCE(v_config.suffix, '');
        v_padding := COALESCE(v_config.padding, 5);
        v_starting_no := COALESCE(v_config.starting_number, 1);
        IF COALESCE(v_config.include_fy_prefix, true) THEN
            v_fy_prefix := v_fy.fiscal_year_name || '-';
        END IF;
    ELSE
        -- Default Fallbacks if config row is not yet seeded
        IF p_voucher_type = 'SalesInvoice' THEN v_prefix := 'SI';
        ELSIF p_voucher_type = 'PurchaseInvoice' THEN v_prefix := 'PI';
        ELSIF p_voucher_type = 'SalesOrder' THEN v_prefix := 'SO';
        ELSIF p_voucher_type = 'PurchaseOrder' THEN v_prefix := 'PO';
        ELSIF p_voucher_type = 'Quotation' THEN v_prefix := 'QT';
        ELSIF p_voucher_type = 'Receipt' THEN v_prefix := 'RV';
        ELSIF p_voucher_type = 'Payment' THEN v_prefix := 'PV';
        ELSIF p_voucher_type = 'Journal' THEN v_prefix := 'JV';
        ELSIF p_voucher_type = 'Contra' THEN v_prefix := 'CV';
        ELSIF p_voucher_type = 'StockAdjustment' THEN v_prefix := 'ADJ';
        ELSIF p_voucher_type = 'SalesReturn' THEN v_prefix := 'SR';
        ELSIF p_voucher_type = 'PurchaseReturn' THEN v_prefix := 'PR';
        ELSIF p_voucher_type = 'POS' OR p_voucher_type = 'POSSale' THEN v_prefix := 'POS';
        ELSE v_prefix := UPPER(SUBSTRING(p_voucher_type FROM 1 FOR 3));
        END IF;
        
        v_suffix := '';
        v_fy_prefix := v_fy.fiscal_year_name || '-';
        v_padding := 5;
        v_starting_no := 1;
    END IF;

    -- 3. Lock sequence row for concurrency control (FOR UPDATE)
    SELECT * INTO v_seq FROM "VoucherSequence" 
    WHERE company_id = p_company_id AND fiscal_year_id = v_fy.id AND voucher_type = p_voucher_type
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO "VoucherSequence" (company_id, fiscal_year_id, voucher_type, current_number)
        VALUES (p_company_id, v_fy.id, p_voucher_type, v_starting_no)
        RETURNING * INTO v_seq;
    ELSE
        UPDATE "VoucherSequence" SET current_number = current_number + 1 
        WHERE id = v_seq.id RETURNING * INTO v_seq;
    END IF;

    -- 4. Dynamic Padding Floor Safeguard (Prevent Truncation)
    v_effective_padding := GREATEST(v_padding, LENGTH(v_seq.current_number::TEXT));
    v_number_str := LPAD(v_seq.current_number::TEXT, v_effective_padding, '0');

    -- 5. Build Final Formatted Voucher String
    IF v_prefix != '' AND v_prefix NOT LIKE '%-' AND v_prefix NOT LIKE '%/' THEN
        v_prefix := v_prefix || '-';
    END IF;

    v_result := v_prefix || v_fy_prefix || v_number_str || v_suffix;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_voucher_number(UUID, TEXT, DATE) TO authenticated;


-- ─── 2. AUTO-NUMBERING TRIGGERS FOR SALES RETURN & PURCHASE RETURN ────────────
CREATE OR REPLACE FUNCTION auto_generate_voucher_number_sr() RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status IS NULL OR NEW.status IN ('Completed', 'Posted', 'Saved', 'Approved')) THEN
        IF (TG_OP = 'INSERT' AND (NEW.return_number IS NULL OR NEW.return_number = 'AUTO' OR TRIM(NEW.return_number) = '')) OR 
           (TG_OP = 'UPDATE' AND (OLD.status = 'Draft' OR OLD.return_number IS NULL OR OLD.return_number = 'AUTO' OR TRIM(OLD.return_number) = '')) THEN
            NEW.return_number := get_next_voucher_number(NEW.company_id, 'SalesReturn', COALESCE((NEW.return_date)::DATE, CURRENT_DATE));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION auto_generate_voucher_number_pr() RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.status IS NULL OR NEW.status IN ('Completed', 'Posted', 'Saved', 'Approved')) THEN
        IF (TG_OP = 'INSERT' AND (NEW.return_number IS NULL OR NEW.return_number = 'AUTO' OR TRIM(NEW.return_number) = '')) OR 
           (TG_OP = 'UPDATE' AND (OLD.status = 'Draft' OR OLD.return_number IS NULL OR OLD.return_number = 'AUTO' OR TRIM(OLD.return_number) = '')) THEN
            NEW.return_number := get_next_voucher_number(NEW.company_id, 'PurchaseReturn', COALESCE((NEW.return_date)::DATE, CURRENT_DATE));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_auto_num_sr ON "SalesReturn";
CREATE TRIGGER trg_auto_num_sr 
BEFORE INSERT OR UPDATE ON "SalesReturn" 
FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_sr();

DROP TRIGGER IF EXISTS trg_auto_num_pr ON "PurchaseReturn";
CREATE TRIGGER trg_auto_num_pr 
BEFORE INSERT OR UPDATE ON "PurchaseReturn" 
FOR EACH ROW EXECUTE FUNCTION auto_generate_voucher_number_pr();


-- ─── 3. CORE JOURNAL COMMIT GATEKEEPER (DEFENSE-IN-DEPTH) ──────────────────────
CREATE OR REPLACE FUNCTION rpc_commit_journal_entry_internal(
    p_company_id UUID,
    p_date DATE,
    p_description TEXT,
    p_module TEXT,
    p_source_id UUID,
    p_source_type TEXT,
    p_voucher_no TEXT,
    p_lines JSONB
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_line JSONB;
    v_clean_voucher_no TEXT;
    v_clean_description TEXT;
    v_is_reversal BOOLEAN := false;
BEGIN
    -- 1. Validate balancing
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_total_debit := v_total_debit + COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_total_credit := v_total_credit + COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
    END LOOP;

    IF v_total_debit = 0 AND v_total_credit = 0 THEN
        RETURN NULL; 
    END IF;

    IF ABS(v_total_debit - v_total_credit) > 0.001 THEN
        RAISE EXCEPTION 'ERR_UNBALANCED_JOURNAL: Total Debit (%) does not equal Total Credit (%)', v_total_debit, v_total_credit;
    END IF;

    -- 2. Intercept and resolve voucher number if 'AUTO' / NULL / empty
    v_clean_voucher_no := NULLIF(TRIM(p_voucher_no), '');
    IF v_clean_voucher_no ILIKE 'REV-AUTO%' OR v_clean_voucher_no = 'REV-AUTO' THEN
        v_is_reversal := true;
        v_clean_voucher_no := NULL;
    ELSIF v_clean_voucher_no ILIKE '%AUTO%' OR v_clean_voucher_no = 'AUTO' THEN
        v_clean_voucher_no := NULL;
    END IF;

    IF v_clean_voucher_no IS NULL AND p_source_id IS NOT NULL THEN
        IF p_source_type = 'SalesInvoice' THEN
            SELECT invoice_number INTO v_clean_voucher_no FROM "SalesInvoice" WHERE id = p_source_id;
        ELSIF p_source_type = 'PurchaseInvoice' THEN
            SELECT invoice_number INTO v_clean_voucher_no FROM "PurchaseInvoice" WHERE id = p_source_id;
        ELSIF p_source_type = 'FinancialVoucher' THEN
            SELECT voucher_number INTO v_clean_voucher_no FROM "FinancialVoucher" WHERE id = p_source_id;
        ELSIF p_source_type = 'POSSale' OR p_source_type = 'POS' THEN
            SELECT sale_number INTO v_clean_voucher_no FROM "POSSale" WHERE id = p_source_id;
        ELSIF p_source_type = 'SalesReturn' THEN
            SELECT return_number INTO v_clean_voucher_no FROM "SalesReturn" WHERE id = p_source_id;
        ELSIF p_source_type = 'PurchaseReturn' THEN
            SELECT return_number INTO v_clean_voucher_no FROM "PurchaseReturn" WHERE id = p_source_id;
        ELSIF p_source_type = 'StockAdjustment' THEN
            SELECT adjustment_number INTO v_clean_voucher_no FROM "StockAdjustment" WHERE id = p_source_id;
        END IF;

        IF v_clean_voucher_no = 'AUTO' OR TRIM(COALESCE(v_clean_voucher_no, '')) = '' THEN
            v_clean_voucher_no := NULL;
        END IF;
    END IF;

    -- Fallback sequence generation if source document still lacked a number
    IF v_clean_voucher_no IS NULL THEN
        IF p_source_type = 'SalesInvoice' THEN
            v_clean_voucher_no := get_next_voucher_number(p_company_id, 'SalesInvoice', p_date);
            IF p_source_id IS NOT NULL THEN UPDATE "SalesInvoice" SET invoice_number = v_clean_voucher_no WHERE id = p_source_id; END IF;
        ELSIF p_source_type = 'PurchaseInvoice' THEN
            v_clean_voucher_no := get_next_voucher_number(p_company_id, 'PurchaseInvoice', p_date);
            IF p_source_id IS NOT NULL THEN UPDATE "PurchaseInvoice" SET invoice_number = v_clean_voucher_no WHERE id = p_source_id; END IF;
        ELSIF p_source_type = 'FinancialVoucher' THEN
            v_clean_voucher_no := get_next_voucher_number(p_company_id, 'Journal', p_date);
            IF p_source_id IS NOT NULL THEN UPDATE "FinancialVoucher" SET voucher_number = v_clean_voucher_no WHERE id = p_source_id; END IF;
        ELSIF p_source_type = 'POSSale' OR p_source_type = 'POS' THEN
            v_clean_voucher_no := get_next_voucher_number(p_company_id, 'POS', p_date);
            IF p_source_id IS NOT NULL THEN UPDATE "POSSale" SET sale_number = v_clean_voucher_no WHERE id = p_source_id; END IF;
        ELSIF p_source_type = 'SalesReturn' THEN
            v_clean_voucher_no := get_next_voucher_number(p_company_id, 'SalesReturn', p_date);
            IF p_source_id IS NOT NULL THEN UPDATE "SalesReturn" SET return_number = v_clean_voucher_no WHERE id = p_source_id; END IF;
        ELSIF p_source_type = 'PurchaseReturn' THEN
            v_clean_voucher_no := get_next_voucher_number(p_company_id, 'PurchaseReturn', p_date);
            IF p_source_id IS NOT NULL THEN UPDATE "PurchaseReturn" SET return_number = v_clean_voucher_no WHERE id = p_source_id; END IF;
        ELSIF p_source_type = 'StockAdjustment' THEN
            v_clean_voucher_no := get_next_voucher_number(p_company_id, 'StockAdjustment', p_date);
            IF p_source_id IS NOT NULL THEN UPDATE "StockAdjustment" SET adjustment_number = v_clean_voucher_no WHERE id = p_source_id; END IF;
        ELSE
            v_clean_voucher_no := 'JV-' || SUBSTRING(gen_random_uuid()::TEXT, 1, 8);
        END IF;
    END IF;

    IF v_is_reversal THEN
        v_clean_voucher_no := 'REV-' || v_clean_voucher_no;
    END IF;

    -- 3. Clean up description
    v_clean_description := NULLIF(TRIM(p_description), '');
    IF v_clean_description IS NULL OR v_clean_description ILIKE '%AUTO%' THEN
        IF v_is_reversal THEN
            v_clean_description := 'Reversal: ' || COALESCE(p_module, 'Journal') || ' ' || v_clean_voucher_no;
        ELSIF p_source_type = 'SalesInvoice' THEN
            v_clean_description := 'Sales Invoice ' || v_clean_voucher_no;
        ELSIF p_source_type = 'PurchaseInvoice' THEN
            v_clean_description := 'Purchase Invoice ' || v_clean_voucher_no;
        ELSIF p_source_type = 'FinancialVoucher' THEN
            v_clean_description := 'Financial Voucher ' || v_clean_voucher_no;
        ELSIF p_source_type = 'POSSale' OR p_source_type = 'POS' THEN
            v_clean_description := 'POS Sale ' || v_clean_voucher_no;
        ELSIF p_source_type = 'SalesReturn' THEN
            v_clean_description := 'Sales Return ' || v_clean_voucher_no;
        ELSIF p_source_type = 'PurchaseReturn' THEN
            v_clean_description := 'Purchase Return ' || v_clean_voucher_no;
        ELSIF p_source_type = 'StockAdjustment' THEN
            v_clean_description := 'Stock Adjustment ' || v_clean_voucher_no;
        ELSE
            v_clean_description := COALESCE(p_module, 'Journal') || ' ' || v_clean_voucher_no;
        END IF;
    END IF;

    -- 4. Insert into GeneralLedgerJournal
    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced, voucher_no
    ) VALUES (
        p_company_id, p_date, v_clean_description, p_module, 
        p_source_id, p_source_type, 'Posted', v_total_debit, v_total_credit, true, v_clean_voucher_no
    ) RETURNING id INTO v_journal_id;

    -- 5. Insert lines with inherited description if line-level description is missing
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        IF COALESCE((v_line->>'debit_amount')::NUMERIC, 0) > 0 OR COALESCE((v_line->>'credit_amount')::NUMERIC, 0) > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                company_id, journal_id, account_id, description, debit_amount, credit_amount, entity_type, entity_id, due_date
            ) VALUES (
                p_company_id,
                v_journal_id,
                NULLIF(TRIM(v_line->>'account_id'), '')::UUID,
                COALESCE(NULLIF(TRIM(v_line->>'description'), ''), v_clean_description),
                COALESCE((v_line->>'debit_amount')::NUMERIC, 0),
                COALESCE((v_line->>'credit_amount')::NUMERIC, 0),
                v_line->>'entity_type',
                NULLIF(TRIM(v_line->>'entity_id'), '')::UUID,
                (v_line->>'due_date')::DATE
            );
        END IF;
    END LOOP;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.rpc_commit_journal_entry_internal(UUID, DATE, TEXT, TEXT, UUID, TEXT, TEXT, JSONB) TO authenticated;


-- ─── 4. REVISE rpc_checkout_sales_invoice ────────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_checkout_sales_invoice(p_payload JSONB, p_idempotency_key UUID, p_gl_lines JSONB)
RETURNS JSONB AS $BODY$
DECLARE
    v_invoice_id UUID;
    v_journal_id UUID;
    v_company_id UUID;
    v_invoice_date DATE;
    v_invoice_number VARCHAR;
    v_notes VARCHAR;
    v_is_from_challan BOOLEAN := COALESCE((p_payload->>'is_from_challan')::BOOLEAN, FALSE); 
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public."TransactionLocks" (idempotency_key) VALUES (p_idempotency_key);
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_invoice_date := (p_payload->>'invoice_date')::DATE;

    -- 1. Save Sales Invoice record (trigger will generate invoice_number if AUTO/NULL)
    v_invoice_id := rpc_internal_save_sales_invoice(p_payload);
    
    -- 2. CRITICAL: Refresh real generated invoice_number from table
    SELECT invoice_number INTO v_invoice_number FROM "SalesInvoice" WHERE id = v_invoice_id;
    IF v_invoice_number IS NULL OR v_invoice_number = 'AUTO' OR TRIM(v_invoice_number) = '' THEN
        v_invoice_number := get_next_voucher_number(v_company_id, 'SalesInvoice', v_invoice_date);
        UPDATE "SalesInvoice" SET invoice_number = v_invoice_number WHERE id = v_invoice_id;
    END IF;

    -- 3. Construct clean notes/narration
    IF TRIM(COALESCE(p_payload->>'notes', '')) != '' AND (p_payload->>'notes') NOT ILIKE '%AUTO%' THEN
        v_notes := p_payload->>'notes';
    ELSE
        v_notes := 'Sales Invoice ' || v_invoice_number;
    END IF;

    -- 4. Inventory deduction
    IF NOT v_is_from_challan THEN
        PERFORM rpc_internal_deduct_stock(v_company_id, v_invoice_id);
    END IF;

    -- 5. Commit Journal entry with verified invoice_number
    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id, v_invoice_date, v_notes,
        'Sales', v_invoice_id, 'SalesInvoice', v_invoice_number, p_gl_lines
    );

    RETURN jsonb_build_object(
        'status', 'success', 
        'invoice_id', v_invoice_id, 
        'invoice_number', v_invoice_number, 
        'journal_id', v_journal_id
    );
EXCEPTION 
    WHEN unique_violation THEN
        IF SQLERRM LIKE '%TransactionLocks%' THEN
            RAISE EXCEPTION 'ERR_IDEMPOTENCY: This transaction has already been processed.';
        ELSE
            RAISE EXCEPTION 'ERR_DUPLICATE_DOC: This document number is already in use. Please enter a new number.';
        END IF;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.rpc_checkout_sales_invoice(JSONB, UUID, JSONB) TO authenticated;


-- ─── 5. REVISE rpc_checkout_purchase_invoice ─────────────────────────────────
CREATE OR REPLACE FUNCTION rpc_checkout_purchase_invoice(p_payload JSONB, p_idempotency_key UUID, p_gl_lines JSONB)
RETURNS JSONB AS $BODY$
DECLARE
    v_invoice_id UUID;
    v_journal_id UUID;
    v_company_id UUID;
    v_invoice_date DATE;
    v_invoice_number VARCHAR;
    v_notes VARCHAR;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public."TransactionLocks" (idempotency_key) VALUES (p_idempotency_key);
    END IF;

    v_company_id := (p_payload->>'company_id')::UUID;
    v_invoice_date := (p_payload->>'invoice_date')::DATE;

    -- 1. Save Purchase Invoice record (trigger will generate invoice_number if AUTO/NULL)
    v_invoice_id := rpc_internal_save_purchase_invoice(p_payload);
    
    -- 2. CRITICAL: Refresh real generated invoice_number from table
    SELECT invoice_number INTO v_invoice_number FROM "PurchaseInvoice" WHERE id = v_invoice_id;
    IF v_invoice_number IS NULL OR v_invoice_number = 'AUTO' OR TRIM(v_invoice_number) = '' THEN
        v_invoice_number := get_next_voucher_number(v_company_id, 'PurchaseInvoice', v_invoice_date);
        UPDATE "PurchaseInvoice" SET invoice_number = v_invoice_number WHERE id = v_invoice_id;
    END IF;

    -- 3. Construct clean notes/narration
    IF TRIM(COALESCE(p_payload->>'notes', '')) != '' AND (p_payload->>'notes') NOT ILIKE '%AUTO%' THEN
        v_notes := p_payload->>'notes';
    ELSE
        v_notes := 'Purchase Invoice ' || v_invoice_number;
    END IF;

    -- 4. Add stock
    PERFORM rpc_internal_add_stock(v_company_id, v_invoice_id);

    -- 5. Commit Journal entry with verified invoice_number
    v_journal_id := rpc_commit_journal_entry_internal(
        v_company_id, v_invoice_date, v_notes,
        'Purchases', v_invoice_id, 'PurchaseInvoice', v_invoice_number, p_gl_lines
    );

    RETURN jsonb_build_object(
        'status', 'success', 
        'invoice_id', v_invoice_id, 
        'invoice_number', v_invoice_number, 
        'journal_id', v_journal_id
    );
EXCEPTION 
    WHEN unique_violation THEN
        IF SQLERRM LIKE '%TransactionLocks%' THEN
            RAISE EXCEPTION 'ERR_IDEMPOTENCY: This transaction has already been processed.';
        ELSE
            RAISE EXCEPTION 'ERR_DUPLICATE_DOC: This document number is already in use. Please enter a new number.';
        END IF;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.rpc_checkout_purchase_invoice(JSONB, UUID, JSONB) TO authenticated;


-- ─── 6. REVISE rpc_reverse_gl_journal (PREVENT REV-AUTO) ──────────────────────
CREATE OR REPLACE FUNCTION rpc_reverse_gl_journal(
    p_company_id UUID,
    p_original_journal_id UUID,
    p_reversal_date DATE,
    p_reason TEXT
) RETURNS UUID 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_original "GeneralLedgerJournal"%ROWTYPE;
    v_line "GeneralLedgerLine"%ROWTYPE;
    v_new_journal_id UUID;
    v_base_voucher_no TEXT;
    v_new_voucher_no TEXT;
BEGIN
    SELECT * INTO v_original FROM "GeneralLedgerJournal" WHERE id = p_original_journal_id AND company_id = p_company_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original journal not found.';
    END IF;

    -- Safely resolve the base voucher number
    v_base_voucher_no := NULLIF(TRIM(v_original.voucher_no), '');
    IF v_base_voucher_no IS NULL OR v_base_voucher_no = 'AUTO' OR v_base_voucher_no ILIKE '%AUTO%' THEN
        IF v_original.source_document_type = 'SalesInvoice' AND v_original.source_document_id IS NOT NULL THEN
            SELECT invoice_number INTO v_base_voucher_no FROM "SalesInvoice" WHERE id = v_original.source_document_id::UUID;
        ELSIF v_original.source_document_type = 'PurchaseInvoice' AND v_original.source_document_id IS NOT NULL THEN
            SELECT invoice_number INTO v_base_voucher_no FROM "PurchaseInvoice" WHERE id = v_original.source_document_id::UUID;
        ELSIF v_original.source_document_type = 'FinancialVoucher' AND v_original.source_document_id IS NOT NULL THEN
            SELECT voucher_number INTO v_base_voucher_no FROM "FinancialVoucher" WHERE id = v_original.source_document_id::UUID;
        ELSIF v_original.source_document_type = 'POSSale' AND v_original.source_document_id IS NOT NULL THEN
            SELECT sale_number INTO v_base_voucher_no FROM "POSSale" WHERE id = v_original.source_document_id::UUID;
        END IF;
    END IF;

    IF v_base_voucher_no IS NULL OR v_base_voucher_no = 'AUTO' OR TRIM(v_base_voucher_no) = '' THEN
        v_base_voucher_no := SUBSTRING(v_original.id::TEXT, 1, 8);
    END IF;

    -- Strip existing REV- prefix if multiple reversals occurred
    IF v_base_voucher_no LIKE 'REV-%' THEN
        v_base_voucher_no := SUBSTRING(v_base_voucher_no FROM 5);
    END IF;

    v_new_voucher_no := LEFT('REV-' || v_base_voucher_no, 50);

    -- Create contra-entry with status = 'Posted' and correct voucher_no
    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced,
        reversed_journal_id, voucher_no
    ) VALUES (
        p_company_id, p_reversal_date, 'Reversal: ' || COALESCE(v_original.description, 'Journal') || ' (' || p_reason || ')', v_original.reference_module, 
        v_original.source_document_id, v_original.source_document_type, 'Posted', v_original.total_credit, v_original.total_debit, v_original.is_balanced,
        p_original_journal_id, v_new_voucher_no
    ) RETURNING id INTO v_new_journal_id;

    -- Flip debits and credits for lines
    FOR v_line IN SELECT * FROM "GeneralLedgerLine" WHERE journal_id = p_original_journal_id
    LOOP
        INSERT INTO "GeneralLedgerLine" (
            company_id, journal_id, account_id,
            debit_amount, credit_amount, description, entity_type, entity_id, due_date
        ) VALUES (
            p_company_id, v_new_journal_id, v_line.account_id,
            v_line.credit_amount, v_line.debit_amount, 'Reversal: ' || COALESCE(v_line.description, v_new_voucher_no), v_line.entity_type, v_line.entity_id, v_line.due_date
        );
    END LOOP;

    -- Mark original as reversed but keep status as Posted
    UPDATE "GeneralLedgerJournal" 
    SET is_reversed = true, notes = COALESCE(notes, '') || ' [Reversed on ' || p_reversal_date::TEXT || ']' 
    WHERE id = p_original_journal_id;

    RETURN v_new_journal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_reverse_gl_journal(UUID, UUID, DATE, TEXT) TO authenticated;


-- ─── 7. REVISE REPORTING RPC get_stabilized_general_ledger_statement_rpc ──────
CREATE OR REPLACE FUNCTION get_stabilized_general_ledger_statement_rpc(
    p_company_id UUID,
    p_account_id UUID,
    p_from_date DATE,
    p_to_date DATE
) RETURNS TABLE (
    id UUID,
    journal_id TEXT,
    entry_date DATE,
    voucher_no TEXT,
    description TEXT,
    debit_amount NUMERIC,
    credit_amount NUMERIC,
    running_balance NUMERIC,
    is_opening BOOLEAN
) LANGUAGE plpgsql AS $$
DECLARE
    v_normal_balance TEXT;
BEGIN
    SELECT c.normal_balance INTO v_normal_balance
    FROM "ChartOfAccount" c
    WHERE c.id = p_account_id;

    RETURN QUERY
    WITH historical_agg AS (
        SELECT 
            SUM(COALESCE(l.debit_amount, 0)) as ob_dr,
            SUM(COALESCE(l.credit_amount, 0)) as ob_cr
        FROM "GeneralLedgerLine" l
        JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
        WHERE l.account_id = p_account_id
          AND j.company_id = p_company_id
          AND j.status = 'Posted'
          AND j.entry_date::DATE < p_from_date
    ),
    combined_stream AS (
        SELECT 
            NULL::UUID as line_id,
            ''::TEXT as journal_id,
            (p_from_date - INTERVAL '1 day')::DATE as entry_date,
            'OPENING_BAL'::TEXT as voucher_no,
            'Opening Balance'::TEXT as description,
            COALESCE(h.ob_dr, 0) as debit_amount,
            COALESCE(h.ob_cr, 0) as credit_amount,
            TRUE as is_opening,
            0::INTEGER as sort_order
        FROM historical_agg h

        UNION ALL

        SELECT 
            l.id as line_id,
            j.id::TEXT as journal_id,
            j.entry_date::DATE as entry_date,
            CASE 
                WHEN j.voucher_no IS NOT NULL AND j.voucher_no != 'AUTO' AND j.voucher_no != 'REV-AUTO' AND TRIM(j.voucher_no) != '' THEN j.voucher_no
                WHEN j.source_document_type = 'SalesInvoice' THEN COALESCE((SELECT si.invoice_number FROM "SalesInvoice" si WHERE si.id = j.source_document_id::UUID), 'SI-' || SUBSTRING(j.id::TEXT, 1, 8))
                WHEN j.source_document_type = 'PurchaseInvoice' THEN COALESCE((SELECT pi.invoice_number FROM "PurchaseInvoice" pi WHERE pi.id = j.source_document_id::UUID), 'PI-' || SUBSTRING(j.id::TEXT, 1, 8))
                WHEN j.source_document_type = 'FinancialVoucher' THEN COALESCE((SELECT fv.voucher_number FROM "FinancialVoucher" fv WHERE fv.id = j.source_document_id::UUID), 'JV-' || SUBSTRING(j.id::TEXT, 1, 8))
                WHEN j.source_document_type = 'POSSale' THEN COALESCE((SELECT ps.sale_number FROM "POSSale" ps WHERE ps.id = j.source_document_id::UUID), 'POS-' || SUBSTRING(j.id::TEXT, 1, 8))
                WHEN j.source_document_type = 'SalesReturn' THEN COALESCE((SELECT sr.return_number FROM "SalesReturn" sr WHERE sr.id = j.source_document_id::UUID), 'SR-' || SUBSTRING(j.id::TEXT, 1, 8))
                WHEN j.source_document_type = 'PurchaseReturn' THEN COALESCE((SELECT pr.return_number FROM "PurchaseReturn" pr WHERE pr.id = j.source_document_id::UUID), 'PR-' || SUBSTRING(j.id::TEXT, 1, 8))
                ELSE 'JV-' || SUBSTRING(j.id::TEXT, 1, 8)
            END as voucher_no, 
            COALESCE(NULLIF(TRIM(l.description), ''), NULLIF(TRIM(j.description), ''), 'Journal Entry') as description,
            COALESCE(l.debit_amount, 0) as debit_amount,
            COALESCE(l.credit_amount, 0) as credit_amount,
            FALSE as is_opening,
            1::INTEGER as sort_order
        FROM "GeneralLedgerLine" l
        JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
        WHERE l.account_id = p_account_id
          AND j.company_id = p_company_id
          AND j.status = 'Posted'
          AND j.entry_date::DATE >= p_from_date
          AND j.entry_date::DATE <= p_to_date
    )
    SELECT 
        c.line_id as id,
        c.journal_id,
        c.entry_date,
        c.voucher_no,
        c.description,
        c.debit_amount,
        c.credit_amount,
        SUM(
            CASE 
                WHEN v_normal_balance = 'Debit' THEN (c.debit_amount - c.credit_amount)
                WHEN v_normal_balance = 'Credit' THEN (c.credit_amount - c.debit_amount)
                ELSE (c.debit_amount - c.credit_amount)
            END
        ) OVER (ORDER BY c.sort_order ASC, c.entry_date ASC, c.journal_id ASC, c.line_id ASC) as running_balance,
        c.is_opening
    FROM combined_stream c
    ORDER BY c.sort_order ASC, c.entry_date ASC, c.journal_id ASC, c.line_id ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stabilized_general_ledger_statement_rpc(UUID, UUID, DATE, DATE) TO authenticated;


-- ─── 8. STRICT CONSTRAINT (FORBID 'AUTO' OR 'REV-AUTO' IN POSTED JOURNALS) ────
ALTER TABLE "GeneralLedgerJournal" DROP CONSTRAINT IF EXISTS chk_posted_voucher_no;
ALTER TABLE "GeneralLedgerJournal" 
ADD CONSTRAINT chk_posted_voucher_no 
CHECK (status != 'Posted' OR (NULLIF(TRIM(voucher_no), '') IS NOT NULL AND voucher_no != 'AUTO' AND voucher_no != 'REV-AUTO'));


-- ─── 9. RETROACTIVE DATA CLEANUP ─────────────────────────────────────────────
-- 1. Sales Invoices with AUTO
UPDATE "GeneralLedgerJournal" j
SET voucher_no = si.invoice_number,
    description = CASE WHEN j.description IS NULL OR j.description = '' OR j.description ILIKE '%AUTO%' THEN 'Sales Invoice ' || si.invoice_number ELSE j.description END
FROM "SalesInvoice" si
WHERE j.source_document_id::TEXT = si.id::TEXT
  AND j.source_document_type = 'SalesInvoice'
  AND (j.voucher_no = 'AUTO' OR j.voucher_no ILIKE '%AUTO%');

-- 2. Purchase Invoices with AUTO
UPDATE "GeneralLedgerJournal" j
SET voucher_no = pi.invoice_number,
    description = CASE WHEN j.description IS NULL OR j.description = '' OR j.description ILIKE '%AUTO%' THEN 'Purchase Invoice ' || pi.invoice_number ELSE j.description END
FROM "PurchaseInvoice" pi
WHERE j.source_document_id::TEXT = pi.id::TEXT
  AND j.source_document_type = 'PurchaseInvoice'
  AND (j.voucher_no = 'AUTO' OR j.voucher_no ILIKE '%AUTO%');

-- 3. Reversals with REV-AUTO
UPDATE "GeneralLedgerJournal" j
SET voucher_no = 'REV-' || si.invoice_number,
    description = 'Reversal: Sales Invoice ' || si.invoice_number
FROM "SalesInvoice" si
WHERE j.source_document_id::TEXT = si.id::TEXT
  AND j.source_document_type = 'SalesInvoice'
  AND j.voucher_no = 'REV-AUTO';

-- 4. Update GeneralLedgerLine descriptions where empty or AUTO
UPDATE "GeneralLedgerLine" l
SET description = j.description
FROM "GeneralLedgerJournal" j
WHERE l.journal_id = j.id
  AND (l.description IS NULL OR l.description = '' OR l.description ILIKE '%AUTO%');

COMMIT;
