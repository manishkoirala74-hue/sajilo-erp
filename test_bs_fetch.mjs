import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testBalanceSheet() {
  const p_company_id = 'a10e6e72-13ca-46f0-82ba-5cd421da6e2d'; // Using the test company
  const toDate = '2026-07-28';
  
  // fetch all accounts
  const { data: all } = await supabase.from('ChartOfAccount').select('*').eq('company_id', p_company_id).eq('is_active', true).limit(2000);
  
  // fetch RPC
  const { data: bsData, error: bsErr } = await supabase.rpc('get_balance_sheet_rpc', { p_company_id, p_as_of_date: toDate });
  console.log("RPC Error:", bsErr);
  
  if (bsErr && bsErr.code === 'PGRST202') {
    console.log("Fallback to Trial Balance...");
    const { data: tbData, error: tbErr } = await supabase.rpc('get_trial_balance_rpc', { p_company_id, p_from_date: '1970-01-01', p_to_date: toDate });
    console.log("TB Data sample:", tbData?.slice(0, 2));
    
    const tbMap = {};
    if (tbData) {
      tbData.forEach(r => { tbMap[r.id] = r; });
    }
    
    const allAccounts = all.map(a => {
      const r = tbMap[a.id] || {};
      const isDebitNormal = (a.normal_balance || '').toLowerCase() === 'debit';
      const ob_dr = Number(r.opening_debit || 0);
      const ob_cr = Number(r.opening_credit || 0);
      const total_dr = ob_dr + Number(r.current_debit || 0);
      const total_cr = ob_cr + Number(r.current_credit || 0);
      const bal = isDebitNormal ? (total_dr - total_cr) : (total_cr - total_dr);
      return { ...a, balance: bal, closing_balance: bal };
    });
    
    const assets = allAccounts.filter(a => a.account_type === 'Asset');
    console.log("Fallback Assets sample:", assets.map(a => ({ name: a.account_name, bal: a.closing_balance })).filter(a => a.bal !== 0).slice(0, 5));
    
  } else {
    console.log("RPC Data sample:", bsData?.slice(0, 2));
    const allMap = {};
    all.forEach(a => { allMap[a.id] = a; });
    const bsAccounts = (bsData || []).map(a => ({
      ...allMap[a.id],
      closing_balance: Number(a.closing_balance || 0),
      balance: Number(a.closing_balance || 0)
    }));
    const assets = bsAccounts.filter(a => a.account_type === 'Asset');
    console.log("RPC Assets sample:", assets.map(a => ({ name: a.account_name, bal: a.closing_balance })).filter(a => a.bal !== 0).slice(0, 5));
  }
}

testBalanceSheet().catch(console.error);
