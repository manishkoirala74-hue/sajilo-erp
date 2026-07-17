-- 105_fix_bank_validation.sql
-- Upgrades the GL validation engine to use strict, backend-only database verification 
-- to protect against frontend JSON manipulation. Optimized for N+1 performance.

BEGIN;

CREATE OR REPLACE FUNCTION rpc_validate_journal_template(p_source_type TEXT, p_gl_lines JSONB, p_source_id UUID)
RETURNS VOID AS $$
DECLARE
    v_has_ar BOOLEAN := FALSE;
    v_has_revenue BOOLEAN := FALSE;
    v_has_cogs BOOLEAN := FALSE;
    v_has_inventory BOOLEAN := FALSE;
    v_physical_items_count INT := 0;
BEGIN
    IF p_source_type = 'SalesInvoice' THEN
        -- Check if invoice contains physical items
        SELECT COUNT(*) INTO v_physical_items_count
        FROM "SalesInvoice" si
        CROSS JOIN jsonb_array_elements(si.line_items) AS li
        JOIN "Item" i ON i.id = NULLIF(TRIM(li->>'item_id'), '')::UUID
        WHERE si.id = p_source_id AND i.is_physical = true;

        -- Evaluate the entire JSON payload against the Chart of Accounts in a single pass.
        -- Note: The Sajilo schema uses 'parent_account_name' to categorize bank/cash/receivables 
        -- instead of 'account_subtype'.
        SELECT 
            COALESCE(bool_or(coa.account_type = 'Asset' AND (
                coa.parent_account_name IN ('Bank Accounts', 'Trade Receivables (Customers)') OR
                coa.account_name IN ('Cash in Hand', 'Accounts Receivable', 'Current Assets') OR
                coa.account_name ILIKE '%Bank%' OR coa.account_name ILIKE '%Cash%'
            )), false),
            COALESCE(bool_or(coa.account_type = 'Revenue' OR coa.parent_account_name = 'Revenue' OR coa.account_name ILIKE '%Sales%'), false),
            COALESCE(bool_or(coa.account_type = 'Expense' AND (coa.parent_account_name ILIKE '%COGS%' OR coa.account_name ILIKE '%COGS%')), false),
            COALESCE(bool_or(coa.account_type = 'Asset' AND (coa.account_name ILIKE '%Inventory%' OR coa.account_name ILIKE '%Stock%')), false)
        INTO 
            v_has_ar, 
            v_has_revenue,
            v_has_cogs,
            v_has_inventory
        FROM jsonb_array_elements(p_gl_lines) AS j(line)
        JOIN "ChartOfAccount" coa ON coa.id = (j.line->>'account_id')::UUID;

        IF NOT v_has_ar THEN
            RAISE EXCEPTION 'ERR_INCOMPLETE_JOURNAL: Missing valid Accounts Receivable or Cash/Bank leg.';
        END IF;

        IF NOT v_has_revenue THEN
            RAISE EXCEPTION 'ERR_INCOMPLETE_JOURNAL: Missing Sales Revenue leg for SalesInvoice.';
        END IF;

        IF v_physical_items_count > 0 THEN
            IF NOT v_has_cogs THEN
                RAISE EXCEPTION 'ERR_INCOMPLETE_JOURNAL: Missing COGS leg for physical sale.';
            END IF;
            IF NOT v_has_inventory THEN
                RAISE EXCEPTION 'ERR_INCOMPLETE_JOURNAL: Missing Inventory leg for physical sale.';
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMIT;
