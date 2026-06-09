import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.VITE_SAJILO_APP_ID);

async function test() {
  const { data, error } = await supabase.from('BusinessPartner').select('*').limit(1);
  if (error) {
    console.error("Fetch error:", error);
  } else {
    console.log("Columns:", data.length > 0 ? Object.keys(data[0]) : "No data, but query succeeded");
  }
}
test();
