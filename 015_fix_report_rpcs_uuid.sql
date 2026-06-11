-- FIX UUID TYPE CASTS IN REPORT RPCs
-- Remove the ::TEXT casts because journal_id and account_id are now properly typed as UUID in Prisma.

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
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
    JOIN "ChartOfAccount" c ON l.account_id = c.id
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
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
    JOIN "ChartOfAccount" c ON l.account_id = c.id
    WHERE c.account_type IN ('Expense', 'Cost of Goods Sold', 'OPEX', 'Other Expense')
      AND j.status = 'Posted'
      AND (p_company_id IS NULL OR j.company_id = p_company_id)
      AND (p_from_date IS NULL OR j.entry_date >= p_from_date)
      AND (p_to_date IS NULL OR j.entry_date <= p_to_date)
    GROUP BY j.entry_date, j.voucher_no
    HAVING (SUM(l.debit_amount) - SUM(l.credit_amount)) <> 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- AR Aging Report
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
        sub.entity_id, sub.customer_name,
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
            (v_today - COALESCE(l.due_date, j.entry_date)) as days,
            SUM(l.debit_amount) - SUM(l.credit_amount) as balance
        FROM "GeneralLedgerLine" l
        JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
        LEFT JOIN "BusinessPartner" b ON b.id = l.entity_id
        WHERE l.entity_type = 'Customer'
          AND j.status = 'Posted'
          AND (p_company_id IS NULL OR j.company_id = p_company_id)
        GROUP BY l.entity_id, b.name, l.due_date, j.entry_date
        HAVING (SUM(l.debit_amount) - SUM(l.credit_amount)) > 0.01
    ) sub;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- AP Aging Report
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
        sub.entity_id, sub.vendor_name,
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
            (v_today - COALESCE(l.due_date, j.entry_date)) as days,
            SUM(l.credit_amount) - SUM(l.debit_amount) as balance
        FROM "GeneralLedgerLine" l
        JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
        LEFT JOIN "BusinessPartner" b ON b.id = l.entity_id
        WHERE l.entity_type = 'Vendor'
          AND j.status = 'Posted'
          AND (p_company_id IS NULL OR j.company_id = p_company_id)
        GROUP BY l.entity_id, b.name, l.due_date, j.entry_date
        HAVING (SUM(l.credit_amount) - SUM(l.debit_amount)) > 0.01
    ) sub;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
