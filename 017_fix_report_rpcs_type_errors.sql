-- FIX REPORT RPCs TYPE ERRORS (Dates & Intervals)
-- 1. In Aging reports, "TIMESTAMP - TIMESTAMP" returns an INTERVAL. We need an INTEGER for bucketing.
--    We fix this by casting the dates to ::DATE before subtracting: (DATE - DATE) returns INTEGER.
-- 2. In Summary reports, "j.entry_date" is TIMESTAMP, but the function RETURNS TABLE(entry_date DATE). 
--    We fix this by explicitly casting j.entry_date::DATE in the SELECT clause.

-- 1. Sales Summary
CREATE OR REPLACE FUNCTION get_sales_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
    entry_date DATE,
    voucher_no TEXT,
    net_revenue NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.entry_date::DATE,
        j.voucher_no,
        SUM(l.credit_amount) - SUM(l.debit_amount) as net_revenue
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::TEXT
    JOIN "ChartOfAccount" c ON l.account_id = c.id::TEXT
    WHERE c.account_type IN ('Revenue', 'Other Income')
      AND j.status = 'Posted'
      AND (p_company_id IS NULL OR j.company_id = p_company_id)
      AND (p_from_date IS NULL OR j.entry_date::DATE >= p_from_date)
      AND (p_to_date IS NULL OR j.entry_date::DATE <= p_to_date)
    GROUP BY j.entry_date::DATE, j.voucher_no
    HAVING (SUM(l.credit_amount) - SUM(l.debit_amount)) <> 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Purchase Summary
CREATE OR REPLACE FUNCTION get_purchase_summary_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
    entry_date DATE,
    voucher_no TEXT,
    net_expense NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        j.entry_date::DATE,
        j.voucher_no,
        SUM(l.debit_amount) - SUM(l.credit_amount) as net_expense
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::TEXT
    JOIN "ChartOfAccount" c ON l.account_id = c.id::TEXT
    WHERE c.account_type IN ('Expense', 'Cost of Goods Sold', 'OPEX', 'Other Expense')
      AND j.status = 'Posted'
      AND (p_company_id IS NULL OR j.company_id = p_company_id)
      AND (p_from_date IS NULL OR j.entry_date::DATE >= p_from_date)
      AND (p_to_date IS NULL OR j.entry_date::DATE <= p_to_date)
    GROUP BY j.entry_date::DATE, j.voucher_no
    HAVING (SUM(l.debit_amount) - SUM(l.credit_amount)) <> 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. AR Aging Report
CREATE OR REPLACE FUNCTION get_ar_aging_rpc(p_company_id UUID)
RETURNS TABLE (
    customer_id UUID,
    customer_name TEXT,
    bucket TEXT,
    balance NUMERIC
) AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
BEGIN
    RETURN QUERY
    SELECT 
        sub.entity_id::UUID as customer_id, 
        sub.customer_name,
        CASE 
            WHEN sub.days <= 0 THEN 'Current'
            WHEN sub.days <= 30 THEN '1–30 days'
            WHEN sub.days <= 60 THEN '31–60 days'
            ELSE '60+ days'
        END as bucket,
        sub.balance
    FROM (
        SELECT 
            l.entity_id,
            b.name as customer_name,
            l.due_date,
            (v_today - COALESCE(l.due_date::DATE, j.entry_date::DATE)) as days,
            SUM(l.debit_amount) - SUM(l.credit_amount) as balance
        FROM "GeneralLedgerLine" l
        JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::TEXT
        LEFT JOIN "BusinessPartner" b ON b.id::TEXT = l.entity_id
        WHERE l.entity_type = 'Customer'
          AND j.status = 'Posted'
          AND (p_company_id IS NULL OR j.company_id = p_company_id)
        GROUP BY l.entity_id, b.name, l.due_date, j.entry_date::DATE
        HAVING (SUM(l.debit_amount) - SUM(l.credit_amount)) > 0.01
    ) sub;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. AP Aging Report
CREATE OR REPLACE FUNCTION get_ap_aging_rpc(p_company_id UUID)
RETURNS TABLE (
    vendor_id UUID,
    vendor_name TEXT,
    bucket TEXT,
    balance NUMERIC
) AS $$
DECLARE
    v_today DATE := CURRENT_DATE;
BEGIN
    RETURN QUERY
    SELECT 
        sub.entity_id::UUID as vendor_id, 
        sub.vendor_name,
        CASE 
            WHEN sub.days <= 0 THEN 'Current'
            WHEN sub.days <= 30 THEN '1–30 days'
            WHEN sub.days <= 60 THEN '31–60 days'
            ELSE '60+ days'
        END as bucket,
        sub.balance
    FROM (
        SELECT 
            l.entity_id,
            b.name as vendor_name,
            l.due_date,
            (v_today - COALESCE(l.due_date::DATE, j.entry_date::DATE)) as days,
            SUM(l.credit_amount) - SUM(l.debit_amount) as balance
        FROM "GeneralLedgerLine" l
        JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id::TEXT
        LEFT JOIN "BusinessPartner" b ON b.id::TEXT = l.entity_id
        WHERE l.entity_type = 'Vendor'
          AND j.status = 'Posted'
          AND (p_company_id IS NULL OR j.company_id = p_company_id)
        GROUP BY l.entity_id, b.name, l.due_date, j.entry_date::DATE
        HAVING (SUM(l.credit_amount) - SUM(l.debit_amount)) > 0.01
    ) sub;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
