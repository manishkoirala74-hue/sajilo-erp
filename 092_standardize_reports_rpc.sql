-- 1. AR Aging RPC
CREATE OR REPLACE FUNCTION get_ar_aging_rpc(p_company_id UUID, p_as_of_date DATE)
RETURNS TABLE (
    customer_name TEXT,
    balance NUMERIC,
    bucket TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        si.customer_name,
        (si.grand_total - COALESCE(si.paid_amount, 0)) AS balance,
        CASE
            WHEN (p_as_of_date - si.due_date::DATE) <= 0 THEN 'Current'
            WHEN (p_as_of_date - si.due_date::DATE) BETWEEN 1 AND 30 THEN '1–30 days'
            WHEN (p_as_of_date - si.due_date::DATE) BETWEEN 31 AND 60 THEN '31–60 days'
            ELSE '60d+'
        END AS bucket
    FROM "SalesInvoice" si
    WHERE si.company_id = p_company_id
      AND si.status = 'Posted'
      AND si.invoice_date::DATE <= p_as_of_date
      AND (si.grand_total - COALESCE(si.paid_amount, 0)) > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. AP Aging RPC
CREATE OR REPLACE FUNCTION get_ap_aging_rpc(p_company_id UUID, p_as_of_date DATE)
RETURNS TABLE (
    vendor_name TEXT,
    balance NUMERIC,
    bucket TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pi.vendor_name,
        (pi.grand_total - COALESCE(pi.paid_amount, 0)) AS balance,
        CASE
            WHEN (p_as_of_date - pi.due_date::DATE) <= 0 THEN 'Current'
            WHEN (p_as_of_date - pi.due_date::DATE) BETWEEN 1 AND 30 THEN '1–30 days'
            WHEN (p_as_of_date - pi.due_date::DATE) BETWEEN 31 AND 60 THEN '31–60 days'
            ELSE '60d+'
        END AS bucket
    FROM "PurchaseInvoice" pi
    WHERE pi.company_id = p_company_id
      AND pi.status = 'Posted'
      AND pi.invoice_date::DATE <= p_as_of_date
      AND (pi.grand_total - COALESCE(pi.paid_amount, 0)) > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Cash Flow RPC
CREATE OR REPLACE FUNCTION get_cash_flow_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
    journal_id UUID,
    entry_date TIMESTAMPTZ,
    voucher_no TEXT,
    description TEXT,
    net_amount NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.id as journal_id,
        j.entry_date,
        j.voucher_no,
        j.description,
        SUM(COALESCE(l.debit_amount, 0) - COALESCE(l.credit_amount, 0)) as net_amount
    FROM "GeneralLedgerJournal" j
    JOIN "GeneralLedgerLine" l ON l.journal_id = j.id
    JOIN "ChartOfAccount" a ON a.id = l.account_id
    WHERE j.company_id = p_company_id
      AND j.status = 'Posted'
      AND a.account_type IN ('Cash', 'Bank')
      AND (j.entry_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kathmandu')::DATE >= p_from_date
      AND (j.entry_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kathmandu')::DATE <= p_to_date
    GROUP BY j.id, j.entry_date, j.voucher_no, j.description;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Balance Sheet RPC (WITH RECURSIVE)
CREATE OR REPLACE FUNCTION get_balance_sheet_rpc(p_company_id UUID, p_as_of_date DATE)
RETURNS TABLE (
    id UUID,
    parent_account_id UUID,
    account_code TEXT,
    account_name TEXT,
    account_type TEXT,
    ledger_type TEXT,
    closing_balance NUMERIC,
    normal_balance TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE 
    -- 1. Get raw balances for all accounts up to the given date from GeneralLedgerLine
    account_balances AS (
        SELECT 
            a.id AS account_id,
            a.parent_account_id,
            a.account_code,
            a.account_name,
            a.account_type,
            a.ledger_type,
            a.normal_balance,
            a.opening_balance,
            a.opening_balance_type,
            COALESCE(SUM(l.debit_amount), 0) AS total_debit,
            COALESCE(SUM(l.credit_amount), 0) AS total_credit
        FROM "ChartOfAccount" a
        LEFT JOIN "GeneralLedgerLine" l ON l.account_id = a.id
        LEFT JOIN "GeneralLedgerJournal" j ON j.id = l.journal_id AND j.status = 'Posted' AND j.company_id = p_company_id AND (j.entry_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kathmandu')::DATE <= p_as_of_date
        WHERE a.company_id = p_company_id AND a.is_active = true
        GROUP BY a.id
    ),
    -- 2. Compute individual closing balances (for Sub Ledgers and base Group Ledgers)
    base_computed AS (
        SELECT 
            ab.account_id,
            ab.parent_account_id,
            ab.account_code,
            ab.account_name,
            ab.account_type,
            ab.ledger_type,
            ab.normal_balance,
            -- Determine opening balance correctly
            CASE 
                WHEN ab.opening_balance_type = 'Dr' AND LOWER(ab.normal_balance) = 'debit' THEN COALESCE(ab.opening_balance, 0)
                WHEN ab.opening_balance_type = 'Cr' AND LOWER(ab.normal_balance) = 'credit' THEN COALESCE(ab.opening_balance, 0)
                WHEN ab.opening_balance_type = 'Cr' AND LOWER(ab.normal_balance) = 'debit' THEN -COALESCE(ab.opening_balance, 0)
                WHEN ab.opening_balance_type = 'Dr' AND LOWER(ab.normal_balance) = 'credit' THEN -COALESCE(ab.opening_balance, 0)
                ELSE COALESCE(ab.opening_balance, 0)
            END AS base_ob,
            ab.total_debit,
            ab.total_credit,
            -- Closing balance logic based on normal_balance
            CASE 
                WHEN LOWER(ab.normal_balance) = 'debit' THEN 
                    (CASE WHEN ab.opening_balance_type = 'Dr' THEN COALESCE(ab.opening_balance, 0) ELSE -COALESCE(ab.opening_balance, 0) END) + ab.total_debit - ab.total_credit
                ELSE 
                    (CASE WHEN ab.opening_balance_type = 'Cr' THEN COALESCE(ab.opening_balance, 0) ELSE -COALESCE(ab.opening_balance, 0) END) + ab.total_credit - ab.total_debit
            END AS ind_closing_balance
        FROM account_balances ab
    ),
    -- 3. Prepare for recursive rollup: Start with leaf nodes passing their balance up
    hierarchy AS (
        -- Base case: All accounts
        SELECT 
            bc.account_id,
            bc.parent_account_id,
            bc.account_code,
            bc.account_name,
            bc.account_type,
            bc.ledger_type,
            bc.normal_balance,
            bc.ind_closing_balance AS rolled_up_balance,
            bc.account_id AS source_account_id
        FROM base_computed bc

        UNION ALL

        -- Recursive step: propagate rolled_up_balance up to the parent
        SELECT 
            p.account_id,
            p.parent_account_id,
            p.account_code,
            p.account_name,
            p.account_type,
            p.ledger_type,
            p.normal_balance,
            h.rolled_up_balance,
            h.source_account_id
        FROM hierarchy h
        JOIN base_computed p ON h.parent_account_id = p.account_id
    )
    -- 4. Aggregate rolled up balances for each account
    SELECT 
        account_id AS id,
        parent_account_id,
        account_code,
        account_name,
        account_type,
        ledger_type,
        SUM(rolled_up_balance) AS closing_balance,
        normal_balance
    FROM hierarchy
    GROUP BY account_id, parent_account_id, account_code, account_name, account_type, ledger_type, normal_balance
    ORDER BY account_code NULLS FIRST;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
