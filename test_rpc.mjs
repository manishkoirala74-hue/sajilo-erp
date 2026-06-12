import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkobauhvsayqcxmmmtkm.supabase.co';
const supabaseKey = 'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  // 1. Get a company id
  const { data: companies } = await supabase.from('Company').select('id').limit(1);
  const companyId = companies[0].id;
  
  // 2. Get the inventory account id
  const { data: accounts } = await supabase.from('ChartOfAccount').select('id, account_name').eq('company_id', companyId).ilike('account_name', '%inventory%').limit(1);
  const accountId = accounts[0].id;
  
  console.log('Company ID:', companyId);
  console.log('Account ID:', accountId);
  
  // 3. Call the RPC
  const { data, error } = await supabase.rpc('get_detail_general_ledger_rpc', {
    p_company_id: companyId,
    p_account_id: accountId,
    p_from_date: '2026-01-01',
    p_to_date: '2026-12-31'
  });
  
  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('RPC Success! Rows:', data.length);
    console.log(data);
  }
}

test();
