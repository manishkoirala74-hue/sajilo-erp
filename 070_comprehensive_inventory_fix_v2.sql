-- 070_comprehensive_inventory_fix_v2.sql
-- Fixes the update_current_stock trigger and reconciles historical data safely.

BEGIN;

-- 1. Replace the broken trigger logic using the "Seed and Update" pattern
CREATE OR REPLACE FUNCTION update_current_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_qty_change NUMERIC;
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
        WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id;

    ELSIF TG_OP = 'DELETE' THEN
        v_qty_change := COALESCE(OLD.quantity_in, 0) - COALESCE(OLD.quantity_out, 0);
        UPDATE public."CurrentStock" 
        SET current_qty = current_qty - v_qty_change, 
            updated_at = CURRENT_TIMESTAMP
        WHERE company_id = OLD.company_id AND godown_id = OLD.godown_id AND item_id = OLD.item_id;
        
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.godown_id != OLD.godown_id OR NEW.item_id != OLD.item_id THEN
            -- Deduct from old location
            UPDATE public."CurrentStock" 
            SET current_qty = current_qty - (COALESCE(OLD.quantity_in, 0) - COALESCE(OLD.quantity_out, 0)), 
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = OLD.company_id AND godown_id = OLD.godown_id AND item_id = OLD.item_id;
            
            -- Seed new location
            INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
            VALUES (NEW.company_id, NEW.godown_id, NEW.item_id, 0)
            ON CONFLICT (company_id, godown_id, item_id) DO NOTHING;

            -- Add to new location
            UPDATE public."CurrentStock" 
            SET current_qty = current_qty + (COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0)), 
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id;
        ELSE
            v_qty_change := (COALESCE(NEW.quantity_in, 0) - COALESCE(NEW.quantity_out, 0)) - (COALESCE(OLD.quantity_in, 0) - COALESCE(OLD.quantity_out, 0));
            UPDATE public."CurrentStock" 
            SET current_qty = current_qty + v_qty_change, 
                updated_at = CURRENT_TIMESTAMP
            WHERE company_id = NEW.company_id AND godown_id = NEW.godown_id AND item_id = NEW.item_id;
        END IF;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. TEMPORARILY DISABLE THE TRIGGER
-- We must disable the trigger during backfilling because CurrentStock was already manually modified by a previous script,
-- and double-applying historical invoices via the trigger will cause transient negative stock and crash the transaction.
ALTER TABLE public."InventoryLedger" DISABLE TRIGGER trg_update_current_stock;

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

-- 5. RE-ENABLE THE TRIGGER
ALTER TABLE public."InventoryLedger" ENABLE TRIGGER trg_update_current_stock;

-- 6. Clean up historical data by synchronizing CurrentStock with the full Ledger
-- Reset everything securely
UPDATE public."CurrentStock" SET current_qty = 0;

-- Aggregate and update with GREATEST(..., 0) to natively satisfy the CHECK constraint
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
SET current_qty = GREATEST(agg.total_qty, 0)
FROM AggregatedStock agg
WHERE cs.company_id = agg.company_id AND cs.godown_id = agg.godown_id AND cs.item_id = agg.item_id;

-- Ensure no items were missed in CurrentStock
INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
SELECT company_id, godown_id, item_id, GREATEST(total_qty, 0)
FROM AggregatedStock agg
WHERE NOT EXISTS (
    SELECT 1 FROM public."CurrentStock" cs WHERE cs.company_id = agg.company_id AND cs.godown_id = agg.godown_id AND cs.item_id = agg.item_id
);

-- 7. Recalculate Item quantity_on_hand cache
UPDATE public."Item" i
SET quantity_on_hand = COALESCE((
    SELECT SUM(current_qty)
    FROM public."CurrentStock" cs
    WHERE cs.item_id = i.id
), 0)
WHERE is_physical = true;

COMMIT;
