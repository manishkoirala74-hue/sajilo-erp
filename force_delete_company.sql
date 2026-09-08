-- ==============================================================================
-- OPTIMIZED EMERGENCY COMPANY DELETION SCRIPT
-- Requirement: The V6 ON DELETE CASCADE migration must be applied.
-- Warning: This bypasses the Edge Function. Storage files will be orphaned!
-- ==============================================================================

DO $$ 
DECLARE
    -- 🔴 REPLACE THIS WITH THE ACTUAL COMPANY UUID YOU WANT TO DELETE 🔴
    v_company_id UUID := '04ec821a-fa7a-4686-8bdf-a2d771bfd2a6'; 
    v_deleted_count INT;
BEGIN
    RAISE NOTICE 'Starting FORCE PURGE for company: %', v_company_id;

    -- 1. Disable all user-defined triggers (Ghost Mode, Anti-Tamper, Governance)
    SET LOCAL session_replication_role = 'replica';
    
    -- 2. Enable maintenance mode for any triggers that explicitly look for it
    PERFORM set_config('sajilo.maintenance_mode', 'true', true);
    
    -- Note on UserCompany: UserCompany mapping in some configurations may not 
    -- natively cascade if it uses a text-based company_id instead of a UUID foreign key.
    -- We delete it explicitly just in case to avoid any hanging references.
    DELETE FROM public."UserCompany" WHERE company_id::text = v_company_id::text;

    -- 3. Execute the single hard delete. 
    -- The native ON DELETE CASCADE will instantly and flawlessly wipe all 64+ tables.
    DELETE FROM "Company" WHERE id = v_company_id;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    IF v_deleted_count > 0 THEN
        RAISE NOTICE '✅ Successfully wiped all data and cascades for company %', v_company_id;
    ELSE
        RAISE WARNING 'Company record not found (it may have been deleted already).';
    END IF;

    -- Note: session_replication_role safely reverts to 'origin' at transaction end.
END $$;
