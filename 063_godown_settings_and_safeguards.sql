-- 063_godown_settings_and_safeguards.sql
-- Phase 2: Global Toggle & Backend Safeguards

-- 1. Add feature toggle to CompanySettings
ALTER TABLE public."CompanySettings" ADD COLUMN IF NOT EXISTS enable_godown_management BOOLEAN DEFAULT false;

-- 2. Create the Automatic Injection Trigger Function
-- This function guarantees that any invoice (Sales or Purchase) missing a godown_id 
-- will automatically be assigned to the main godown for that company.
CREATE OR REPLACE FUNCTION inject_default_godown_id()
RETURNS TRIGGER AS $$
DECLARE
    v_main_godown_id UUID;
BEGIN
    -- If godown_id is missing, we must fallback to the main godown
    IF NEW.godown_id IS NULL THEN
        SELECT id INTO v_main_godown_id 
        FROM public."Godown" 
        WHERE company_id = NEW.company_id AND is_main = true 
        LIMIT 1;

        -- If a main godown exists, inject it
        IF v_main_godown_id IS NOT NULL THEN
            NEW.godown_id := v_main_godown_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger to SalesInvoice
DROP TRIGGER IF EXISTS ensure_godown_id_sales ON public."SalesInvoice";
CREATE TRIGGER ensure_godown_id_sales
    BEFORE INSERT OR UPDATE
    ON public."SalesInvoice"
    FOR EACH ROW
    EXECUTE FUNCTION inject_default_godown_id();

-- 4. Attach trigger to PurchaseInvoice
DROP TRIGGER IF EXISTS ensure_godown_id_purchase ON public."PurchaseInvoice";
CREATE TRIGGER ensure_godown_id_purchase
    BEFORE INSERT OR UPDATE
    ON public."PurchaseInvoice"
    FOR EACH ROW
    EXECUTE FUNCTION inject_default_godown_id();
