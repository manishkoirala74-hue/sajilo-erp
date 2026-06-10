-- ==============================================================================
-- DETAIL GENERAL LEDGER RPC
-- Retrieves all posted lines for a specific account within a date range,
-- completely bypassing the PostgREST 1000-row limit.
-- ==============================================================================

CREATE OR REPLACE FUNCTION get_detail_general_ledger_rpc(
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
    is_opening BOOLEAN
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    
    -- 1. Opening Balance Aggregation (Before from_date)
    SELECT 
        NULL::UUID as id,
        NULL::TEXT as journal_id,
        (p_from_date - INTERVAL '1 day')::DATE as entry_date,
        'OB'::TEXT as voucher_no,
        'Opening Balance'::TEXT as description,
        SUM(COALESCE(l.debit_amount, 0)) as debit_amount,
        SUM(COALESCE(l.credit_amount, 0)) as credit_amount,
        TRUE as is_opening
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON j.id::TEXT = l.journal_id
    WHERE l.account_id::TEXT = p_account_id::TEXT
      AND j.company_id = p_company_id
      AND j.status = 'Posted'
      AND j.entry_date::DATE < p_from_date
    HAVING SUM(COALESCE(l.debit_amount, 0)) > 0 OR SUM(COALESCE(l.credit_amount, 0)) > 0

    UNION ALL
    
    -- 2. Transaction Lines (Within Date Range)
    SELECT 
        l.id::UUID,
        j.id::TEXT as journal_id,
        j.entry_date::DATE as entry_date,
        COALESCE(j.voucher_no, j.id::TEXT) as voucher_no,
        COALESCE(l.description, j.memo, 'Journal Entry') as description,
        COALESCE(l.debit_amount, 0) as debit_amount,
        COALESCE(l.credit_amount, 0) as credit_amount,
        FALSE as is_opening
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON j.id::TEXT = l.journal_id
    WHERE l.account_id::TEXT = p_account_id::TEXT
      AND j.company_id = p_company_id
      AND j.status = 'Posted'
      AND j.entry_date::DATE >= p_from_date
      AND j.entry_date::DATE <= p_to_date
      
    ORDER BY is_opening DESC, entry_date ASC;
END;
$$;
