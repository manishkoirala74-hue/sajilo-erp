import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.VITE_SAJILO_APP_ID);

async function check() {
  const { data, error } = await supabase.rpc('get_schema_columns', { table_name: 'FinancialVoucher' });
  if (error) {
    console.error(error);
  } else {
    console.log(data);
  }
}
check();
