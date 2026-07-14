import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const cid = 'a10e6e72-13ca-46f0-82ba-5cd421da6e2d'; // Hanuman Workshop
  const target_date = '2026-07-13';
  
  // Directly call the DB to check the BETWEEN logic
  const { data, error } = await supabase
    .rpc('test_fiscal_bounds_logic', { p_cid: cid, p_date: target_date })
    .maybeSingle();
    
  if (error) {
     console.log('RPC missing, falling back to manual query.');
     const { data: qData, error: qError } = await supabase.from('FiscalYear')
       .select('*')
       .eq('company_id', cid)
       .lte('start_date', target_date)
       .gte('end_date', target_date);
     console.log('Manual query result:', qData, qError);
  } else {
     console.log('Data:', data);
  }
}
test();
