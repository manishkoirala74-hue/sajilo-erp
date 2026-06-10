
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const { data, error } = await supabase.rpc('get_trial_balance_rpc', {
    p_company_id: '1288ed37-29c8-4720-bd81-b55ee032cd69',
    p_from_date: '2020-01-01',
    p_to_date: '2026-12-31'
  });
  console.log('Error:', error);
  console.log('Sample Data:', data ? data.filter(a => a.account_name.toLowerCase().includes('inventory')) : null);
}
test();

