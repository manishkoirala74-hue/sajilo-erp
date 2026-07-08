import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fetching Cost of Sales accounts...");
  const { data: accounts, error: accError } = await supabase
    .from('ChartOfAccount')
    .select('id, account_code, account_name, account_type')
    .in('account_type', ['COGS', 'Cost of Sales', 'Cost of Goods Sold']);

  if (accError) {
    console.error(accError);
    return;
  }

  const accountIds = accounts.map(a => a.id);
  console.log("Accounts found:", accounts);

  if (accountIds.length === 0) return;

  const { data: lines, error: lineError } = await supabase
    .from('GeneralLedgerLine')
    .select('debit_amount, credit_amount, journal_id')
    .in('account_id', accountIds);

  if (lineError) {
    console.error(lineError);
    return;
  }

  // We only want posted journals
  const { data: journals } = await supabase
    .from('GeneralLedgerJournal')
    .select('id, status')
    .in('status', ['Posted']);
    
  const postedJournalIds = new Set(journals.map(j => j.id));

  let totalDebit = 0;
  let totalCredit = 0;

  lines.forEach(l => {
    if (postedJournalIds.has(l.journal_id)) {
      totalDebit += l.debit_amount || 0;
      totalCredit += l.credit_amount || 0;
    }
  });

  console.log(`Total Debit: ${totalDebit}`);
  console.log(`Total Credit: ${totalCredit}`);
  console.log(`Net Balance (Dr - Cr): ${totalDebit - totalCredit}`);
}

run();
