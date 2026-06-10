-- 1. SCHEMA ENHANCEMENTS
ALTER TABLE "GeneralLedgerLine"
ADD COLUMN IF NOT EXISTS "entity_type" TEXT,
ADD COLUMN IF NOT EXISTS "entity_id" UUID,
ADD COLUMN IF NOT EXISTS "due_date" DATE;

CREATE INDEX IF NOT EXISTS idx_gline_entity ON "GeneralLedgerLine"(entity_type, entity_id);

-- 2. UPDATE RPC TO CAPTURE NEW COLUMNS
CREATE OR REPLACE FUNCTION rpc_post_gl_transaction(
    p_company_id UUID,
    p_date DATE,
    p_description TEXT,
    p_module TEXT,
    p_source_id UUID,
    p_source_type TEXT,
    p_lines JSONB,
    p_is_reversal BOOLEAN DEFAULT false,
    p_lock_cogs BOOLEAN DEFAULT false
) RETURNS UUID AS $$
DECLARE
    v_journal_id UUID;
    v_line JSONB;
    v_item_id UUID;
    v_cost_at_sale NUMERIC;
    v_total_debit NUMERIC := 0;
    v_total_credit NUMERIC := 0;
    v_dr NUMERIC;
    v_cr NUMERIC;
    v_cogs_acc UUID;
    v_inv_acc UUID;
    v_qty NUMERIC;
