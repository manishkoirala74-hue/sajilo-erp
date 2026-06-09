import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SAJILO_APP_BASE_URL,
  process.env.VITE_SAJILO_APP_ID
);

async function run() {
  const { data: accounts } = await supabase.from('ChartOfAccount').select('*');
  console.log('Total accounts:', accounts.length);
  
  const { data: lines } = await supabase.from('GeneralLedgerLine').select('*, GeneralLedgerJournal!inner(status)');
  const postedLines = lines.filter(l => l.GeneralLedgerJournal.status === 'Posted');
  console.log('Total posted lines:', postedLines.length);

  const newBalances = {};
  for (const line of postedLines) {
    if (!newBalances[line.account_id]) newBalances[line.account_id] = 0;
    const delta = (line.debit_amount || 0) - (line.credit_amount || 0);
    newBalances[line.account_id] += delta;
  }

  for (const acc of accounts) {
    let delta = newBalances[acc.id] || 0;
    // Delta positive = Net Debit. Delta negative = Net Credit.
    const debitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(acc.account_type);
    const balance = debitNormal ? delta : -delta;
    
    if (Math.abs(balance - (acc.current_balance || 0)) > 0.01) {
      console.log(`Fixing ${acc.account_name} from ${acc.current_balance} to ${balance}`);
      await supabase.from('ChartOfAccount').update({ current_balance: balance }).eq('id', acc.id);
    }
  }

  console.log('Done recalculating GL balances.');
}

run().catch(console.error);
