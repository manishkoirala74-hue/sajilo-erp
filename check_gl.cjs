
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.VITE_SAJILO_APP_ID);

async function run() {
  const { data: accounts } = await supabase.from('ChartOfAccount').select('account_name, account_type').order('created_at', { ascending: false }).limit(50);
  console.log('Recent accounts:', accounts);
}
run();

