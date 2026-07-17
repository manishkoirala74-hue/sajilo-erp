import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('InventoryLedger').select('transaction_type');
  if (error) {
    console.error(error);
  } else {
    const types = [...new Set(data.map(d => d.transaction_type))];
    console.log("Unique transaction types:", types);
  }
}
run();
