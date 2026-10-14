import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const client = createClient(supabaseUrl, serviceKey);

const backupPath = path.resolve('scripts/benchmarks/logo_backups.json');

async function rollbackLogos() {
  console.log('=== Rolling Back Company Logos from Backup ===\n');

  if (!fs.existsSync(backupPath)) {
    console.error(`Backup file not found at ${backupPath}`);
    process.exit(1);
  }

  const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  console.log(`Found backup from: ${backupData.capturedAt} with ${backupData.companies.length} companies.`);

  for (const c of backupData.companies) {
    console.log(`Restoring logo for ${c.name} (${c.id})...`);
    const { error } = await client
      .from('Company')
      .update({ logo_url: c.original_logo_url })
      .eq('id', c.id);

    if (error) {
      console.error(`Failed to restore ${c.name}:`, error);
    } else {
      console.log(`Restored successfully.`);
    }
  }

  console.log('\nRollback complete!');
}

rollbackLogos();
