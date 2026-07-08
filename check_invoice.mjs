import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkInvoice() {
  console.log('--- Checking SalesInvoice ---');
  const { data: inv, error: err1 } = await supabase
    .from('SalesInvoice')
    .select('id, invoice_number, status, grand_total')
    .eq('invoice_number', 'SI-2026-005');
  console.log(err1 ? err1 : inv);

  if (inv && inv.length > 0) {
    const invId = inv[0].id;
    
    console.log('\n--- Checking InventoryLedger ---');
    const { data: stock, error: err2 } = await supabase
      .from('InventoryLedger')
      .select('id, transaction_type, quantity_in, quantity_out')
      .eq('reference_id', invId);
    console.log(err2 ? err2 : `Found ${stock.length} inventory records`);

    console.log('\n--- Checking GeneralLedgerLine (direct) ---');
    const { data: gl, error: err3 } = await supabase
      .from('GeneralLedgerLine')
      .select('id, account_id, debit_amount, credit_amount')
      .eq('entity_id', invId);
    console.log(err3 ? err3 : `Found ${gl.length} GL records directly`);
    
    console.log('\n--- Checking GL via Journal ---');
    const { data: journal, error: err4 } = await supabase
      .from('Journal')
      .select('id')
      .eq('reference_id', invId);
    
    if (journal && journal.length > 0) {
        const { data: gl2 } = await supabase.from('GeneralLedgerLine').select('id, debit_amount').eq('journal_id', journal[0].id);
        console.log(`Found ${gl2 ? gl2.length : 0} GL records via Journal`);
    } else {
        console.log('No Journal found for reference_id');
    }
  }
}
checkInvoice();
