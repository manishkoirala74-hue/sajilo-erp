import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const { Client } = pg;

/**
 * OPTIMIZED COMPANY DELETION SCRIPT
 * 
 * Requirement: The V6 ON DELETE CASCADE migration must be applied.
 * 
 * This script serves as a backend-level fallback to aggressively delete a company.
 * It addresses two critical aspects:
 * 1. Cloud Storage Trap: It fetches and deletes all associated bucket files to prevent S3 orphaning.
 * 2. Governance Bypass: It uses `session_replication_role = 'replica'` to silence Anti-Tamper
 *    triggers, and relies on Postgres's native ON DELETE CASCADE for blazing fast multi-table cleanup.
 * 
 * Usage: node force_delete_company.mjs <company_id>
 */
async function run() {
    const companyId = process.argv[2];
    if (!companyId) {
        console.error("❌ Usage: node force_delete_company.mjs <company_id>");
        process.exit(1);
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(companyId)) {
        console.error("❌ Invalid company_id format. Must be a valid UUID.");
        process.exit(1);
    }

    const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
        console.error("❌ Missing DATABASE_URL in .env.local");
        process.exit(1);
    }

    const client = new Client({ connectionString: dbUrl });

    try {
        await client.connect();
        console.log(`✅ Connected to PostgreSQL.`);
        console.log(`⚠️  Preparing to FORCEFULLY delete company: ${companyId}`);

        // ==========================================
        // PHASE 1: PREVENT CLOUD STORAGE TRAP
        // ==========================================
        if (supabaseUrl && supabaseKey) {
            console.log(`\n☁️  Phase 1: Purging Storage Attachments...`);
            const supabase = createClient(supabaseUrl, supabaseKey);
            
            // Query DocumentAttachment for all files associated with this company
            const { rows: attachments } = await client.query(`
                SELECT file_path FROM "DocumentAttachment" 
                WHERE company_id = $1::uuid
            `, [companyId]);

            if (attachments.length > 0) {
                const paths = attachments.map(a => a.file_path);
                console.log(` - Found ${paths.length} file attachments. Deleting from bucket 'erp_documents'...`);
                
                // Delete from Supabase storage
                const { error: storageError } = await supabase.storage
                    .from('erp_documents')
                    .remove(paths);
                
                if (storageError) {
                    console.warn(` ⚠️ Failed to delete some storage files:`, storageError);
                } else {
                    console.log(` ✅ Successfully purged storage files.`);
                }
            } else {
                console.log(` - No cloud storage attachments found.`);
            }
        } else {
            console.warn(` ⚠️ Missing Supabase env variables. Skipping Cloud Storage purge! (Files may be orphaned)`);
        }

        // ==========================================
        // PHASE 2: DATABASE NATIVE CASCADE PURGE
        // ==========================================
        console.log(`\n🗑️  Phase 2: Database Purge (Native Cascade)...`);
        
        await client.query('BEGIN');

        // Disable user-defined triggers (Ghost Mode, Anti-Tamper)
        await client.query("SET session_replication_role = 'replica';");
        // Enable maintenance mode for custom trigger conditions
        await client.query("SELECT set_config('sajilo.maintenance_mode', 'true', true);");

        // Phase 2a: Auto-Promote Secondary Company for Affected Users
        console.log(` - Auto-promoting secondary company for affected default users...`);
        await client.query(`
            CREATE TEMP TABLE tmp_affected_users AS
            SELECT DISTINCT user_id 
            FROM public."UserCompany" 
            WHERE company_id = $1::uuid AND is_default = true;
        `, [companyId]);

        await client.query(`DELETE FROM public."UserCompany" WHERE company_id = $1::uuid`, [companyId]);

        const promoRes = await client.query(`
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
        `);
        console.log(` ✅ Auto-promoted secondary company to default for ${promoRes.rowCount} user(s).`);
        await client.query(`DROP TABLE IF EXISTS tmp_affected_users;`);

        // Phase 2b: Dynamic Discovery & Purge of Child Tables (without direct company_id)
        console.log(` - Dynamically discovering and purging child/line tables...`);
        const { rows: childTables } = await client.query(`
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
              AND NOT EXISTS (
                  SELECT 1 FROM information_schema.columns col 
                  WHERE col.table_schema = src_ns.nspname 
                    AND col.table_name = src_tbl.relname 
                    AND col.column_name = 'company_id'
              )
              AND EXISTS (
                  SELECT 1 FROM information_schema.columns col 
                  WHERE col.table_schema = ref_ns.nspname 
                    AND col.table_name = ref_tbl.relname 
                    AND col.column_name = 'company_id'
              )
        `);

        for (const ct of childTables) {
            try {
                const delRes = await client.query(`
                    DELETE FROM "${ct.child_schema}"."${ct.child_table}"
                    WHERE "${ct.child_column}" IN (
                        SELECT "${ct.parent_column}" FROM "${ct.parent_schema}"."${ct.parent_table}" WHERE company_id = $1::uuid
                    )
                `, [companyId]);
                if (delRes.rowCount > 0) {
                    console.log(`   - ${ct.child_table}: deleted ${delRes.rowCount} child row(s)`);
                }
            } catch (err) {
                // Ignore gracefully if table structure differs
            }
        }

        // Phase 2c: Dynamic Discovery & Purge of All Tables with company_id
        console.log(` - Dynamically discovering and purging all tables with company_id...`);
        const { rows: companyTables } = await client.query(`
            SELECT table_schema, table_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND column_name = 'company_id'
              AND table_name NOT IN ('Company', 'UserCompany')
              AND table_name NOT LIKE 'pg_%'
              AND table_name NOT LIKE 'sql_%'
            GROUP BY table_schema, table_name
            ORDER BY table_name ASC
        `);

        for (const tbl of companyTables) {
            try {
                const delRes = await client.query(`DELETE FROM "${tbl.table_schema}"."${tbl.table_name}" WHERE company_id = $1::uuid`, [companyId]);
                if (delRes.rowCount > 0) {
                    console.log(`   - ${tbl.table_name}: deleted ${delRes.rowCount} row(s)`);
                }
            } catch (err) {
                console.warn(`   ⚠️ Skipping ${tbl.table_name}: ${err.message}`);
            }
        }
        
        // Execute the hard delete for Company
        const compRes = await client.query(`DELETE FROM "Company" WHERE id = $1::uuid`, [companyId]);
        
        if (compRes.rowCount === 0) {
            console.warn(` ⚠️ Company record not found in database (may have been deleted already).`);
        } else {
            console.log(` ✅ Completed multi-table clean delete for Company.`);
        }

        // Restore trigger enforcement
        await client.query("SET session_replication_role = 'origin';");

        await client.query('COMMIT');
        console.log(`\n🎉 Successfully completed company deletion lifecycle for ${companyId}`);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("\n❌ Deletion failed. Rolled back database transaction.", e);
    } finally {
        try { await client.query("SET session_replication_role = 'origin';"); } catch(e) {}
        await client.end();
    }
}

run();
