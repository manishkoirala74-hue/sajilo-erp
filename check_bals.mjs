import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: lines, error: lineError } = await supabase
    .from('GeneralLedgerLine')
    .select('account_id, debit_amount, credit_amount, journal_id');

  const { data: journals } = await supabase
    .from('GeneralLedgerJournal')
    .select('id, status')
    .in('status', ['Posted']);
    
  const postedJournalIds = new Set(journals.map(j => j.id));

  const { data: accounts } = await supabase
    .from('ChartOfAccount')
    .select('id, account_code, account_name, account_type, ledger_type');

  const accountMap = new Map();
  accounts.forEach(a => accountMap.set(a.id, a));

  const balances = new Map();

  lines.forEach(l => {
    if (postedJournalIds.has(l.journal_id)) {
      if (!balances.has(l.account_id)) {
        balances.set(l.account_id, 0);
      }
      const dr = l.debit_amount || 0;
      const cr = l.credit_amount || 0;
      balances.set(l.account_id, balances.get(l.account_id) + (dr - cr));
    }
  });

  console.log("Account Balances:");
  for (const [accId, bal] of balances.entries()) {
    if (bal !== 0) {
      const a = accountMap.get(accId);
      console.log(`[${a?.account_type}] ${a?.account_name} (${a?.account_code}): Rs. ${bal}`);
    }
  }
}

run();
