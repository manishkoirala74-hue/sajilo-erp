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
        closing_balance: acc.closing_balance + t.closing_balance,
        balance: acc.balance + t.balance,
      };
    },
    { closing_balance: 0, balance: 0 }
  );
}

async function run() {
  const companyId = 'a10e6e72-13ca-46f0-82ba-5cd421da6e2d';
  const toDate = '2026-07-28';
  
  const { data: all } = await supabase.from('ChartOfAccount').select('*').eq('company_id', companyId).eq('is_active', true);
  
  const { data: tbData } = await supabase.rpc('get_trial_balance_rpc', { p_company_id: companyId, p_from_date: '1970-01-01', p_to_date: toDate });
  const tbMap = {};
  if (tbData) tbData.forEach(r => { tbMap[r.id] = r; });
  
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
  
  const byId = {};
  assets.forEach(a => { byId[a.id] = { ...a, _children: [] }; });
  
  const roots = [];
  assets.forEach(a => {
    if (a.parent_account_id && byId[a.parent_account_id]) {
      byId[a.parent_account_id]._children.push(byId[a.id]);
    } else {
      roots.push(byId[a.id]);
    }
  });

  console.log(`Total Asset Roots: ${roots.length}`);
  roots.forEach(r => {
    const t = computeSubtreeTotals(r, 'balance_sheet');
    console.log(`Root: ${r.account_name} | Type: ${r.ledger_type} | Balance: ${t.closing_balance}`);
    if (r._children.length > 0) {
      console.log(`  Children of ${r.account_name}:`);
      r._children.forEach(c => {
        const ct = computeSubtreeTotals(c, 'balance_sheet');
        console.log(`    ${c.account_name} | Type: ${c.ledger_type} | Balance: ${ct.closing_balance}`);
      });
    }
  });
}

run().catch(console.error);
