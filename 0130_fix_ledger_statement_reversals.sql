-- =========================================================================================
-- MIGRATION 0130: FIX LEDGER STATEMENT REVERSALS
-- =========================================================================================
-- This script safely updates the Detail General Ledger Statement RPC to exclude 
-- 'Reversed' journals, ensuring it perfectly matches the Trial Balance calculation.

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
          -- CRITICAL: Exclude 'Reversed' status to ensure exact reconciliation with Trial Balance (Fix 0130).
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
            COALESCE(j.voucher_no, j.id::TEXT) as voucher_no, 
            COALESCE(l.description, j.description, 'Journal Entry') as description,
            COALESCE(l.debit_amount, 0) as debit_amount,
            COALESCE(l.credit_amount, 0) as credit_amount,
            FALSE as is_opening,
            1::INTEGER as sort_order
        FROM "GeneralLedgerLine" l
        JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
        WHERE l.account_id = p_account_id
          AND j.company_id = p_company_id
          -- CRITICAL: Exclude 'Reversed' status to ensure exact reconciliation with Trial Balance (Fix 0130).
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
