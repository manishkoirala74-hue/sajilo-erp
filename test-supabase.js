
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.rpc('get_trial_balance_rpc', {
    p_company_id: '1288ed37-29c8-4720-bd81-b55ee032cd69',
    p_from_date: '2020-01-01',
    p_to_date: '2026-12-31'
  });
  console.log(data ? data.find(d => d.account_name.toLowerCase().includes('inventory')) : 'no data');
}
run();

