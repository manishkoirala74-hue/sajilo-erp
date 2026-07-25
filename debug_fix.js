import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { error } = await supabase.rpc('execute_sql', {
    sql: 'ALTER TABLE "ChartOfAccount" ALTER COLUMN financial_statement DROP NOT NULL;'
  });
  if (error) {
    console.log("No RPC execute_sql? Let's check another way.");
  }
}
run();
