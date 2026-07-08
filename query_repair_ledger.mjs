import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.rpc('run_sql', {
    query: `
      UPDATE "ChartOfAccount" 
      SET "financial_statement" = CASE
        WHEN account_type IN ('Revenue', 'Income', 'Other Income', 'Expense', 'Expenses', 'COGS', 'Cost of Sales', 'OPEX', 'Operating Expense', 'Cost of Goods Sold', 'Other Expense') THEN 'income_statement'
        ELSE 'balance_sheet'
      END
      WHERE "financial_statement" IS NULL;
    `
  });

  // If run_sql RPC is not available, we can just do a REST update using postgres-meta, or we can use the Supabase REST API directly for update:
  // But since we can just use the Supabase client to update:
  
  const { data: accountsToUpdate, error: selectErr } = await supabase
    .from('ChartOfAccount')
    .select('id, account_type')
    .is('financial_statement', null);
    
  if (selectErr) {
    console.error("Select Error:", selectErr);
    return;
  }
  
  console.log(`Found ${accountsToUpdate.length} accounts with null financial_statement`);
  
  for (const account of accountsToUpdate) {
    const isIncome = ['Revenue', 'Income', 'Other Income', 'Expense', 'Expenses', 'COGS', 'Cost of Sales', 'OPEX', 'Operating Expense', 'Cost of Goods Sold', 'Other Expense'].includes(account.account_type);
    const fs = isIncome ? 'income_statement' : 'balance_sheet';
    
    const { error: updateErr } = await supabase
      .from('ChartOfAccount')
      .update({ financial_statement: fs })
      .eq('id', account.id);
      
    if (updateErr) {
      console.error(`Update Error for ${account.id}:`, updateErr);
    } else {
      console.log(`Updated ${account.id} with ${fs}`);
    }
  }
}
run();
