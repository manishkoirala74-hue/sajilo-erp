import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function computeSubtreeTotals(node, reportType) {
  if (node.ledger_type !== 'Group Ledger') {
    return {
      closing_balance: node.closing_balance || 0,
      balance: node.balance || 0,
    };
  }
  return node._children.reduce(
    (acc, child) => {
      const t = computeSubtreeTotals(child, reportType);
      return {
        closing_balance: (acc.closing_balance || 0) + (t.closing_balance || 0),
        balance: (acc.balance || 0) + (t.balance || 0),
      };
    },
    { closing_balance: 0, balance: 0 }
  );
}

async function run() {
  const companyId = 'a10e6e72-13ca-46f0-82ba-5cd421da6e2d';
  const toDate = '2026-07-28';
  
  // 1. Fetch all
  const { data: allCoA } = await supabase.from('ChartOfAccount').select('*').eq('company_id', companyId).eq('is_active', true);
  
  // 2. Fetch tbData (fallback)
  const { data: tbData } = await supabase.rpc('get_trial_balance_rpc', { p_company_id: companyId, p_from_date: '1970-01-01', p_to_date: toDate });
  const tbMap = {};
  if (tbData) tbData.forEach(r => { tbMap[r.id] = r; });
  
  const allAccounts = allCoA.map(a => {
    const r = tbMap[a.id] || { current_debit: 0, current_credit: 0 };
    const isDebitNormal = (a.normal_balance || '').toLowerCase() === 'debit';
    const base_ob = Number(a.opening_balance || 0);
    const isBaseObDr = (a.opening_balance_type || (isDebitNormal ? 'Dr' : 'Cr')) === 'Dr';
    let ob_dr = 0, ob_cr = 0;
    if (isBaseObDr) ob_dr = base_ob; else ob_cr = base_ob;
    const total_dr = ob_dr + Number(r.current_debit || 0);
    const total_cr = ob_cr + Number(r.current_credit || 0);
    const bal = isDebitNormal ? (total_dr - total_cr) : (total_cr - total_dr);
    return { ...a, balance: bal };
  });

  const isIncomeStatement = a => a.statement_type === 'income_statement';
  const netIncome = allAccounts.filter(isIncomeStatement).reduce((sum, a) => {
    const isExpense = (a.normal_balance || '').toLowerCase() === 'debit';
    return isExpense ? sum - a.balance : sum + a.balance;
  }, 0);
  
  const toRow    = a  => ({ ...a, closing_balance: a.balance });
  const assets      = allAccounts.filter(a => a.account_type === 'Asset').map(toRow);
  const liabilities = allAccounts.filter(a => a.account_type === 'Liability').map(toRow);
  const equity      = allAccounts.filter(a => a.account_type === 'Equity').map(toRow);
  
  equity.push({
    id: 'virtual-current-year-earnings', account_code: '—', account_name: 'Current Year Earnings', account_type: 'Equity', ledger_type: 'Sub Ledger', closing_balance: netIncome, balance: netIncome
  });

  const rpcAccounts = [...assets, ...liabilities, ...equity];

  // 3. ReportViewer Merge
  const balanceMap = {};
  rpcAccounts.forEach(a => { balanceMap[a.id] = a.closing_balance || 0; });

  const merged = allCoA.map(a => {
    return { ...a, closing_balance: balanceMap[a.id] || 0 };
  });

  const virtualEarnings = rpcAccounts.find(a => a.id === 'virtual-current-year-earnings');
  if (virtualEarnings) {
    const equityRoot = merged.find(a => a.account_type === 'Equity' && a.ledger_type === 'Group Ledger' && !a.parent_account_id);
    merged.push({
      ...virtualEarnings,
      parent_account_id: equityRoot ? equityRoot.id : null
    });
  }

  // 4. buildTree
  const byId = {};
  merged.forEach(a => { byId[a.id] = { ...a, _children: [] }; });
  const roots = [];
  merged.forEach(a => {
    if (a.parent_account_id && byId[a.parent_account_id]) {
      byId[a.parent_account_id]._children.push(byId[a.id]);
    } else {
      roots.push(byId[a.id]);
    }
  });

  // Print results
  roots.filter(r => r.account_type === 'Asset' || r.account_type === 'Liability' || r.account_type === 'Equity').forEach(r => {
    const t = computeSubtreeTotals(r, 'balance_sheet');
    console.log(`Root: ${r.account_name} | Type: ${r.ledger_type} | Balance: ${t.closing_balance}`);
    if (r._children.length > 0) {
      r._children.forEach(c => {
        const ct = computeSubtreeTotals(c, 'balance_sheet');
        console.log(`  ${c.account_name} | Type: ${c.ledger_type} | Balance: ${ct.closing_balance}`);
      });
    }
  });
}

run().catch(console.error);
