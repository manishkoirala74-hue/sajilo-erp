-- ============================================================================
-- 137_stock_assembly_atomic_posting_rollback.sql
-- Rollback for 137_stock_assembly_atomic_posting.sql
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.rpc_complete_stock_assembly(UUID, UUID);

CREATE OR REPLACE FUNCTION public.complete_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_assembly RECORD;
    v_item RECORD;
BEGIN
    SELECT * INTO v_assembly 
    FROM public."StockAssembly" 
    WHERE id = p_assembly_id AND company_id = p_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock Assembly not found';
    END IF;

    IF v_assembly.status != 'Draft' THEN
        RAISE EXCEPTION 'Only Draft assemblies can be completed';
    END IF;

    PERFORM 1
    FROM public."CurrentStock"
    WHERE company_id = p_company_id 
      AND godown_id = v_assembly.godown_id
      AND item_id IN (
          SELECT item_id 
          FROM public."StockAssemblyItem" 
          WHERE assembly_id = p_assembly_id AND line_type IN ('Consumed', 'Wastage')
      )
    FOR UPDATE;

    UPDATE public."StockAssembly" 
    SET status = 'Completed', updated_at = CURRENT_TIMESTAMP
    WHERE id = p_assembly_id;

    PERFORM public.post_stock_assembly_to_ledger(p_assembly_id);

END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_stock_assembly(UUID, UUID) TO authenticated;

COMMIT;
