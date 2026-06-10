-- FIX UUID TYPE CASTS IN REPORT RPCs
CREATE OR REPLACE FUNCTION get_sales_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
    entry_date DATE,
    voucher_no TEXT,
    net_revenue NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.entry_date,
        j.voucher_no,
        SUM(l.credit_amount) - SUM(l.debit_amount) as net_revenue
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::TEXT
    JOIN "ChartOfAccount" c ON l.account_id = c.id::TEXT
    WHERE c.account_type IN ('Revenue', 'Other Income')
      AND j.status = 'Posted'
      AND (p_company_id IS NULL OR j.company_id = p_company_id)
      AND (p_from_date IS NULL OR j.entry_date >= p_from_date)
      AND (p_to_date IS NULL OR j.entry_date <= p_to_date)
    GROUP BY j.entry_date, j.voucher_no
    HAVING (SUM(l.credit_amount) - SUM(l.debit_amount)) <> 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_purchase_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
    entry_date DATE,
    voucher_no TEXT,
    net_expense NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.entry_date,
        j.voucher_no,
        SUM(l.debit_amount) - SUM(l.credit_amount) as net_expense
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::TEXT
    JOIN "ChartOfAccount" c ON l.account_id = c.id::TEXT
    WHERE c.account_type IN ('Expense', 'Cost of Goods Sold', 'OPEX', 'Other Expense')
      AND j.status = 'Posted'
      AND (p_company_id IS NULL OR j.company_id = p_company_id)
      AND (p_from_date IS NULL OR j.entry_date >= p_from_date)
      AND (p_to_date IS NULL OR j.entry_date <= p_to_date)
    GROUP BY j.entry_date, j.voucher_no
    HAVING (SUM(l.debit_amount) - SUM(l.credit_amount)) <> 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
