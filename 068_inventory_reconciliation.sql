-- 068_inventory_reconciliation.sql
-- Fixes missing InventoryLedger entries for posted invoices, recalculates all stock, and fixes the ON CONFLICT bug in the trigger.

BEGIN;

-- 1. Fix the trigger to avoid Postgres CHECK constraint validation on virtual INSERT rows before ON CONFLICT
CREATE OR REPLACE FUNCTION update_current_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_qty_change NUMERIC;
    v_exists BOOLEAN;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_qty_change := COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0);
        
        -- Check if row exists first to avoid ON CONFLICT constraint evaluation bugs
        SELECT EXISTS(
            SELECT 1 FROM public."CurrentStock" 
            WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id
        ) INTO v_exists;
        
        IF v_exists THEN
            UPDATE public."CurrentStock" 
            SET 
                current_qty = current_qty + v_qty_change,
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id;
        ELSE
            INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
            VALUES (NEW.company_id, NEW.godown_id, NEW.item_id, GREATEST(v_qty_change, 0)); -- Initialize to at least 0 if negative
        END IF;

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
            SELECT EXISTS(
                SELECT 1 FROM public."CurrentStock" 
                WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id
            ) INTO v_exists;

            IF v_exists THEN
                UPDATE public."CurrentStock" 
                SET 
                    current_qty = current_qty + (COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0)),
                    updated_at = CURRENT_TIMESTAMP
                WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id;
            ELSE
                INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
                VALUES (NEW.company_id, NEW.godown_id, NEW.item_id, GREATEST((COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0)), 0));
            END IF;
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

-- 2. Drop constraint to allow historical negative stock reconciliation
ALTER TABLE public."CurrentStock" DROP CONSTRAINT IF EXISTS current_qty_positive;

-- 3. Insert missing PurchaseInvoice ledger entries
INSERT INTO public."InventoryLedger" (
    company_id, item_id, transaction_type, godown_id, quantity_in, quantity_out, 
    transaction_date, reference_id, reference_type, ledger_status
)
SELECT 
    pi.company_id,
    (li->>'item_id')::UUID,
    'PurchaseInvoice',
    pi.godown_id,
    (li->>'quantity')::NUMERIC,
    0,
    pi.invoice_date,
    pi.id,
    'PurchaseInvoice',
    'Active'
FROM public."PurchaseInvoice" pi
JOIN LATERAL jsonb_array_elements(pi.line_items) li ON true
WHERE pi.status = 'Posted'
  AND (li->>'item_id') IS NOT NULL
  AND (li->>'item_id') != ''
  AND NOT EXISTS (
      SELECT 1 FROM public."InventoryLedger" il 
      WHERE il.reference_id = pi.id AND il.reference_type = 'PurchaseInvoice' AND il.item_id = (li->>'item_id')::UUID
  );

-- 4. Insert missing SalesInvoice ledger entries
INSERT INTO public."InventoryLedger" (
    company_id, item_id, transaction_type, godown_id, quantity_in, quantity_out, 
    transaction_date, reference_id, reference_type, ledger_status
)
SELECT 
    si.company_id,
    (li->>'item_id')::UUID,
    'SalesInvoice',
    si.godown_id,
    0,
    (li->>'quantity')::NUMERIC,
    si.invoice_date,
    si.id,
    'SalesInvoice',
    'Active'
FROM public."SalesInvoice" si
JOIN LATERAL jsonb_array_elements(si.line_items) li ON true
WHERE si.status = 'Posted'
  AND (li->>'item_id') IS NOT NULL
  AND (li->>'item_id') != ''
  AND NOT EXISTS (
      SELECT 1 FROM public."InventoryLedger" il 
      WHERE il.reference_id = si.id AND il.reference_type = 'SalesInvoice' AND il.item_id = (li->>'item_id')::UUID
  );

-- 5. Recalculate CurrentStock based on InventoryLedger
-- Reset all CurrentStock to 0
UPDATE public."CurrentStock" SET current_qty = 0;

-- Then, aggregate from InventoryLedger
WITH AggregatedStock AS (
    SELECT 
        company_id,
        godown_id,
        item_id,
        COALESCE(SUM(quantity_in), 0) - COALESCE(SUM(quantity_out), 0) as total_qty
    FROM public."InventoryLedger"
    WHERE ledger_status = 'Active'
    GROUP BY company_id, godown_id, item_id
)
UPDATE public."CurrentStock" cs
SET current_qty = agg.total_qty
FROM AggregatedStock agg
WHERE cs.company_id = agg.company_id AND cs.godown_id = agg.godown_id AND cs.item_id = agg.item_id;

INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
SELECT company_id, godown_id, item_id, total_qty
FROM AggregatedStock agg
WHERE NOT EXISTS (
    SELECT 1 FROM public."CurrentStock" cs WHERE cs.company_id = agg.company_id AND cs.godown_id = agg.godown_id AND cs.item_id = agg.item_id
);

-- Fix any remaining negative stock to 0 to respect physical reality
UPDATE public."CurrentStock" SET current_qty = 0 WHERE current_qty < 0;

-- 6. Re-add constraint
ALTER TABLE public."CurrentStock" ADD CONSTRAINT current_qty_positive CHECK (current_qty >= 0);

-- 7. Recalculate Item quantity_on_hand based on CurrentStock
UPDATE public."Item" i
SET quantity_on_hand = COALESCE((
    SELECT SUM(current_qty)
    FROM public."CurrentStock" cs
    WHERE cs.item_id = i.id
), 0)
WHERE is_physical = true;

COMMIT;
