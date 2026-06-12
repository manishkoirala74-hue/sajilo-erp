import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.VITE_SAJILO_APP_ID);

async function run() {
  // 1. Find the ChartOfAccount for 11300002
  const { data: accounts, error: err1 } = await supabase
    .from('ChartOfAccount')
    .select('*')
    .eq('account_code', '11300002');
    
  if (err1) {
    console.error('Error fetching accounts', err1);
    return;
  }
  
  console.log('Accounts with code 11300002:', accounts.length);
  for (const acc of accounts) {
    console.log(`- ID: ${acc.id}, Name: ${acc.account_name}, Balance: ${acc.current_balance}`);
    
    // 2. Find GeneralLedgerLines for this account
    const { data: lines, error: err2 } = await supabase
      .from('GeneralLedgerLine')
      .select('*, journal:GeneralLedgerJournal(*)')
      .eq('account_id', acc.id);
      
    if (err2) {
      console.error('Error fetching lines', err2);
      continue;
    }
    
    console.log(`  Lines found: ${lines.length}`);
    for (const l of lines) {
      console.log(`    Line: ${l.id}, Dr: ${l.debit_amount}, Cr: ${l.credit_amount}, Desc: ${l.description}`);
      if (l.journal) {
        console.log(`      Journal: Date: ${l.journal.entry_date}, Status: ${l.journal.status}, Desc: ${l.journal.description}`);
      } else {
        console.log(`      !! NO JOURNAL ATTACHED !!`);
      }
    }
  }
}

run();
