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

        // Explicitly clear UserCompany just in case it uses TEXT mapping or lacks cascade
        await client.query(`DELETE FROM "UserCompany" WHERE company_id::text = $1`, [companyId]);
        
        // Execute the single hard delete, letting V6 ON DELETE CASCADE handle the rest
        const compRes = await client.query(`DELETE FROM "Company" WHERE id = $1::uuid`, [companyId]);
        
        if (compRes.rowCount === 0) {
            console.warn(` ⚠️ Company record not found in database (may have been deleted already).`);
        } else {
            console.log(` ✅ Triggered native cascade delete for Company.`);
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
