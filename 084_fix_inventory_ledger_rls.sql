DO $$ 
BEGIN
    -- InventoryLedger policies
    DROP POLICY IF EXISTS "insert_InventoryLedger" ON public."InventoryLedger";
    CREATE POLICY "insert_InventoryLedger" ON public."InventoryLedger" FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    
    DROP POLICY IF EXISTS "update_InventoryLedger" ON public."InventoryLedger";
    CREATE POLICY "update_InventoryLedger" ON public."InventoryLedger" FOR UPDATE USING (auth.role() = 'authenticated');
    
    DROP POLICY IF EXISTS "delete_InventoryLedger" ON public."InventoryLedger";
    CREATE POLICY "delete_InventoryLedger" ON public."InventoryLedger" FOR DELETE USING (auth.role() = 'authenticated');
    
    -- CurrentStock policies (it's updated via triggers which bypass RLS but just in case)
    DROP POLICY IF EXISTS "insert_CurrentStock" ON public."CurrentStock";
    CREATE POLICY "insert_CurrentStock" ON public."CurrentStock" FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    
    DROP POLICY IF EXISTS "update_CurrentStock" ON public."CurrentStock";
    CREATE POLICY "update_CurrentStock" ON public."CurrentStock" FOR UPDATE USING (auth.role() = 'authenticated');
    
    DROP POLICY IF EXISTS "delete_CurrentStock" ON public."CurrentStock";
    CREATE POLICY "delete_CurrentStock" ON public."CurrentStock" FOR DELETE USING (auth.role() = 'authenticated');
    
END $$;
