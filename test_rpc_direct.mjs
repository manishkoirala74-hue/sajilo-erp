import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const companyId = 'a10e6e72-13ca-46f0-82ba-5cd421da6e2d';
  
  // Try the RPC
  const { data, error } = await supabase.rpc('get_balance_sheet_rpc', {
    p_company_id: companyId,
    p_as_of_date: '2026-07-28'
  });
  
  if (error) {
    console.error("RPC Error:", error.message);
  } else {
    console.log("RPC Data:", data.slice(0, 5));
    console.log("Total non-zero:", data.filter(d => d.closing_balance !== 0).length);
  }
}

run().catch(console.error);
