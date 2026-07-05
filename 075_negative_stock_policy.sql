-- 075_negative_stock_policy.sql
-- Implements Negative Stock Policy

BEGIN;

-- 1. Add negative_stock_policy to CompanySettings
ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS negative_stock_policy TEXT DEFAULT 'STRICT_BLOCK';

-- 2. Drop the hard SQL check constraint from CurrentStock
ALTER TABLE public."CurrentStock" DROP CONSTRAINT IF EXISTS current_qty_positive;

-- 3. Update the CurrentStock trigger to enforce the policy
CREATE OR REPLACE FUNCTION update_current_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_qty_change NUMERIC;
    v_new_balance NUMERIC;
    v_policy TEXT;
    v_item_name TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_qty_change := COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0);
        
        -- STEP 1: The "Seed"
        INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
        VALUES (NEW.company_id, NEW.godown_id, NEW.item_id, 0)
        ON CONFLICT (company_id, godown_id, item_id) DO NOTHING;

        -- STEP 2: The "Update"
        UPDATE public."CurrentStock" 
        SET current_qty = current_qty + v_qty_change, 
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id
        RETURNING current_qty INTO v_new_balance;

        -- Enforce Negative Stock Policy
        IF v_new_balance < 0 THEN
            SELECT negative_stock_policy INTO v_policy FROM "CompanySettings" WHERE company_id = NEW.company_id;
            IF v_policy = 'STRICT_BLOCK' OR v_policy IS NULL THEN
                SELECT name INTO v_item_name FROM "Item" WHERE id = NEW.item_id;
                RAISE EXCEPTION 'Negative stock not allowed for item % (Policy: STRICT_BLOCK)', COALESCE(v_item_name, NEW.item_id::text);
            END IF;
        END IF;

    ELSIF TG_OP = 'DELETE' THEN
        v_qty_change := COALESCE(OLD.quantity_in, 0) - COALESCE(OLD.quantity_out, 0);
        
        UPDATE public."CurrentStock" 
        SET current_qty = current_qty - v_qty_change, 
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = OLD.company_id AND godown_id = OLD.godown_id AND item_id = OLD.item_id
        RETURNING current_qty INTO v_new_balance;

        IF v_new_balance < 0 THEN
            SELECT negative_stock_policy INTO v_policy FROM "CompanySettings" WHERE company_id = OLD.company_id;
            IF v_policy = 'STRICT_BLOCK' OR v_policy IS NULL THEN
                SELECT name INTO v_item_name FROM "Item" WHERE id = OLD.item_id;
                RAISE EXCEPTION 'Negative stock not allowed for item % (Policy: STRICT_BLOCK)', COALESCE(v_item_name, OLD.item_id::text);
            END IF;
        END IF;
        
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.godown_id != OLD.godown_id OR NEW.item_id != OLD.item_id THEN
            -- Deduct from old location
            UPDATE public."CurrentStock" 
            SET current_qty = current_qty - (COALESCE(OLD.quantity_in, 0) - COALESCE(OLD.quantity_out, 0)), 
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = OLD.company_id AND godown_id = OLD.godown_id AND item_id = OLD.item_id
            RETURNING current_qty INTO v_new_balance;

            IF v_new_balance < 0 THEN
                SELECT negative_stock_policy INTO v_policy FROM "CompanySettings" WHERE company_id = OLD.company_id;
                IF v_policy = 'STRICT_BLOCK' OR v_policy IS NULL THEN
                    SELECT name INTO v_item_name FROM "Item" WHERE id = OLD.item_id;
                    RAISE EXCEPTION 'Negative stock not allowed for item % (Policy: STRICT_BLOCK)', COALESCE(v_item_name, OLD.item_id::text);
                END IF;
            END IF;
            
            -- Seed new location
            INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
            VALUES (NEW.company_id, NEW.godown_id, NEW.item_id, 0)
            ON CONFLICT (company_id, godown_id, item_id) DO NOTHING;

            -- Add to new location
            UPDATE public."CurrentStock" 
            SET current_qty = current_qty + (COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0)), 
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id
            RETURNING current_qty INTO v_new_balance;

            IF v_new_balance < 0 THEN
                SELECT negative_stock_policy INTO v_policy FROM "CompanySettings" WHERE company_id = NEW.company_id;
                IF v_policy = 'STRICT_BLOCK' OR v_policy IS NULL THEN
                    SELECT name INTO v_item_name FROM "Item" WHERE id = NEW.item_id;
                    RAISE EXCEPTION 'Negative stock not allowed for item % (Policy: STRICT_BLOCK)', COALESCE(v_item_name, NEW.item_id::text);
                END IF;
            END IF;

        ELSE
            v_qty_change := (COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0)) - (COALESCE(OLD.quantity_in, 0) - COALESCE(OLD.quantity_out, 0));
            UPDATE public."CurrentStock" 
            SET current_qty = current_qty + v_qty_change, 
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id
            RETURNING current_qty INTO v_new_balance;

            IF v_new_balance < 0 THEN
                SELECT negative_stock_policy INTO v_policy FROM "CompanySettings" WHERE company_id = NEW.company_id;
                IF v_policy = 'STRICT_BLOCK' OR v_policy IS NULL THEN
                    SELECT name INTO v_item_name FROM "Item" WHERE id = NEW.item_id;
                    RAISE EXCEPTION 'Negative stock not allowed for item % (Policy: STRICT_BLOCK)', COALESCE(v_item_name, NEW.item_id::text);
                END IF;
            END IF;
        END IF;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMIT;
