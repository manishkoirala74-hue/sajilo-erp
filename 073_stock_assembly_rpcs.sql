-- RPC for creating or updating Stock Assembly (Supports Draft mode)
CREATE OR REPLACE FUNCTION public.create_or_update_stock_assembly(
    p_assembly_id UUID,
    p_company_id UUID,
    p_assembly_no VARCHAR(100),
    p_godown_id UUID,
    p_assembly_date DATE,
    p_overhead_cost NUMERIC(15, 4),
    p_status VARCHAR(50),
    p_notes TEXT,
    p_items JSONB -- Array of { id, item_id, line_type, quantity, unit_cost }
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_assembly_id UUID;
    v_item RECORD;
    v_total_cost NUMERIC(15, 4) := 0;
    v_total_wastage NUMERIC(15, 4) := 0;
    v_produced_qty NUMERIC(15, 4) := 0;
    v_calc_unit_cost NUMERIC(15, 4) := 0;
BEGIN
    -- Check permissions (assuming we have a helper function or logic for this in the app)
    -- In Supabase, RLS policies handle standard table operations, but RPCs run with SECURITY DEFINER
    -- We can verify user access here if needed.

    -- 1. Insert or Update Assembly Header
    IF p_assembly_id IS NULL THEN
        INSERT INTO public."StockAssembly" (
            company_id, assembly_no, godown_id, assembly_date, overhead_cost, status, notes
        ) VALUES (
            p_company_id, p_assembly_no, p_godown_id, p_assembly_date, p_overhead_cost, p_status, p_notes
        ) RETURNING id INTO v_assembly_id;
    ELSE
        UPDATE public."StockAssembly"
        SET 
            godown_id = p_godown_id,
            assembly_date = p_assembly_date,
            overhead_cost = p_overhead_cost,
            status = p_status,
            notes = p_notes,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = p_assembly_id AND company_id = p_company_id
        RETURNING id INTO v_assembly_id;
        
        -- Delete existing items if updating
        DELETE FROM public."StockAssemblyItem" WHERE assembly_id = v_assembly_id;
    END IF;

    -- 2. Process Line Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(id UUID, item_id UUID, line_type VARCHAR, quantity NUMERIC, unit_cost NUMERIC)
    LOOP
        INSERT INTO public."StockAssemblyItem" (
            assembly_id, item_id, line_type, quantity, unit_cost
        ) VALUES (
            v_assembly_id, v_item.item_id, v_item.line_type, v_item.quantity, v_item.unit_cost
        );
        
        IF v_item.line_type = 'Consumed' THEN
            v_total_cost := v_total_cost + (v_item.quantity * v_item.unit_cost);
        ELSIF v_item.line_type = 'Wastage' THEN
            v_total_wastage := v_total_wastage + (v_item.quantity * v_item.unit_cost);
        ELSIF v_item.line_type = 'Produced' THEN
            v_produced_qty := v_produced_qty + v_item.quantity;
        END IF;
    END LOOP;

    -- Update total cost on header
    UPDATE public."StockAssembly" SET total_cost = v_total_cost WHERE id = v_assembly_id;

    RETURN v_assembly_id;
END;
$$;

-- RPC for completing a stock assembly with concurrency lock
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
    -- 1. Validate assembly
    SELECT * INTO v_assembly 
    FROM public."StockAssembly" 
    WHERE id = p_assembly_id AND company_id = p_company_id
    FOR UPDATE; -- Lock the assembly record

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock Assembly not found';
    END IF;

    IF v_assembly.status != 'Draft' THEN
        RAISE EXCEPTION 'Only Draft assemblies can be completed';
    END IF;

    -- 2. Concurrency Lock: Lock inventory records for consumed/wastage items
    -- This prevents race conditions where multiple transactions try to consume the last available stock
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

    -- 3. Mark as Completed
    UPDATE public."StockAssembly" 
    SET status = 'Completed', updated_at = CURRENT_TIMESTAMP
    WHERE id = p_assembly_id;

    -- 4. Post to Ledger
    PERFORM public.post_stock_assembly_to_ledger(p_assembly_id);

END;
$$;
