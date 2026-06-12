import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xkobauhvsayqcxmmmtkm.supabase.co',
  'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O'
);

async function debug() {
  const { data: lines, error: lineErr } = await supabase
    .from('GeneralLedgerLine')
    .select('id, account_id, account_name, entity_id, entity_type, debit_amount, credit_amount, GeneralLedgerJournal!inner(id, entry_date, status, voucher_no)')
    .eq('debit_amount', 100000);

  console.log("Lines with 100,000 debit:", JSON.stringify(lines, null, 2));
}

debug().catch(console.error);
