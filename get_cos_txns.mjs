import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: accounts } = await supabase
    .from('ChartOfAccount')
    .select('id, account_code, account_name, account_type')
    .eq('account_name', 'Cost of Sales');

  const cosAccountIds = accounts.map(a => a.id);

  const { data: journals, error: jError } = await supabase
    .from('GeneralLedgerJournal')
    .select('id, voucher_no, entry_date, status, source_document_type')
    .in('status', ['Posted']);
    
  if (jError) console.error(jError);
  
  const journalMap = new Map();
  (journals || []).forEach(j => journalMap.set(j.id, j));

  const { data: lines } = await supabase
    .from('GeneralLedgerLine')
    .select('journal_id, debit_amount, credit_amount, description')
    .in('account_id', cosAccountIds);

  const voucherNumbers = [];
  lines.forEach(l => {
    const journal = journalMap.get(l.journal_id);
    if (journal && journal.voucher_no) {
      voucherNumbers.push(journal.voucher_no);
    }
  });

  // Fetch Invoices with line_items JSONB
  const { data: invoices } = await supabase
    .from('SalesInvoice')
    .select('id, invoice_number, line_items')
    .in('invoice_number', voucherNumbers);

  const itemsByVoucher = new Map();
  (invoices || []).forEach(inv => {
    let itemsForInv = [];
    if (inv.invoice_number === 'SI-2026-001-D2') console.log("Line Items JSON:", inv.line_items);
    if (inv.line_items && Array.isArray(inv.line_items)) {
      itemsForInv = inv.line_items.filter(l => l.item_id).map(l => {
        if (l.item_name) return l.item_name;
        if (l.description) return l.description.replace('Sale: ', '');
        return 'Unknown Item';
      });
    }
    itemsByVoucher.set(inv.invoice_number, itemsForInv);
  });

  let totalDebit = 0;
  let totalCredit = 0;

  console.log("Cost of Sales Transactions:");
  console.log("-------------------------------------------------------------------------------------------------------------------------");
  console.log("Date       | Voucher No         | Dr Amount | Cr Amount | Items in Invoice");
  console.log("-------------------------------------------------------------------------------------------------------------------------");
  lines.forEach(l => {
    const journal = journalMap.get(l.journal_id);
    if (journal) {
      const dr = l.debit_amount || 0;
      const cr = l.credit_amount || 0;
      totalDebit += dr;
      totalCredit += cr;
      
      const itemNamesList = itemsByVoucher.get(journal.voucher_no) || [];
      const itemNames = itemNamesList.join(', ');
      
      console.log(`${journal.entry_date.padEnd(10)} | ${String(journal.voucher_no).padEnd(18)} | ${String(dr).padEnd(9)} | ${String(cr).padEnd(9)} | ${itemNames}`);
    }
  });
  console.log("-------------------------------------------------------------------------------------------------------------------------");
  console.log(`Total Dr: ${totalDebit}, Total Cr: ${totalCredit}, Net Balance: ${totalDebit - totalCredit}`);
}

run();
