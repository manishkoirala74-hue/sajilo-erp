-- 062_godown_management_schema.sql
-- Godown Management System Phase 1

-- 1. Create or Modify Godown Master Table
CREATE TABLE IF NOT EXISTS public."Godown" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL
);

ALTER TABLE public."Godown" ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE public."Godown" ADD COLUMN IF NOT EXISTS godown_name VARCHAR(255);
ALTER TABLE public."Godown" ADD COLUMN IF NOT EXISTS is_main BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public."Godown" ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'Active';
ALTER TABLE public."Godown" ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."Godown" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Update any existing godowns that might have a null name
UPDATE public."Godown" SET name = 'Default Godown' WHERE name IS NULL;

-- Ensure only one main godown per company
DROP INDEX IF EXISTS idx_single_main_godown;
CREATE UNIQUE INDEX idx_single_main_godown ON public."Godown" (company_id) WHERE is_main = true;

-- Enable RLS
ALTER TABLE public."Godown" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Enable read access for authenticated users" ON public."Godown" FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Enable insert for authenticated users" ON public."Godown" FOR INSERT WITH CHECK (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
    CREATE POLICY "Enable update for authenticated users" ON public."Godown" FOR UPDATE USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Create or Modify InventoryLedger Table (Centralized Stock Ledger)
CREATE TABLE IF NOT EXISTS public."InventoryLedger" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL
);

ALTER TABLE public."InventoryLedger" ADD COLUMN IF NOT EXISTS item_id UUID;
-- Force item_id to be UUID in case it was created as TEXT in previous runs
ALTER TABLE public."InventoryLedger" ALTER COLUMN item_id TYPE UUID USING item_id::TEXT::UUID;

ALTER TABLE public."InventoryLedger" ADD COLUMN IF NOT EXISTS transaction_type VARCHAR(50);
ALTER TABLE public."InventoryLedger" ADD COLUMN IF NOT EXISTS godown_id UUID;
ALTER TABLE public."InventoryLedger" ADD COLUMN IF NOT EXISTS quantity_in NUMERIC(15, 4) DEFAULT 0;
ALTER TABLE public."InventoryLedger" ADD COLUMN IF NOT EXISTS quantity_out NUMERIC(15, 4) DEFAULT 0;
ALTER TABLE public."InventoryLedger" ADD COLUMN IF NOT EXISTS transaction_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."InventoryLedger" ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Foreign key is added later after backfill to avoid constraint errors if godown_id is null

-- Enable RLS
ALTER TABLE public."InventoryLedger" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Enable read access for authenticated users" ON public."InventoryLedger" FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Modify existing transaction tables
ALTER TABLE public."PurchaseInvoice" ADD COLUMN IF NOT EXISTS godown_id UUID;
ALTER TABLE public."SalesInvoice" ADD COLUMN IF NOT EXISTS godown_id UUID;

-- 4. Create or Modify CurrentStock Aggregation Table
CREATE TABLE IF NOT EXISTS public."CurrentStock" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL
);

ALTER TABLE public."CurrentStock" ADD COLUMN IF NOT EXISTS godown_id UUID;
ALTER TABLE public."CurrentStock" ADD COLUMN IF NOT EXISTS item_id UUID;
-- Force item_id to be UUID in case it was created as TEXT in previous runs
ALTER TABLE public."CurrentStock" ALTER COLUMN item_id TYPE UUID USING item_id::TEXT::UUID;

ALTER TABLE public."CurrentStock" ADD COLUMN IF NOT EXISTS current_qty NUMERIC(15, 4) NOT NULL DEFAULT 0.0000;
ALTER TABLE public."CurrentStock" ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."CurrentStock" ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Cleanup any nulls if the table already existed
DELETE FROM public."CurrentStock" WHERE godown_id IS NULL OR item_id IS NULL;

