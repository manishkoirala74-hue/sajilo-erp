-- 1. Create StockAssembly Table (Header)
CREATE TABLE IF NOT EXISTS public."StockAssembly" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public."Company"(id) ON DELETE CASCADE,
    assembly_no VARCHAR(100) NOT NULL,
    godown_id UUID NOT NULL REFERENCES public."Godown"(id) ON DELETE RESTRICT,
    assembly_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_cost NUMERIC(15, 4) DEFAULT 0,
    overhead_cost NUMERIC(15, 4) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Draft', -- 'Draft', 'Completed', 'Voided'
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE (company_id, assembly_no)
);

-- 2. Create StockAssemblyItem Table (Lines)
CREATE TABLE IF NOT EXISTS public."StockAssemblyItem" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assembly_id UUID NOT NULL REFERENCES public."StockAssembly"(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public."Item"(id) ON DELETE RESTRICT,
    line_type VARCHAR(50) NOT NULL, -- 'Consumed', 'Produced', 'Wastage'
    quantity NUMERIC(15, 4) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(15, 4) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. RLS for StockAssembly
ALTER TABLE public."StockAssembly" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated users" ON public."StockAssembly"
    FOR ALL USING (auth.role() = 'authenticated' AND (company_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM "UserCompany" WHERE company_id = "StockAssembly".company_id)));

-- 4. RLS for StockAssemblyItem
ALTER TABLE public."StockAssemblyItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for authenticated users" ON public."StockAssemblyItem"
    FOR ALL USING (auth.role() = 'authenticated' AND assembly_id IN (SELECT id FROM "StockAssembly" WHERE company_id = auth.uid() OR auth.uid() IN (SELECT user_id FROM "UserCompany" WHERE company_id = "StockAssembly".company_id)));

-- 5. Ledger Posting Function
CREATE OR REPLACE FUNCTION public.post_stock_assembly_to_ledger(p_assembly_id UUID)
RETURNS VOID AS $$
DECLARE
    v_assembly RECORD;
    v_item RECORD;
    v_total_consumed_cost NUMERIC(15,4) := 0;
    v_total_wastage_cost NUMERIC(15,4) := 0;
    v_total_produced_qty NUMERIC(15,4) := 0;
    v_produced_unit_cost NUMERIC(15,4) := 0;
    v_raw_materials_acc UUID;
    v_finished_goods_acc UUID;
    v_journal_id UUID;
BEGIN
    -- Get Assembly Header
    SELECT * INTO v_assembly FROM public."StockAssembly" WHERE id = p_assembly_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock Assembly not found';
    END IF;

    IF v_assembly.status != 'Completed' THEN
        RAISE EXCEPTION 'Only Completed assemblies can be posted to ledger';
    END IF;

    -- Calculate Totals
    SELECT 
        COALESCE(SUM(CASE WHEN line_type = 'Consumed' THEN quantity * unit_cost ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN line_type = 'Wastage' THEN quantity * unit_cost ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN line_type = 'Produced' THEN quantity ELSE 0 END), 0)
    INTO v_total_consumed_cost, v_total_wastage_cost, v_total_produced_qty
    FROM public."StockAssemblyItem"
    WHERE assembly_id = p_assembly_id;

    IF v_total_produced_qty <= 0 THEN
        RAISE EXCEPTION 'Total produced quantity must be greater than zero';
    END IF;

    -- Calculate Produced Unit Cost
    v_produced_unit_cost := (v_total_consumed_cost + v_total_wastage_cost + v_assembly.overhead_cost) / v_total_produced_qty;

    -- Post to InventoryLedger
    FOR v_item IN (SELECT * FROM public."StockAssemblyItem" WHERE assembly_id = p_assembly_id) LOOP
        IF v_item.line_type IN ('Consumed', 'Wastage') THEN
            INSERT INTO public."InventoryLedger" (
                company_id, item_id, godown_id, transaction_type, 
                quantity_in, quantity_out, transaction_date, 
                reference_id, reference_type, ledger_status
            ) VALUES (
                v_assembly.company_id, v_item.item_id, v_assembly.godown_id, 'StockAssembly',
                0, v_item.quantity, v_assembly.assembly_date,
                v_assembly.id, 'StockAssembly', 'Active'
            );
        ELSIF v_item.line_type = 'Produced' THEN
            -- Update the produced item's unit cost in the line item (for reference)
            UPDATE public."StockAssemblyItem" SET unit_cost = v_produced_unit_cost WHERE id = v_item.id;
            
            INSERT INTO public."InventoryLedger" (
                company_id, item_id, godown_id, transaction_type, 
                quantity_in, quantity_out, transaction_date, 
                reference_id, reference_type, ledger_status
            ) VALUES (
                v_assembly.company_id, v_item.item_id, v_assembly.godown_id, 'StockAssembly',
                v_item.quantity, 0, v_assembly.assembly_date,
                v_assembly.id, 'StockAssembly', 'Active'
            );
        END IF;
    END LOOP;

    -- Accounting: Transfer from Raw Materials to Finished Goods
    -- 1. Find the generic Raw Materials & Finished Goods accounts (Simplification - we'd need to fetch actual accounts from the company's CoA)
    SELECT id INTO v_raw_materials_acc FROM public."Accounts" WHERE company_id = v_assembly.company_id AND account_name ILIKE '%Raw Material%' LIMIT 1;
    SELECT id INTO v_finished_goods_acc FROM public."Accounts" WHERE company_id = v_assembly.company_id AND account_name ILIKE '%Finished Good%' LIMIT 1;
    
    -- Only post accounting if both accounts exist
    IF v_raw_materials_acc IS NOT NULL AND v_finished_goods_acc IS NOT NULL THEN
        -- Create Journal
        INSERT INTO public."Journals" (
            company_id, date, reference, description, total_amount, status
        ) VALUES (
            v_assembly.company_id, v_assembly.assembly_date, v_assembly.assembly_no, 'Stock Assembly Transfer', (v_total_consumed_cost + v_total_wastage_cost), 'Posted'
        ) RETURNING id INTO v_journal_id;

        -- Credit Raw Materials
        INSERT INTO public."JournalLines" (journal_id, account_id, credit, debit)
        VALUES (v_journal_id, v_raw_materials_acc, (v_total_consumed_cost + v_total_wastage_cost), 0);

        -- Debit Finished Goods
        INSERT INTO public."JournalLines" (journal_id, account_id, debit, credit)
        VALUES (v_journal_id, v_finished_goods_acc, (v_total_consumed_cost + v_total_wastage_cost), 0);
    END IF;
END;
$$ LANGUAGE plpgsql;
