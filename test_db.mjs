import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const cid = 'a10e6e72-13ca-46f0-82ba-5cd421da6e2d'; // Hanuman Workshop
  const { data, error } = await supabase.from('FiscalYear').select('*').eq('company_id', cid);
  console.log('Fiscal Years:', data);
}
test();
