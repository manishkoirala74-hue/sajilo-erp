import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkobauhvsayqcxmmmtkm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhrb2JhdWh2c2F5cWN4bW1tdGttIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDM5MjE0MCwiZXhwIjoyMDk1OTY4MTQwfQ.yDLhft2a_UOBRW28twjZc_Wfh_GrAn_FI3BURmXjJvs';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('--- 1. Checking Income Statement (GL group: Cost of Goods Sold) ---');
  let { data: coaData, error: coaError } = await supabase
    .from('ChartOfAccount')
    .select('id, account_name, statement_group');
    
  if (coaError) { console.error(coaError); return; }
  const cogsAccounts = coaData.filter(a => a.statement_group === 'Cost of Goods Sold');
  const cogsIds = cogsAccounts.map(a => a.id);
  console.log(`Found ${cogsIds.length} COGS accounts.`);
  
  let { data: glData, error: glError } = await supabase
    .from('GeneralLedgerLine')
    .select('account_id, debit_amount, credit_amount, description, journal_id, GeneralLedgerJournal ( source_document_type )')
    .in('account_id', cogsIds);
    
  if (glError) { console.error(glError); return; }
  
  let isTotal = 0;
  glData.forEach(line => {
    isTotal += (Number(line.debit_amount || 0) - Number(line.credit_amount || 0));
  });
  console.log(`Income Statement Total (Net Debit): ${isTotal}`);

  console.log('\n--- 2. Checking Detail GL for specific "Cost of Sales" account ---');
  const specificAccount = coaData.find(a => a.account_name.toLowerCase() === 'cost of sales' || a.account_name.toLowerCase() === 'cost of goods sold');
  if (specificAccount) {
    let detailTotal = 0;
    const detailLines = glData.filter(l => l.account_id === specificAccount.id);
    detailLines.forEach(line => {
      detailTotal += (Number(line.debit_amount || 0) - Number(line.credit_amount || 0));
    });
    console.log(`Detail GL Total for account "${specificAccount.account_name}": ${detailTotal}`);
    
    // Check what types of transactions are hitting this specific account
    const types = {};
    detailLines.forEach(line => {
      const type = line.GeneralLedgerJournal?.source_document_type || 'Unknown';
      types[type] = (types[type] || 0) + (Number(line.debit_amount || 0) - Number(line.credit_amount || 0));
    });
    console.log('Breakdown by source_document_type:', types);
  } else {
    console.log('Specific "Cost of Sales" account not found by name.');
  }
  
  // Breakdown by account in the group
  console.log('\nBreakdown of GL by account:');
  const accountSums = {};
  glData.forEach(line => {
    accountSums[line.account_id] = (accountSums[line.account_id] || 0) + (Number(line.debit_amount || 0) - Number(line.credit_amount || 0));
  });
  for (const accId in accountSums) {
    const acc = coaData.find(a => a.id === accId);
    console.log(`- ${acc.account_name}: ${accountSums[accId]}`);
  }

  console.log('\n--- 3. Checking GPM (InventoryLedger) ---');
  let { data: invData, error: invError } = await supabase
    .from('InventoryLedger')
    .select('*')
    .in('transaction_type', ['SalesInvoice', 'POSSale', 'SalesReturn']);
    
  if (invError) { console.error(invError); return; }
  
  let gpmTotal = 0;
  let outTotal = 0;
  let inTotal = 0;
  invData.forEach(l => {
    if (l.transaction_type === 'SalesInvoice' || l.transaction_type === 'POSSale') {
      const qty = Math.abs(l.quantity_out || 0);
      const wac = Number(l.wac_at_post || 0);
      const cogs = qty * wac;
      gpmTotal += cogs;
      outTotal += cogs;
    } else if (l.transaction_type === 'SalesReturn') {
      const qty = Math.abs(l.quantity_in || 0);
      const wac = Number(l.wac_at_post || 0);
      const cogs = qty * wac;
      gpmTotal -= cogs;
      inTotal += cogs;
    }
  });
  console.log(`GPM Total COGS: ${gpmTotal}`);
  console.log(`  Sales/POS COGS: ${outTotal}`);
  console.log(`  Returns COGS: -${inTotal}`);
}

run();
