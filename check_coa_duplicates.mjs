import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: coa } = await supabase.from('ChartOfAccount').select('id, account_code, account_name, is_system_account, company_id, parent_account_id, ledger_type').order('account_code');
  
  const duplicates = {};
  for (const acc of (coa || [])) {
    const key = `${acc.company_id}-${acc.account_code}-${acc.account_name}`;
    if (!duplicates[key]) duplicates[key] = [];
    duplicates[key].push(acc);
  }
  
  for (const [key, list] of Object.entries(duplicates)) {
    if (list.length > 1) {
      console.log(`Duplicate found: ${key} -> Count: ${list.length}`);
      console.log(list.map(l => `  ID: ${l.id} | System: ${l.is_system_account} | Type: ${l.ledger_type}`));
    }
  }
}
run();
