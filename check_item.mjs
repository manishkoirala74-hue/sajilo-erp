import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: item } = await supabase.from('Item').select('*').ilike('item_name', '%Motorcycle FZ V3 Gray%').single();
  console.log("Item:", item);
}
run();
