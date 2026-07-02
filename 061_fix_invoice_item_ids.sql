-- 061_fix_invoice_item_ids.sql
-- Upgrades item_id to UUID in Invoice Lines and enforces strict referential integrity

DO $$ 
DECLARE
    v_legacy_item_id UUID;
    v_company_id UUID;
BEGIN
    -- 1. Legacy Item Rescue
    -- We need a company to assign the legacy item to. Pick the first company, or we could make it company independent if allowed, 
    -- but usually Item requires a company_id in SaaS ERPs. We'll find the first active company.
    SELECT id INTO v_company_id FROM "Company" LIMIT 1;

    -- Check if Legacy Item already exists
    SELECT id INTO v_legacy_item_id FROM "Item" WHERE item_name = 'Legacy / Deleted Item' LIMIT 1;
    
    IF v_legacy_item_id IS NULL THEN
        -- Generate a new UUID for the legacy item
        v_legacy_item_id := gen_random_uuid();
        
        INSERT INTO "Item" (id, company_id, item_code, item_name, item_type)
        VALUES (v_legacy_item_id, v_company_id, 'LEGACY-DEL', 'Legacy / Deleted Item', 'Product');
    END IF;

    -- 2. The Ghost Row Purge & Clean Up
    -- We explicitly cast item_id to TEXT during the check just in case the column was already altered to UUID in a partial run.
    
    -- Delete useless ghosts (0 qty, 0 total, empty item_id)
    DELETE FROM "SalesInvoiceLine" 
    WHERE TRIM(COALESCE(item_id::TEXT, '')) = '' AND COALESCE(quantity, 0) = 0 AND COALESCE(line_total, 0) = 0;
    
    DELETE FROM "PurchaseInvoiceLine" 
    WHERE TRIM(COALESCE(item_id::TEXT, '')) = '' AND COALESCE(quantity, 0) = 0 AND COALESCE(line_total, 0) = 0;

    -- Preserve financial descriptions (set to NULL)
    UPDATE "SalesInvoiceLine" SET item_id = NULL WHERE TRIM(COALESCE(item_id::TEXT, '')) = '';
    UPDATE "PurchaseInvoiceLine" SET item_id = NULL WHERE TRIM(COALESCE(item_id::TEXT, '')) = '';

    -- 3. Re-map Orphans
    -- An orphan is an item_id that is NOT NULL, but either isn't a valid UUID format, 
    -- or is a valid UUID but doesn't exist in the Item table.
    
    -- SalesInvoiceLine Orphans
    EXECUTE format('
        UPDATE "SalesInvoiceLine"
        SET item_id = %L
        WHERE item_id IS NOT NULL 
        AND (
            item_id::TEXT !~ ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
            OR NOT EXISTS (SELECT 1 FROM "Item" WHERE id::TEXT = "SalesInvoiceLine".item_id::TEXT)
        )
    ', v_legacy_item_id::TEXT);

    -- PurchaseInvoiceLine Orphans
    EXECUTE format('
        UPDATE "PurchaseInvoiceLine"
        SET item_id = %L
        WHERE item_id IS NOT NULL 
        AND (
            item_id::TEXT !~ ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$''
            OR NOT EXISTS (SELECT 1 FROM "Item" WHERE id::TEXT = "PurchaseInvoiceLine".item_id::TEXT)
        )
    ', v_legacy_item_id::TEXT);

END $$;

-- 4. Type Upgrade
-- Now that all remaining item_ids are either NULL or perfectly valid UUIDs that exist in Item, we can cast.
-- Drop indexes first because they depend on the column type.
DROP INDEX IF EXISTS idx_sales_line_perf_covering;
DROP INDEX IF EXISTS idx_purchase_line_perf_covering;

ALTER TABLE "SalesInvoiceLine" ALTER COLUMN item_id TYPE UUID USING item_id::TEXT::UUID;
ALTER TABLE "PurchaseInvoiceLine" ALTER COLUMN item_id TYPE UUID USING item_id::TEXT::UUID;

-- Recreate Indexes
CREATE INDEX IF NOT EXISTS idx_sales_line_perf_covering 
ON "SalesInvoiceLine" (item_id, invoice_date DESC) 
INCLUDE (quantity, unit_price, invoice_number);

CREATE INDEX IF NOT EXISTS idx_purchase_line_perf_covering 
ON "PurchaseInvoiceLine" (item_id, invoice_date DESC) 
INCLUDE (quantity, unit_price, invoice_number);

-- 5. Strict Foreign Keys
DO $$ BEGIN
    ALTER TABLE "SalesInvoiceLine" ADD CONSTRAINT fk_sales_line_item FOREIGN KEY (item_id) REFERENCES "Item"(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE "PurchaseInvoiceLine" ADD CONSTRAINT fk_purchase_line_item FOREIGN KEY (item_id) REFERENCES "Item"(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 6. Trigger Fixes
CREATE OR REPLACE FUNCTION sync_sales_invoice_lines()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM "SalesInvoiceLine" WHERE invoice_id = NEW.id;

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
        FROM jsonb_array_elements(NEW.line_items) AS line;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
        FROM jsonb_array_elements(NEW.line_items) AS line;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. RPC Fix
DROP FUNCTION IF EXISTS get_item_recent_trading_history_rpc(TEXT, INT);

CREATE OR REPLACE FUNCTION get_item_recent_trading_history_rpc(p_item_id UUID, p_limit INT DEFAULT 5)
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
