-- 028_item_trading_history.sql
-- Migration to normalize invoice lines into dedicated relational tables for high-performance indexing

-- 1. Create SalesInvoiceLine Table
CREATE TABLE IF NOT EXISTS "SalesInvoiceLine" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES "SalesInvoice"(id) ON DELETE CASCADE,
    invoice_number TEXT,
    invoice_date TIMESTAMP WITH TIME ZONE,
    item_id TEXT,
    item_name TEXT,
    quantity NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    tax_amount NUMERIC DEFAULT 0,
    line_total NUMERIC DEFAULT 0,
    company_id UUID
);

-- 2. Create PurchaseInvoiceLine Table
CREATE TABLE IF NOT EXISTS "PurchaseInvoiceLine" (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES "PurchaseInvoice"(id) ON DELETE CASCADE,
    invoice_number TEXT,
    invoice_date TIMESTAMP WITH TIME ZONE,
    item_id TEXT,
    item_name TEXT,
    quantity NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    tax_amount NUMERIC DEFAULT 0,
    line_total NUMERIC DEFAULT 0,
    company_id UUID
);

-- 3. Create Composite Covered B-Tree Indexes for Sub-Millisecond Scans
-- We use item_id and invoice_date for filtering, and INCLUDE to cover the SELECT clause
CREATE INDEX IF NOT EXISTS idx_sales_line_perf_covering 
ON "SalesInvoiceLine" (item_id, invoice_date DESC) 
INCLUDE (quantity, unit_price, invoice_number);

CREATE INDEX IF NOT EXISTS idx_purchase_line_perf_covering 
ON "PurchaseInvoiceLine" (item_id, invoice_date DESC) 
INCLUDE (quantity, unit_price, invoice_number);

-- 4. Create Sync Triggers to keep relational tables synchronized with JSONB payloads automatically
-- Sales Invoice Trigger Function
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
            line->>'item_id',
            line->>'item_name',
            COALESCE((line->>'quantity')::NUMERIC, 0),
            COALESCE((line->>'unit_price')::NUMERIC, 0),
            COALESCE((line->>'tax_amount')::NUMERIC, 0),
            COALESCE((line->>'line_total')::NUMERIC, 0)
        FROM jsonb_array_elements(NEW.line_items) AS line
        WHERE line->>'item_id' IS NOT NULL AND line->>'item_id' != '';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_sales_lines ON "SalesInvoice";
CREATE TRIGGER trigger_sync_sales_lines
AFTER INSERT OR UPDATE ON "SalesInvoice"
FOR EACH ROW EXECUTE FUNCTION sync_sales_invoice_lines();

-- Purchase Invoice Trigger Function
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
            line->>'item_id',
            line->>'item_name',
            COALESCE((line->>'quantity')::NUMERIC, 0),
            COALESCE((line->>'unit_price')::NUMERIC, 0),
            COALESCE((line->>'tax_amount')::NUMERIC, 0),
            COALESCE((line->>'line_total')::NUMERIC, 0)
        FROM jsonb_array_elements(NEW.line_items) AS line
        WHERE line->>'item_id' IS NOT NULL AND line->>'item_id' != '';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_purchase_lines ON "PurchaseInvoice";
CREATE TRIGGER trigger_sync_purchase_lines
AFTER INSERT OR UPDATE ON "PurchaseInvoice"
FOR EACH ROW EXECUTE FUNCTION sync_purchase_invoice_lines();

-- 5. Backfill Existing Data
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Backfill Sales
    FOR r IN SELECT * FROM "SalesInvoice" LOOP
        DELETE FROM "SalesInvoiceLine" WHERE invoice_id = r.id;
        IF r.line_items IS NOT NULL THEN
            INSERT INTO "SalesInvoiceLine" (
                invoice_id, invoice_number, invoice_date, company_id,
                item_id, item_name, quantity, unit_price, tax_amount, line_total
            )
            SELECT 
                r.id, r.invoice_number, r.invoice_date, r.company_id,
                line->>'item_id',
                line->>'item_name',
                COALESCE((line->>'quantity')::NUMERIC, 0),
                COALESCE((line->>'unit_price')::NUMERIC, 0),
                COALESCE((line->>'tax_amount')::NUMERIC, 0),
                COALESCE((line->>'line_total')::NUMERIC, 0)
            FROM jsonb_array_elements(r.line_items) AS line
            WHERE line->>'item_id' IS NOT NULL AND line->>'item_id' != '';
        END IF;
    END LOOP;

    -- Backfill Purchase
    FOR r IN SELECT * FROM "PurchaseInvoice" LOOP
        DELETE FROM "PurchaseInvoiceLine" WHERE invoice_id = r.id;
        IF r.line_items IS NOT NULL THEN
            INSERT INTO "PurchaseInvoiceLine" (
                invoice_id, invoice_number, invoice_date, company_id,
                item_id, item_name, quantity, unit_price, tax_amount, line_total
            )
            SELECT 
                r.id, r.invoice_number, r.invoice_date, r.company_id,
                line->>'item_id',
                line->>'item_name',
                COALESCE((line->>'quantity')::NUMERIC, 0),
                COALESCE((line->>'unit_price')::NUMERIC, 0),
                COALESCE((line->>'tax_amount')::NUMERIC, 0),
                COALESCE((line->>'line_total')::NUMERIC, 0)
            FROM jsonb_array_elements(r.line_items) AS line
            WHERE line->>'item_id' IS NOT NULL AND line->>'item_id' != '';
        END IF;
    END LOOP;
END;
$$;

-- 6. Create RPC for fast trading history retrieval using Index Only Scans
CREATE OR REPLACE FUNCTION get_item_recent_trading_history_rpc(p_item_id TEXT, p_limit INT DEFAULT 5)
RETURNS TABLE (
    transaction_type TEXT,
    invoice_number TEXT,
    invoice_date TIMESTAMP WITH TIME ZONE,
    quantity NUMERIC,
    unit_price NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    (
        -- Sales History
        SELECT 
            'Sale'::TEXT AS transaction_type,
            sil.invoice_number,
            sil.invoice_date,
            sil.quantity,
            sil.unit_price
        FROM "SalesInvoiceLine" sil
        WHERE sil.item_id = p_item_id
        ORDER BY sil.invoice_date DESC
        LIMIT p_limit
    )
    UNION ALL
    (
        -- Purchase History
        SELECT 
            'Purchase'::TEXT AS transaction_type,
            pil.invoice_number,
            pil.invoice_date,
            pil.quantity,
            pil.unit_price
        FROM "PurchaseInvoiceLine" pil
        WHERE pil.item_id = p_item_id
        ORDER BY pil.invoice_date DESC
        LIMIT p_limit
    )
    ORDER BY invoice_date DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;
