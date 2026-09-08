-- =========================================================================================
-- MIGRATION 0150: FIX NULL VOUCHER NUMBERS & ENFORCE STRICT POSTING CONSTRAINTS
-- =========================================================================================

-- 1. Update rpc_reverse_gl_journal to safely append REV-
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
    v_new_voucher_no TEXT;
BEGIN
    SELECT * INTO v_original FROM "GeneralLedgerJournal" WHERE id = p_original_journal_id AND company_id = p_company_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original journal not found.';
    END IF;

    -- Safely bound the new voucher number to 50 characters max to prevent overflow
    v_new_voucher_no := LEFT('REV-' || COALESCE(NULLIF(TRIM(v_original.voucher_no), ''), SUBSTRING(v_original.id::TEXT, 1, 8)), 50);

    -- Create contra-entry with status = 'Posted' and correct voucher_no
    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced,
        reversed_journal_id, voucher_no
    ) VALUES (
        p_company_id, p_reversal_date, 'Reversal: ' || v_original.description || ' (' || p_reason || ')', v_original.reference_module, 
        v_original.source_document_id, v_original.source_document_type, 'Posted', v_original.total_credit, v_original.total_debit, v_original.is_balanced,
        p_original_journal_id, v_new_voucher_no
    ) RETURNING id INTO v_new_journal_id;

    -- Flip debits and credits for lines
    FOR v_line IN SELECT * FROM "GeneralLedgerLine" WHERE journal_id = p_original_journal_id
    LOOP
        INSERT INTO "GeneralLedgerLine" (
            company_id, journal_id, account_id, account_code, account_name, account_type,
            debit_amount, credit_amount, description, entity_type, entity_id, due_date
        ) VALUES (
            p_company_id, v_new_journal_id, v_line.account_id, v_line.account_code, v_line.account_name, v_line.account_type,
            v_line.credit_amount, v_line.debit_amount, 'Reversal: ' || v_line.description, v_line.entity_type, v_line.entity_id, v_line.due_date
        );
    END LOOP;

    -- Mark original as reversed but keep status as Posted
    UPDATE "GeneralLedgerJournal" 
    SET is_reversed = true, notes = COALESCE(notes, '') || ' [Reversed on ' || p_reversal_date::TEXT || ']' 
    WHERE id = p_original_journal_id;

    RETURN v_new_journal_id;
END;
$$;

-- 2. Retroactive Data Backfill
UPDATE "GeneralLedgerJournal" j
SET voucher_no = LEFT(
    CASE 
        WHEN j.source_document_type = 'Reversal' THEN 'REV-' || SUBSTRING(j.id::TEXT, 1, 8)
        WHEN j.source_document_type = 'PurchaseInvoice' THEN 'PUR-' || SUBSTRING(j.id::TEXT, 1, 8)
        WHEN j.source_document_type = 'SalesInvoice' THEN 'INV-' || SUBSTRING(j.id::TEXT, 1, 8)
        WHEN j.source_document_type = 'POSSale' THEN 'POS-' || SUBSTRING(j.id::TEXT, 1, 8)
        WHEN j.source_document_type = 'FinancialVoucher' THEN 'VOU-' || SUBSTRING(j.id::TEXT, 1, 8)
        WHEN j.source_document_type = 'StockAdjustment' THEN 'ADJ-' || SUBSTRING(j.id::TEXT, 1, 8)
        WHEN j.source_document_type = 'SalesReturn' THEN 'RET-' || SUBSTRING(j.id::TEXT, 1, 8)
        ELSE 'JV-' || SUBSTRING(j.id::TEXT, 1, 8)
    END, 50
)
WHERE NULLIF(TRIM(j.voucher_no), '') IS NULL 
   OR j.voucher_no = j.id::TEXT 
   OR length(j.voucher_no) = 36;

-- 3. Patch Fallbacks in Reporting RPCs (get_stabilized_general_ledger_statement_rpc)
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
            COALESCE(NULLIF(TRIM(j.voucher_no), ''), 'JV-' || SUBSTRING(j.id::TEXT, 1, 8)) as voucher_no, 
            COALESCE(l.description, j.description, 'Journal Entry') as description,
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

-- 4. The Strict Table Constraint (The True Fix)
ALTER TABLE "GeneralLedgerJournal" 
ADD CONSTRAINT chk_posted_voucher_no 
CHECK (status != 'Posted' OR NULLIF(TRIM(voucher_no), '') IS NOT NULL);
