-- ==============================================================================
-- DYNAMIC FUTURE-PROOF COMPANY PURGE SCRIPT (force_delete_company.sql)
-- ==============================================================================
-- Purpose:
-- Completely and irrevocably purges a company from Sajilo ERP in a 100% 
-- dynamic, future-proof manner:
-- 1. Dynamically purges all Supabase Storage bucket files (documents, logos, media).
-- 2. Dynamically queries pg_constraint to identify and purge all child/line tables 
--    that lack a company_id but reference a company table (e.g. StockAssemblyItem).
-- 3. Dynamically queries information_schema to discover and delete from EVERY 
--    current and future table that contains a company_id column.
-- 4. Auto-promotes the secondary active company to 'is_default = true' in UserCompany
--    for any affected users so their next login immediately displays the secondary company.
-- 5. Safe: Automatically silences triggers (anti-tamper, stock) during execution and restores them.
-- ==============================================================================

DO $$ 
DECLARE
    -- 🔴 ENTER THE COMPANY UUID YOU WISH TO PURGE HERE 🔴
    v_company_id UUID := '04ec821a-fa7a-4686-8bdf-a2d771bfd2a6'; 

    v_company_name TEXT;
    v_record RECORD;
    v_child_rec RECORD;
    v_deleted_rows INT;
    v_total_tables INT := 0;
    v_total_rows INT := 0;
    v_files_count INT := 0;
    v_users_promoted INT := 0;
