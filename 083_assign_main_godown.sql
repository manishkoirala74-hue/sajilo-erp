DO $$
DECLARE
    comp RECORD;
    main_g_id UUID;
BEGIN
    FOR comp IN SELECT DISTINCT id FROM public."Company" LOOP
        -- find main godown
        SELECT id INTO main_g_id FROM public."Godown" 
        WHERE company_id = comp.id AND (is_main = true OR name = 'Main Location' OR godown_name = 'Main Location') 
        ORDER BY is_main DESC LIMIT 1;
        
        IF main_g_id IS NOT NULL THEN
            -- we can just update those where godown_id is not already main_g_id
            -- for CurrentStock, to prevent unique constraint violation we need to aggregate
            
            -- update InventoryLedger
            UPDATE public."InventoryLedger" SET godown_id = main_g_id WHERE company_id = comp.id AND godown_id IS DISTINCT FROM main_g_id;
            UPDATE public."SalesInvoice" SET godown_id = main_g_id WHERE company_id = comp.id AND godown_id IS DISTINCT FROM main_g_id;
            UPDATE public."PurchaseInvoice" SET godown_id = main_g_id WHERE company_id = comp.id AND godown_id IS DISTINCT FROM main_g_id;
            
            -- for CurrentStock, delete all and recreate from InventoryLedger to ensure correct aggregation and avoid unique constraint issues
            DELETE FROM public."CurrentStock" WHERE company_id = comp.id;
            
            INSERT INTO public."CurrentStock" (company_id, godown_id, item_id, current_qty)
            SELECT company_id, godown_id, item_id, SUM(quantity_in) - SUM(quantity_out)
            FROM public."InventoryLedger"
            WHERE company_id = comp.id AND godown_id = main_g_id
            GROUP BY company_id, godown_id, item_id
            HAVING (SUM(quantity_in) - SUM(quantity_out)) >= 0;
            
        END IF;
    END LOOP;
END $$;
