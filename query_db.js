import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xkobauhvsayqcxmmmtkm.supabase.co',
  'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O'
);

async function run() {
  const { data: accounts } = await supabase.from('ChartOfAccount').select('*');
  const revenueAcc = accounts.find(a => a.account_name.includes('Sales Revenue'));
  const cogsAcc = accounts.find(a => a.account_name.includes('COGS') || a.account_name.includes('Cost of Sales'));
  
  console.log('Revenue Account Balance:', revenueAcc?.current_balance);
  console.log('COGS Account Balance:', cogsAcc?.current_balance);

  const { data: lines } = await supabase.from('GeneralLedgerLine').select('*').in('account_id', [revenueAcc?.id, cogsAcc?.id]);
  
  console.log('\nGeneral Ledger Lines for Revenue & COGS:');
  for (const line of lines) {
    console.log(`[${line.account_name}] DR: ${line.debit_amount} | CR: ${line.credit_amount} | Desc: ${line.description}`);
  }
}

run();