BEGIN
    -- Verify company existence (informational)
    SELECT name INTO v_company_name FROM public."Company" WHERE id = v_company_id;
    
    IF v_company_name IS NULL THEN
        RAISE WARNING '⚠️ Company with ID % not found in "Company" table. Purging any orphaned child records...', v_company_id;
    ELSE
        RAISE NOTICE '🚀 Starting complete dynamic purge for company: "%" (%)', v_company_name, v_company_id;
    END IF;

    -- ── 1. SILENCE CONSTRAINTS & GOVERNANCE TRIGGERS ─────────────────────────
    SET LOCAL session_replication_role = 'replica';
    PERFORM set_config('sajilo.maintenance_mode', 'true', true);

    -- ── 2. DYNAMIC CLOUD STORAGE PURGE ──────────────────────────────────────
    -- Purges all files across Supabase Storage buckets matching the company UUID prefix
    BEGIN
        DELETE FROM storage.objects 
        WHERE name LIKE v_company_id::text || '/%' 
           OR name LIKE '%' || v_company_id::text || '%';
        GET DIAGNOSTICS v_files_count = ROW_COUNT;
        RAISE NOTICE '📁 Purged % cloud storage files/attachments across all buckets', v_files_count;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'ℹ️ storage.objects cleanup skipped or not available: %', SQLERRM;
    END;

    -- ── 3. AUTO-PROMOTE SECONDARY COMPANY TO DEFAULT FOR AFFECTED USERS ─────
    CREATE TEMP TABLE tmp_affected_users AS
    SELECT DISTINCT user_id 
    FROM public."UserCompany" 
    WHERE company_id = v_company_id AND is_default = true;

    -- Delete UserCompany mapping for the purged company
    DELETE FROM public."UserCompany" WHERE company_id = v_company_id;

    -- Promote the oldest remaining active secondary company to is_default = true
    WITH candidate_defaults AS (
        SELECT uc.id,
               ROW_NUMBER() OVER (PARTITION BY uc.user_id ORDER BY uc.created_at ASC) as rn
        FROM public."UserCompany" uc
        JOIN public."Company" c ON c.id = uc.company_id
        WHERE uc.user_id IN (SELECT user_id FROM tmp_affected_users)
          AND (uc.membership_status IS NULL OR uc.membership_status = 'active')
          AND (c.status IS NULL OR c.status = 'ACTIVE')
          AND (c.is_active IS NULL OR c.is_active = true)
    )
    UPDATE public."UserCompany"
    SET is_default = true
    WHERE id IN (SELECT id FROM candidate_defaults WHERE rn = 1);

    GET DIAGNOSTICS v_users_promoted = ROW_COUNT;
    IF v_users_promoted > 0 THEN
        RAISE NOTICE '🏢 Auto-promoted secondary company to default for % admin user(s)', v_users_promoted;
    END IF;

    DROP TABLE IF EXISTS tmp_affected_users;

    -- ── 4. DYNAMIC PURGE OF CHILD TABLES WITHOUT company_id ─────────────────
    -- Automatically discovers child/line tables (e.g. StockAssemblyItem) that lack
    -- a company_id column but reference a parent table that has company_id.
    FOR v_child_rec IN (
        SELECT 
            c.conname AS fk_name,
            src_ns.nspname AS child_schema,
            src_tbl.relname AS child_table,
            src_col.attname AS child_column,
            ref_ns.nspname AS parent_schema,
            ref_tbl.relname AS parent_table,
            ref_col.attname AS parent_column
        FROM pg_constraint c
        JOIN pg_class src_tbl ON src_tbl.oid = c.conrelid
        JOIN pg_namespace src_ns ON src_ns.oid = src_tbl.relnamespace
        JOIN pg_attribute src_col ON src_col.attrelid = src_tbl.oid AND src_col.attnum = ANY(c.conkey)
        JOIN pg_class ref_tbl ON ref_tbl.oid = c.confrelid
        JOIN pg_namespace ref_ns ON ref_ns.oid = ref_tbl.relnamespace
        JOIN pg_attribute ref_col ON ref_col.attrelid = ref_tbl.oid AND ref_col.attnum = ANY(c.confkey)
        WHERE c.contype = 'f' 
          AND src_ns.nspname = 'public'
          AND ref_ns.nspname = 'public'
          AND src_tbl.relname NOT LIKE 'pg_%'
          AND src_tbl.relname NOT LIKE 'sql_%'
          -- Child table does NOT have company_id
          AND NOT EXISTS (
              SELECT 1 FROM information_schema.columns col 
              WHERE col.table_schema = src_ns.nspname 
                AND col.table_name = src_tbl.relname 
                AND col.column_name = 'company_id'
          )
          -- Parent table DOES have company_id
          AND EXISTS (
              SELECT 1 FROM information_schema.columns col 
              WHERE col.table_schema = ref_ns.nspname 
                AND col.table_name = ref_tbl.relname 
                AND col.column_name = 'company_id'
          )
    ) LOOP
        BEGIN
            EXECUTE format(
                'DELETE FROM %I.%I WHERE %I IN (SELECT %I FROM %I.%I WHERE company_id = $1)',
                v_child_rec.child_schema,
                v_child_rec.child_table,
                v_child_rec.child_column,
                v_child_rec.parent_column,
                v_child_rec.parent_schema,
                v_child_rec.parent_table
            ) USING v_company_id;
            
            GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;
            IF v_deleted_rows > 0 THEN
                RAISE NOTICE '   - %: deleted % child row(s) (linked via % to %)', 
                    v_child_rec.child_table, v_deleted_rows, v_child_rec.child_column, v_child_rec.parent_table;
                v_total_rows := v_total_rows + v_deleted_rows;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    -- ── 5. DYNAMIC PURGE OF ALL TABLES WITH company_id ──────────────────────
    -- Automatically discovers EVERY table in schema 'public' with a company_id column,
    -- including any new modules, registers, or tables added in the future.
    FOR v_record IN (
        SELECT table_schema, table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND column_name = 'company_id'
          AND table_name NOT IN ('Company', 'UserCompany')
          AND table_name NOT LIKE 'pg_%'
          AND table_name NOT LIKE 'sql_%'
        GROUP BY table_schema, table_name
        ORDER BY table_name ASC
    ) LOOP
        BEGIN
            EXECUTE format('DELETE FROM %I.%I WHERE company_id = $1', v_record.table_schema, v_record.table_name) 
            USING v_company_id;
            
            GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;
            IF v_deleted_rows > 0 THEN
                RAISE NOTICE '   - %: deleted % row(s)', v_record.table_name, v_deleted_rows;
                v_total_rows := v_total_rows + v_deleted_rows;
                v_total_tables := v_total_tables + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '⚠️ Skipping table % due to: %', v_record.table_name, SQLERRM;
        END;
    END LOOP;

    -- ── 6. FINAL HARD DELETE OF ROOT COMPANY RECORD ─────────────────────────
    DELETE FROM public."Company" WHERE id = v_company_id;
    GET DIAGNOSTICS v_deleted_rows = ROW_COUNT;
    IF v_deleted_rows > 0 THEN
        RAISE NOTICE '   - Company: deleted root company record';
        v_total_rows := v_total_rows + v_deleted_rows;
        v_total_tables := v_total_tables + 1;
    END IF;

    -- ── 7. RESTORE NORMAL TRIGGER & REPLICATION OPERATIONS ──────────────────
    SET LOCAL session_replication_role = 'origin';
    PERFORM set_config('sajilo.maintenance_mode', 'false', true);

    RAISE NOTICE '════════════════════════════════════════════════════════════════════';
    RAISE NOTICE '✅ COMPANY PURGE COMPLETED FOR: %', v_company_id;
    RAISE NOTICE '   Total tables cleaned: %', v_total_tables;
    RAISE NOTICE '   Total records deleted: %', v_total_rows;
    RAISE NOTICE '   Cloud storage files purged: %', v_files_count;
    RAISE NOTICE '   Secondary company auto-promoted for % user(s)', v_users_promoted;
    RAISE NOTICE '════════════════════════════════════════════════════════════════════';
END $$;
