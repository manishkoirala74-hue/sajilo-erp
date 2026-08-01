import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('Fetching companies...');
  const { data: companies } = await supabase.from('Company').select('id, name');
  console.log('Companies:', companies);

  const { data: account } = await supabase.from('ChartOfAccount').select('*').like('account_code', '11300010%');
  console.log('Account(s):', account);
  
  if (!account || account.length === 0) {
    console.log('Account 11300010 not found');
    return;
  }
  
  const acc = account[0];
  const companyId = acc.company_id;
  console.log(`Using Company ID: ${companyId}`);
  
  const from_date = '2023-01-01'; // use a wide date range
  const to_date = '2030-12-31';
  
  // 1. Check Trial Balance RPC
  const { data: tbData, error: tbErr } = await supabase.rpc('get_trial_balance_rpc', {
    p_company_id: companyId,
    p_from_date: from_date,
    p_to_date: to_date
  });
  
  if (tbErr) {
    console.error('TB Error:', tbErr);
  } else {
    const tbRow = tbData.find(r => r.account_name === acc.account_name || r.account_id === acc.id);
    console.log('Trial Balance Row:', tbRow);
    if (!tbRow) {
      console.log('Account not found in Trial Balance. Available accounts:');
      console.log(tbData.map(r => r.account_name).join(', '));
    }
  }
  
  // 2. Check Ledger Statement RPC
  const { data: lsData, error: lsErr } = await supabase.rpc('get_stabilized_general_ledger_statement_rpc', {
    p_company_id: companyId,
    p_account_id: acc.id,
    p_from_date: from_date,
    p_to_date: to_date
  });
  
  if (lsErr) {
    console.error('LS Error:', lsErr);
  } else {
    let lsClosing = null;
    let lsDr = 0;
    let lsCr = 0;
    if (lsData && lsData.length > 0) {
      lsClosing = lsData[lsData.length - 1]; // Assuming the last row has the closing balance or total
      console.log('Ledger Statement Closing Row:', lsClosing);
      lsData.forEach(r => {
        if (!r.is_opening) {
          lsDr += r.debit_amount || 0;
          lsCr += r.credit_amount || 0;
        }
      });
      console.log('Ledger Statement Sum -> DR:', lsDr, 'CR:', lsCr, 'Net:', lsDr - lsCr);
    }
  }
  
  // 3. Raw Line check
  const { data: rawLines, error: rawErr } = await supabase
    .from('GeneralLedgerLine')
    .select('*, GeneralLedgerJournal!inner(status, voucher_no, id)')
    .eq('account_id', acc.id);
    
  if (rawErr) {
    console.error('Raw Lines Error:', rawErr);
  } else {
    let drSum = 0;
    let crSum = 0;
    
    console.log('\n--- ALL RAW LINES ---');
    rawLines.forEach(l => {
      const dr = l.debit_amount || 0;
      const cr = l.credit_amount || 0;
      if (l.GeneralLedgerJournal.status === 'Posted') {
        drSum += dr;
        crSum += cr;
      }
      console.log(`[ID: ${l.GeneralLedgerJournal.id}] ${l.GeneralLedgerJournal.voucher_no} (Status: ${l.GeneralLedgerJournal.status}): DR ${dr}, CR ${cr}`);
    });
    
    console.log('Raw Posted Lines Sum -> DR:', drSum, 'CR:', crSum, 'Net (DR-CR):', drSum - crSum);
  }
  
  // Let's also check opening balance from ChartOfAccounts
  console.log('\nAccount Opening Balance:', acc.opening_balance, 'Type:', acc.opening_balance_type);
}

run();
