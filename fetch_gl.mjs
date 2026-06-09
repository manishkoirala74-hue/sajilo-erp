import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkData() {
  const { data: accounts } = await supabase.from('ChartOfAccount').select('*').in('account_name', ['Finished Goods', 'Cash in Hand', 'Ravi Poudel', 'Inventory']);
  console.log('Accounts:', accounts.map(a => ({ name: a.account_name, type: a.ledger_type, current_balance: a.current_balance, opening_balance: a.opening_balance })));

  const { data: lines, error } = await supabase.from('GeneralLedgerLine').select('*').order('created_at', { ascending: false }).limit(20);
  if (error) console.error(error);
  else console.log('Latest GL Lines count:', lines.length);

  // Group by account_id to see which accounts have lines
  const { data: allLines } = await supabase.from('GeneralLedgerLine').select('account_id, debit_amount, credit_amount');
  const lineCount = allLines?.length || 0;
  console.log('Total GL Lines:', lineCount);
  
  if (allLines) {
    let hasLines = false;
    for (const a of accounts) {
      const aLines = allLines.filter(l => l.account_id === a.id);
      if (aLines.length > 0) {
        hasLines = true;
        console.log(`Account ${a.account_name} has ${aLines.length} lines. Sum Dr: ${aLines.reduce((s,l)=>s+(l.debit_amount||0),0)}`);
      }
    }
    if (!hasLines) console.log('None of the queried accounts have any GL lines!');
  }
}

checkData();