BEGIN
    INSERT INTO "GeneralLedgerJournal" (
        company_id, entry_date, description, reference_module, 
        source_document_id, source_document_type, status, total_debit, total_credit, is_balanced
    ) VALUES (
        p_company_id, p_date, p_description, p_module, 
        p_source_id, p_source_type, 'Posted', 0, 0, false
    ) RETURNING id INTO v_journal_id;

    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_dr := COALESCE((v_line->>'debit_amount')::NUMERIC, 0);
        v_cr := COALESCE((v_line->>'credit_amount')::NUMERIC, 0);

        IF v_dr > 0 OR v_cr > 0 THEN
            INSERT INTO "GeneralLedgerLine" (
                journal_id, account_id, account_code, account_name, account_type,
                debit_amount, credit_amount, description,
                entity_type, entity_id, due_date
            ) VALUES (
                v_journal_id, 
                (v_line->>'account_id')::UUID, 
                v_line->>'account_code', 
                v_line->>'account_name', 
                v_line->>'account_type',
                v_dr, v_cr, 
                COALESCE(v_line->>'description', p_description),
                v_line->>'entity_type',
                (v_line->>'entity_id')::UUID,
                (v_line->>'due_date')::DATE
            );
            v_total_debit := v_total_debit + v_dr;
            v_total_credit := v_total_credit + v_cr;
        END IF;

        IF p_lock_cogs = true AND (v_line->>'item_id') IS NOT NULL AND (v_line->>'is_physical')::BOOLEAN = true THEN
            v_item_id := (v_line->>'item_id')::UUID;
            v_qty := (v_line->>'quantity')::NUMERIC;
            
            IF p_is_reversal THEN
                v_cost_at_sale := (v_line->>'cost_at_sale')::NUMERIC;
            ELSE
                SELECT COALESCE(current_unit_cost, weighted_average_cost, 0) 
                INTO v_cost_at_sale 
                FROM "Item" WHERE id = v_item_id FOR SHARE;
            END IF;

            v_cogs_acc := (v_line->>'cogs_account_id')::UUID;
            v_inv_acc := (v_line->>'inventory_account_id')::UUID;

            IF v_cogs_acc IS NOT NULL AND v_inv_acc IS NOT NULL AND v_cost_at_sale > 0 THEN
                IF p_is_reversal THEN
                    INSERT INTO "GeneralLedgerLine" (journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (v_journal_id, v_inv_acc, (v_qty * v_cost_at_sale), 0, 'Return in: ' || (v_line->>'item_name'));
                    
                    INSERT INTO "GeneralLedgerLine" (journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (v_journal_id, v_cogs_acc, 0, (v_qty * v_cost_at_sale), 'COGS reversal: ' || (v_line->>'item_name'));
                ELSE
                    INSERT INTO "GeneralLedgerLine" (journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (v_journal_id, v_cogs_acc, (v_qty * v_cost_at_sale), 0, 'COGS: ' || (v_line->>'item_name'));
                    
                    INSERT INTO "GeneralLedgerLine" (journal_id, account_id, debit_amount, credit_amount, description) 
                    VALUES (v_journal_id, v_inv_acc, 0, (v_qty * v_cost_at_sale), 'Inventory out: ' || (v_line->>'item_name'));
                END IF;

                v_total_debit := v_total_debit + (v_qty * v_cost_at_sale);
                v_total_credit := v_total_credit + (v_qty * v_cost_at_sale);
            END IF;
        END IF;
    END LOOP;

    UPDATE "GeneralLedgerJournal"
    SET total_debit = v_total_debit, total_credit = v_total_credit, is_balanced = (v_total_debit = v_total_credit)
    WHERE id = v_journal_id;

    RETURN v_journal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. HISTORICAL DATA MIGRATION
UPDATE "GeneralLedgerLine" l
SET entity_type = 'Customer', entity_id = s.customer_id, due_date = COALESCE(s.due_date, s.invoice_date)
FROM "GeneralLedgerJournal" j JOIN "SalesInvoice" s ON j.source_document_id = s.id::TEXT
WHERE l.journal_id::TEXT = j.id::TEXT AND j.source_document_type = 'SalesInvoice' AND l.entity_id IS NULL;

UPDATE "GeneralLedgerLine" l
SET entity_type = 'Vendor', entity_id = p.vendor_id, due_date = COALESCE(p.due_date, p.invoice_date)
FROM "GeneralLedgerJournal" j JOIN "PurchaseInvoice" p ON j.source_document_id = p.id::TEXT
WHERE l.journal_id::TEXT = j.id::TEXT AND j.source_document_type = 'PurchaseInvoice' AND l.entity_id IS NULL;

UPDATE "GeneralLedgerLine" l
SET entity_type = 'Customer', entity_id = p.customer_id, due_date = p.sale_date
FROM "GeneralLedgerJournal" j JOIN "POSSale" p ON j.source_document_id = p.id::TEXT
WHERE l.journal_id::TEXT = j.id::TEXT AND j.source_document_type = 'POSSale' AND l.entity_id IS NULL;


-- 4. DB LAYER REPORTING AGGREGATES

-- Customer Balances Report
CREATE OR REPLACE FUNCTION get_customer_balances_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
    customer_id UUID,
    customer_name TEXT,
    balance NUMERIC,
    total_invoiced NUMERIC,
    total_paid NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.entity_id as customer_id,
        b.name as customer_name,
        SUM(l.debit_amount) - SUM(l.credit_amount) as balance,
        SUM(l.debit_amount) as total_invoiced,
        SUM(l.credit_amount) as total_paid
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
    LEFT JOIN "BusinessPartner" b ON b.id = l.entity_id
    WHERE l.entity_type = 'Customer'
      AND j.status = 'Posted'
      AND (p_company_id IS NULL OR j.company_id = p_company_id)
      AND (p_from_date IS NULL OR j.entry_date >= p_from_date)
      AND (p_to_date IS NULL OR j.entry_date <= p_to_date)
    GROUP BY l.entity_id, b.name
    HAVING ABS(SUM(l.debit_amount) - SUM(l.credit_amount)) > 0.01;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vendor Balances Report
CREATE OR REPLACE FUNCTION get_vendor_balances_rpc(p_company_id UUID, p_from_date DATE, p_to_date DATE)
RETURNS TABLE (
    vendor_id UUID,
    vendor_name TEXT,
    balance NUMERIC,
    total_billed NUMERIC,
    total_paid NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.entity_id as vendor_id,
        b.name as vendor_name,
        SUM(l.credit_amount) - SUM(l.debit_amount) as balance,
        SUM(l.credit_amount) as total_billed,
        SUM(l.debit_amount) as total_paid
    FROM "GeneralLedgerLine" l
    JOIN "GeneralLedgerJournal" j ON l.journal_id = j.id
    LEFT JOIN "BusinessPartner" b ON b.id = l.entity_id
    WHERE l.entity_type = 'Vendor'
      AND j.status = 'Posted'
      AND (p_company_id IS NULL OR j.company_id = p_company_id)
      AND (p_from_date IS NULL OR j.entry_date >= p_from_date)
      AND (p_to_date IS NULL OR j.entry_date <= p_to_date)
    GROUP BY l.entity_id, b.name
    HAVING ABS(SUM(l.credit_amount) - SUM(l.debit_amount)) > 0.01;
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

-- Sales Summary Report (Revenue from GL)
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

-- Purchase Summary Report (Expenses from GL)
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
