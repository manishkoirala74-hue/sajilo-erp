-- =========================================================================================
-- HOTFIX V16: FIX INVOICE LINE SYNC TRIGGERS
-- =========================================================================================
-- This script updates the database triggers that unpack JSONB line items into the
-- relational SalesInvoiceLine and PurchaseInvoiceLine tables.
-- It explicitly casts the extracted JSON text `item_id` to the strict `UUID` type,
-- preventing the 'column "item_id" is of type uuid but expression is of type text' error.

-- 1. Fix Sales Invoice Trigger Function
CREATE OR REPLACE FUNCTION sync_sales_invoice_lines()
RETURNS TRIGGER AS $$
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
RETURNS TRIGGER AS $$
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
