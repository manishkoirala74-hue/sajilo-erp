import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log('Fetching companies...');
  const { data: companies } = await supabase.from('Company').select('id, name');
  
  for (const company of companies) {
    console.log(`\n===========================================`);
    console.log(`Analyzing Company: ${company.name} (${company.id})`);
    console.log(`===========================================`);
    
    // 1. Fetch Trial Balance for the company
    const { data: tbData, error: tbErr } = await supabase.rpc('get_trial_balance_rpc', {
      p_company_id: company.id,
      p_from_date: '2023-01-01',
      p_to_date: '2030-12-31'
    });
    
    if (tbErr) {
      console.error(`Error fetching TB for ${company.name}:`, tbErr);
      continue;
    }
    
    // Calculate TB grand totals
    let tbTotalDebit = 0;
    let tbTotalCredit = 0;
    tbData.forEach(row => {
      tbTotalDebit += Number(row.closing_debit || 0);
      tbTotalCredit += Number(row.closing_credit || 0);
    });
    
    console.log(`[Trial Balance] Total Debit: ${tbTotalDebit}, Total Credit: ${tbTotalCredit}, Difference: ${tbTotalDebit - tbTotalCredit}`);

    // 2. Fetch Ledger Statements for ALL accounts in the TB
    let lsTotalDebit = 0;
    let lsTotalCredit = 0;
    let discrepancies = 0;

    for (const row of tbData) {
      const { data: lsData, error: lsErr } = await supabase.rpc('get_stabilized_general_ledger_statement_rpc', {
        p_company_id: company.id,
        p_account_id: row.id,
        p_from_date: '2023-01-01',
        p_to_date: '2030-12-31'
      });
      
      let lsClosingBalance = 0;
      if (lsErr) {
        console.error(`Error fetching Ledger Statement for account ${row.account_name}:`, lsErr);
      } else if (lsData && lsData.length > 0) {
        lsClosingBalance = Number(lsData[lsData.length - 1].running_balance || 0);
      }
      
      const tbNetBalance = (row.normal_balance === 'Credit' || row.account_type === 'Liability' || row.account_type === 'Equity' || row.account_type === 'Revenue') 
                           ? (Number(row.closing_credit || 0) - Number(row.closing_debit || 0))
                           : (Number(row.closing_debit || 0) - Number(row.closing_credit || 0));
      
      // We'll just sum the absolute balances based on debit/credit
      if (row.closing_debit > 0) lsTotalDebit += lsClosingBalance;
      else if (row.closing_credit > 0) lsTotalCredit += lsClosingBalance;
      else if (lsClosingBalance !== 0) {
        // If TB has 0 but LS has a balance, we need to classify it. 
        // For simplicity, we just flag the discrepancy.
      }
      
      if (Math.abs(lsClosingBalance - tbNetBalance) > 0.01) {
        console.log(`  -> DISCREPANCY: Account ${row.account_name} (${row.account_code}) | TB Net: ${tbNetBalance} | LS Balance: ${lsClosingBalance}`);
        discrepancies++;
      }
    }
    
    console.log(`\n[Ledger Statements] Calculated Total Debit: ${lsTotalDebit}, Total Credit: ${lsTotalCredit}`);
    console.log(`[Reconciliation] Accounts with discrepancies: ${discrepancies}`);
    if (discrepancies === 0) {
      console.log(`✅ Company ${company.name} is perfectly reconciled!`);
    } else {
      console.log(`❌ Company ${company.name} has inconsistencies between TB and Ledger Statements.`);
    }
  }
}

run();
