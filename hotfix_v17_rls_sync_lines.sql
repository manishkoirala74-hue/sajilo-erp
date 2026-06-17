-- =========================================================================================
-- HOTFIX V17: RLS BYPASS FOR INVOICE LINE SYNC TRIGGERS
-- =========================================================================================
-- This script adds "SECURITY DEFINER" to the background trigger functions.
-- This allows the triggers to bypass Row-Level Security on the child tables
-- (SalesInvoiceLine and PurchaseInvoiceLine) which only have SELECT policies.
-- Since the user already passed RLS on the parent Invoice table, this is completely safe
-- and much more performant than adding 6 new INSERT/UPDATE/DELETE policies.

-- 1. Fix Sales Invoice Trigger Function
CREATE OR REPLACE FUNCTION sync_sales_invoice_lines()
RETURNS TRIGGER
SECURITY DEFINER
AS $$
BEGIN
    -- Remove existing lines for this invoice to prevent duplicates on update
    DELETE FROM "SalesInvoiceLine" WHERE invoice_id = NEW.id;

    -- Insert unpacked JSONB data into the relational table
    IF NEW.line_items IS NOT NULL THEN
        INSERT INTO "SalesInvoiceLine" (
            invoice_id, invoice_number, invoice_date, company_id,
            item_id, item_name, quantity, unit_price, tax_amount, line_total
        )
        SELECT 
            NEW.id, NEW.invoice_number, NEW.invoice_date, NEW.company_id,
            NULLIF(TRIM(line->>'item_id'), '')::UUID,
            line->>'item_name',
            COALESCE((line->>'quantity')::NUMERIC, 0),
            COALESCE((line->>'unit_price')::NUMERIC, 0),
            COALESCE((line->>'tax_amount')::NUMERIC, 0),
            COALESCE((line->>'line_total')::NUMERIC, 0)
        FROM jsonb_array_elements(NEW.line_items) AS line
        WHERE line->>'item_id' IS NOT NULL AND TRIM(line->>'item_id') != '';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Fix Purchase Invoice Trigger Function
CREATE OR REPLACE FUNCTION sync_purchase_invoice_lines()
RETURNS TRIGGER
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM "PurchaseInvoiceLine" WHERE invoice_id = NEW.id;

    IF NEW.line_items IS NOT NULL THEN
        INSERT INTO "PurchaseInvoiceLine" (
            invoice_id, invoice_number, invoice_date, company_id,
            item_id, item_name, quantity, unit_price, tax_amount, line_total
        )
        SELECT 
            NEW.id, NEW.invoice_number, NEW.invoice_date, NEW.company_id,
            NULLIF(TRIM(line->>'item_id'), '')::UUID,
            line->>'item_name',
            COALESCE((line->>'quantity')::NUMERIC, 0),
            COALESCE((line->>'unit_price')::NUMERIC, 0),
            COALESCE((line->>'tax_amount')::NUMERIC, 0),
            COALESCE((line->>'line_total')::NUMERIC, 0)
        FROM jsonb_array_elements(NEW.line_items) AS line
        WHERE line->>'item_id' IS NOT NULL AND TRIM(line->>'item_id') != '';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
