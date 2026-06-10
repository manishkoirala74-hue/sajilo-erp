import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xkobauhvsayqcxmmmtkm.supabase.co',
  'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O'
);

async function run() {
  const { data: accounts } = await supabase.from('ChartOfAccount').select('*');
  const invAccs = accounts.filter(a => a.account_name.includes('Inventory'));
  
  if(invAccs.length === 0) {
    console.log('No inventory accounts found.');
    return;
  }

  for (const acc of invAccs) {
    console.log(`\nAccount: ${acc.account_name} | Balance: ${acc.current_balance}`);
    const { data: lines } = await supabase.from('GeneralLedgerLine').select('*, GeneralLedgerJournal(source_document_type, is_cancelled)').eq('account_id', acc.id);
    
    for (const line of lines) {
      if (line.GeneralLedgerJournal?.is_cancelled) continue;
      console.log(`[${line.created_at}] DR: ${line.debit_amount} | CR: ${line.credit_amount} | Desc: ${line.description}`);
    }
  }
}

run().catch(console.error);
