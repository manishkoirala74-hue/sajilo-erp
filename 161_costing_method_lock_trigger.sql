-- 161_costing_method_lock_trigger.sql
-- Prevents default_costing_method from being changed after any inventory
-- movement has been recorded in InventoryHistory.
-- Checking InventoryHistory (not just PurchaseInvoice) ensures all stock
-- ingestion vectors (adjustments, assembly, returns) trigger the lock.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_costing_method_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_transactions BOOLEAN;
BEGIN
  -- Short-circuit: no-op if costing method hasn't actually changed
  IF OLD.default_costing_method IS NOT DISTINCT FROM NEW.default_costing_method THEN
    RETURN NEW;
  END IF;

  -- Check InventoryHistory for ANY inventory movement across all vectors:
  -- PurchaseInvoice, StockAdjustment, StockAssembly, SalesReturn, etc.
  SELECT EXISTS (
    SELECT 1
    FROM public."InventoryHistory"
    WHERE company_id = NEW.company_id
    LIMIT 1
  ) INTO v_has_transactions;

  IF v_has_transactions THEN
    RAISE EXCEPTION
      'COSTING_METHOD_LOCKED: The costing method cannot be changed after inventory transactions have been posted. Contact your system administrator if a change is absolutely required.'
    USING ERRCODE = 'P0003';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lock_costing_method ON public."CompanySettings";
CREATE TRIGGER lock_costing_method
  BEFORE UPDATE ON public."CompanySettings"
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_costing_method_change();

COMMIT;
