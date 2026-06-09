import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xkobauhvsayqcxmmmtkm.supabase.co',
  'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O'
);

async function run() {
  const { data: journals, error: jErr } = await supabase.from('GeneralLedgerJournal').select('*').eq('status', 'Posted');
  if (jErr) console.error(jErr);
  
  const journalIds = journals.map(j => j.id);
  
  const { data: lines, error: lErr } = await supabase.from('GeneralLedgerLine').select('*').in('journal_id', journalIds);
  if (lErr) console.error(lErr);
  
  const accMap = {};
  for (const line of lines) {
    if (!accMap[line.account_name]) accMap[line.account_name] = { dr: 0, cr: 0, type: line.account_type };
    accMap[line.account_name].dr += (line.debit_amount || 0);
    accMap[line.account_name].cr += (line.credit_amount || 0);
  }
  
  for (const [name, totals] of Object.entries(accMap)) {
    const isDebitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(totals.type);
    const balance = isDebitNormal ? (totals.dr - totals.cr) : (totals.cr - totals.dr);
    console.log(`${name} [${totals.type}]: ${balance} (DR: ${totals.dr}, CR: ${totals.cr})`);
  }
  
  console.log("\nSpecific Lines for Revenue/COGS:");
  for (const line of lines) {
    if (line.account_type === 'Revenue' || line.account_type === 'Expense' || line.account_type === 'COGS') {
       const j = journals.find(j => j.id === line.journal_id);
       console.log(`- ${j.voucher_no} (${j.status}) | ${line.account_name} | DR: ${line.debit_amount} CR: ${line.credit_amount}`);
    }
  }
}

run();
