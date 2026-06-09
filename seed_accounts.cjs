const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://xkobauhvsayqcxmmmtkm.supabase.co', 'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O');

const groups = [
  { account_code: '1000', account_name: 'Assets', account_type: 'Asset', ledger_type: 'Group Ledger', normal_balance: 'Debit', is_system_account: true },
  { account_code: '2000', account_name: 'Liabilities', account_type: 'Liability', ledger_type: 'Group Ledger', normal_balance: 'Credit', is_system_account: true },
  { account_code: '3000', account_name: 'Equity', account_type: 'Equity', ledger_type: 'Group Ledger', normal_balance: 'Credit', is_system_account: true },
  { account_code: '4000', account_name: 'Revenue', account_type: 'Revenue', ledger_type: 'Group Ledger', normal_balance: 'Credit', is_system_account: true },
  { account_code: '5000', account_name: 'COGS', account_type: 'COGS', ledger_type: 'Group Ledger', normal_balance: 'Debit', is_system_account: true },
  { account_code: '6000', account_name: 'OPEX', account_type: 'OPEX', ledger_type: 'Group Ledger', normal_balance: 'Debit', is_system_account: true }
];

async function seed() {
  const { data: gData, error: gErr } = await supabase.from('ChartOfAccount').insert(groups).select();
  if (gErr) { console.error(gErr); return; }
  
  const getId = (code) => gData.find(g => g.account_code === code)?.id;

  const subGroups = [
    { account_code: '1100', account_name: 'Current Assets', account_type: 'Asset', ledger_type: 'Group Ledger', normal_balance: 'Debit', is_system_account: true, parent_account_id: getId('1000') },
    { account_code: '1200', account_name: 'Fixed Assets', account_type: 'Asset', ledger_type: 'Group Ledger', normal_balance: 'Debit', is_system_account: true, parent_account_id: getId('1000') },
    { account_code: '2100', account_name: 'Current Liability', account_type: 'Liability', ledger_type: 'Group Ledger', normal_balance: 'Credit', is_system_account: true, parent_account_id: getId('2000') }
  ];

  const { data: sgData, error: sgErr } = await supabase.from('ChartOfAccount').insert(subGroups).select();
  if (sgErr) { console.error(sgErr); return; }

  const getSubId = (code) => sgData.find(g => g.account_code === code)?.id;

  const subSubGroups = [
    { account_code: '1130', account_name: 'Inventory', account_type: 'Asset', ledger_type: 'Group Ledger', normal_balance: 'Debit', is_system_account: true, parent_account_id: getSubId('1100') }
  ];

  const { data: ssgData, error: ssgErr } = await supabase.from('ChartOfAccount').insert(subSubGroups).select();
  if (ssgErr) { console.error(ssgErr); return; }

  const getSubSubId = (code) => ssgData.find(g => g.account_code === code)?.id;

  const ledgers = [
    { account_code: '1201', account_name: 'Land', account_type: 'Asset', ledger_type: 'Sub Ledger', normal_balance: 'Debit', is_system_account: true, parent_account_id: getSubId('1200') },
    { account_code: '1202', account_name: 'Buildings & Facilities', account_type: 'Asset', ledger_type: 'Sub Ledger', normal_balance: 'Debit', is_system_account: true, parent_account_id: getSubId('1200') },
    { account_code: '1203', account_name: 'Machinery & Equipment', account_type: 'Asset', ledger_type: 'Sub Ledger', normal_balance: 'Debit', is_system_account: true, parent_account_id: getSubId('1200') },
    { account_code: '1204', account_name: 'Vehicles', account_type: 'Asset', ledger_type: 'Sub Ledger', normal_balance: 'Debit', is_system_account: true, parent_account_id: getSubId('1200') },
    { account_code: '1205', account_name: 'Office Furniture & Fixtures', account_type: 'Asset', ledger_type: 'Sub Ledger', normal_balance: 'Debit', is_system_account: true, parent_account_id: getSubId('1200') },
    { account_code: '1206', account_name: 'Computer Equipment & Hardware', account_type: 'Asset', ledger_type: 'Sub Ledger', normal_balance: 'Debit', is_system_account: true, parent_account_id: getSubId('1200') },
    { account_code: '1131', account_name: 'Raw Materials', account_type: 'Asset', ledger_type: 'Sub Ledger', normal_balance: 'Debit', is_system_account: true, parent_account_id: getSubSubId('1130') },
    { account_code: '1132', account_name: 'Finished Goods', account_type: 'Asset', ledger_type: 'Sub Ledger', normal_balance: 'Debit', is_system_account: true, parent_account_id: getSubSubId('1130') },
    { account_code: '1133', account_name: 'Semi-Finished Goods', account_type: 'Asset', ledger_type: 'Sub Ledger', normal_balance: 'Debit', is_system_account: true, parent_account_id: getSubSubId('1130') },
    { account_code: '2199', account_name: 'Difference in Opening Balance', account_type: 'Liability', ledger_type: 'Sub Ledger', normal_balance: 'Credit', is_system_account: true, parent_account_id: getSubId('2100') },
    { account_code: '4100', account_name: 'Sales Revenue', account_type: 'Revenue', ledger_type: 'Sub Ledger', normal_balance: 'Credit', is_system_account: true, parent_account_id: getId('4000') },
    { account_code: '5100', account_name: 'Cost of Sales', account_type: 'COGS', ledger_type: 'Sub Ledger', normal_balance: 'Debit', is_system_account: true, parent_account_id: getId('5000') }
  ];

  const { error: lErr } = await supabase.from('ChartOfAccount').insert(ledgers);
  if (lErr) { console.error(lErr); return; }

  console.log('Seeded successfully with hierarchy!');
}
seed();
