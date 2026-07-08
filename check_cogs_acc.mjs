import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: accs } = await supabase.from('ChartOfAccount').select('id, account_name, account_type').ilike('account_name', '%cost%');
  console.log(accs);
}
run();
