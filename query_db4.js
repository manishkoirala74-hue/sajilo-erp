import { sajilo, supabase } from './src/api/sajiloClient.js';

async function run() {
  const { data: accounts } = await supabase.from('ChartOfAccount').select('*');
  const accMap = {};
  accounts.forEach(a => accMap[a.id] = a.account_type);

  const { data: lines } = await supabase.from('GeneralLedgerLine').select('*');
  
  let revLines = lines.filter(l => l.account_name && l.account_name.includes('Revenue'));
  console.log(`\nRevenue Lines:`);
  let revTotal = 0;
  for (const l of revLines) {
    const type = l.account_type || accMap[l.account_id] || 'Unknown';
    const isDebitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(type);
    const delta = l.debit_amount - l.credit_amount;
    const impact = isDebitNormal ? delta : -delta;
    revTotal += impact;
    console.log(`- JID: ${l.journal_id} | DR: ${l.debit_amount} CR: ${l.credit_amount} | Type: '${l.account_type}' -> mapped: '${type}' | Impact: ${impact}`);
  }
  console.log(`Calculated Rev Total: ${revTotal}`);
  
  let cogsLines = lines.filter(l => l.account_name && (l.account_name.includes('COGS') || l.account_name.includes('Cost of Sales')));
  console.log(`\nCOGS Lines:`);
  let cogsTotal = 0;
  for (const l of cogsLines) {
    const type = l.account_type || accMap[l.account_id] || 'Unknown';
    const isDebitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(type);
    const delta = l.debit_amount - l.credit_amount;
    const impact = isDebitNormal ? delta : -delta;
    cogsTotal += impact;
    console.log(`- JID: ${l.journal_id} | DR: ${l.debit_amount} CR: ${l.credit_amount} | Type: '${l.account_type}' -> mapped: '${type}' | Impact: ${impact}`);
  }
  console.log(`Calculated COGS Total: ${cogsTotal}`);
}

run().then(() => process.exit(0));