-- Apply Unique Constraint required for ON CONFLICT upsert
DO $$ BEGIN
    ALTER TABLE public."CurrentStock" ADD CONSTRAINT uq_company_godown_item UNIQUE (company_id, godown_id, item_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5. Data Migration & Seeding Block (MUST RUN BEFORE TRIGGER)
DO $$
DECLARE
    comp RECORD;
    new_godown_id UUID;
BEGIN
    -- Only backfill if there's no data in InventoryLedger (initial run)
    IF (SELECT COUNT(*) FROM public."InventoryLedger") = 0 THEN
        -- Backfill InventoryLedger from Invoice Lines
        INSERT INTO public."InventoryLedger" (company_id, item_id, transaction_type, quantity_in, transaction_date)
        SELECT company_id, item_id, 'Purchase', quantity, invoice_date
        FROM public."PurchaseInvoiceLine"
        WHERE item_id IS NOT NULL;
        
        INSERT INTO public."InventoryLedger" (company_id, item_id, transaction_type, quantity_out, transaction_date)
        SELECT company_id, item_id, 'Sale', quantity, invoice_date
        FROM public."SalesInvoiceLine"
        WHERE item_id IS NOT NULL;
    END IF;

    -- Iterate through distinct companies
    FOR comp IN SELECT DISTINCT id AS company_id FROM public."Company" LOOP
        -- Check if main godown exists
        SELECT id INTO new_godown_id FROM public."Godown" WHERE company_id = comp.company_id AND is_main = true;
        
        IF new_godown_id IS NULL THEN
            -- Create main godown. Provide both 'name' and 'godown_name' to handle legacy schemas.
            INSERT INTO public."Godown" (company_id, name, godown_name, is_main, status)
            VALUES (comp.company_id, 'Main Location', 'Main Location', true, 'Active')
            RETURNING id INTO new_godown_id;
        END IF;

        -- Update historical records
        UPDATE public."InventoryLedger" SET godown_id = new_godown_id WHERE company_id = comp.company_id AND godown_id IS NULL;
        UPDATE public."PurchaseInvoice" SET godown_id = new_godown_id WHERE company_id = comp.company_id AND godown_id IS NULL;
        UPDATE public."SalesInvoice" SET godown_id = new_godown_id WHERE company_id = comp.company_id AND godown_id IS NULL;
        
        -- Seed CurrentStock from backfilled InventoryLedger
        INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
        SELECT company_id, godown_id, item_id, SUM(quantity_in) - SUM(quantity_out)
        FROM public."InventoryLedger"
        WHERE company_id = comp.company_id AND godown_id = new_godown_id
        GROUP BY company_id, godown_id, item_id
        HAVING (SUM(quantity_in) - SUM(quantity_out)) >= 0
        ON CONFLICT (company_id, godown_id, item_id) 
        DO UPDATE SET current_qty = EXCLUDED.current_qty;

    END LOOP;
END $$;

-- 6. Apply strict constraints now that data is clean
ALTER TABLE public."CurrentStock" ALTER COLUMN godown_id SET NOT NULL;
ALTER TABLE public."CurrentStock" ALTER COLUMN item_id SET NOT NULL;

DO $$ BEGIN
    ALTER TABLE public."InventoryLedger" ADD CONSTRAINT fk_ledger_godown FOREIGN KEY (godown_id) REFERENCES public."Godown" (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."InventoryLedger" ADD CONSTRAINT fk_ledger_item FOREIGN KEY (item_id) REFERENCES public."Item" (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."PurchaseInvoice" ADD CONSTRAINT fk_purchase_godown FOREIGN KEY (godown_id) REFERENCES public."Godown" (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."SalesInvoice" ADD CONSTRAINT fk_sales_godown FOREIGN KEY (godown_id) REFERENCES public."Godown" (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."CurrentStock" ADD CONSTRAINT fk_currentstock_godown FOREIGN KEY (godown_id) REFERENCES public."Godown" (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."CurrentStock" ADD CONSTRAINT fk_currentstock_item FOREIGN KEY (item_id) REFERENCES public."Item" (id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE public."CurrentStock" ADD CONSTRAINT current_qty_positive CHECK (current_qty >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;



-- Enable RLS
ALTER TABLE public."CurrentStock" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    CREATE POLICY "Enable read access for authenticated users" ON public."CurrentStock" FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- 7. Trigger Function to Update CurrentStock
CREATE OR REPLACE FUNCTION update_current_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_qty_change NUMERIC;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_qty_change := COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0);
        
        INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
        VALUES (NEW.company_id, NEW.godown_id, NEW.item_id, v_qty_change)
        ON CONFLICT (company_id, godown_id, item_id) 
        DO UPDATE SET 
            current_qty = public."CurrentStock".current_qty + EXCLUDED.current_qty,
            updated_at = CURRENT_TIMESTAMP;

    ELSIF TG_OP = 'DELETE' THEN
        v_qty_change := COALESCE(OLD.quantity_in, 0) - COALESCE(OLD.quantity_out, 0);
        
        UPDATE public."CurrentStock" 
        SET current_qty = current_qty - v_qty_change,
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = OLD.company_id AND godown_id = OLD.godown_id AND item_id = OLD.item_id;

    ELSIF TG_OP = 'UPDATE' THEN
        v_qty_change := (COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0)) - (COALESCE(OLD.quantity_in, 0) - COALESCE(OLD.quantity_out, 0));
        
        IF NEW.godown_id != OLD.godown_id OR NEW.item_id != OLD.item_id THEN
            -- Remove from old
            UPDATE public."CurrentStock" 
            SET current_qty = current_qty - (COALESCE(OLD.quantity_in, 0) - COALESCE(OLD.quantity_out, 0)),
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = OLD.company_id AND godown_id = OLD.godown_id AND item_id = OLD.item_id;
            
            -- Add to new
            INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
            VALUES (NEW.company_id, NEW.godown_id, NEW.item_id, (COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0)))
            ON CONFLICT (company_id, godown_id, item_id) 
            DO UPDATE SET 
                current_qty = public."CurrentStock".current_qty + EXCLUDED.current_qty,
                updated_at = CURRENT_TIMESTAMP;
        ELSE
            -- Simple quantity update
            UPDATE public."CurrentStock" 
            SET current_qty = current_qty + v_qty_change,
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to InventoryLedger (After backfill is completely done)
DROP TRIGGER IF EXISTS trg_update_current_stock ON public."InventoryLedger";
CREATE TRIGGER trg_update_current_stock
AFTER INSERT OR UPDATE OR DELETE ON public."InventoryLedger"
FOR EACH ROW
EXECUTE FUNCTION update_current_stock();
