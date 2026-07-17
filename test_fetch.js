import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAccounts() {
  const { data: rev, error: e1 } = await supabase.from('ChartOfAccount').select('account_name, parent_account_name, account_type').eq('account_type', 'Revenue');
  const { data: exp, error: e2 } = await supabase.from('ChartOfAccount').select('account_name, parent_account_name, account_type').eq('account_type', 'Expense');
  console.log("Revenue:", rev);
  console.log("Expense:", exp);
}
checkAccounts();
