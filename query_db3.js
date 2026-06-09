import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xkobauhvsayqcxmmmtkm.supabase.co',
  'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O'
);

async function run() {
  const { data: journals, error: jErr } = await supabase.from('GeneralLedgerJournal').select('*');
  if (jErr) console.error(jErr);
  
  const journalIds = journals.map(j => j.id);
  
  const { data: lines, error: lErr } = await supabase.from('GeneralLedgerLine').select('*');
  if (lErr) console.error(lErr);
  
  let rev = 0;
  let cogs = 0;
  for (const line of lines) {
    if (line.account_name && line.account_name.includes('Revenue')) {
      rev += (line.credit_amount || 0) - (line.debit_amount || 0);
    }
    if (line.account_name && (line.account_name.includes('COGS') || line.account_name.includes('Cost of Sales'))) {
      cogs += (line.debit_amount || 0) - (line.credit_amount || 0);
    }
  }
  
  console.log(`Total Revenue in DB lines: ${rev}`);
  console.log(`Total COGS in DB lines: ${cogs}`);
  console.log(`Total lines: ${lines.length}`);
  console.log(`Total journals: ${journals.length}`);
}

run();
