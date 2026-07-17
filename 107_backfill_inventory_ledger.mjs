import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function backfill() {
  console.log("Starting backfill for InventoryLedger...");

  // 1. Fetch all ledgers that need backfilling
  const { data: ledgers, error: fetchErr } = await supabase
    .from('InventoryLedger')
    .select('*')
    .is('voucher_no', null);

  if (fetchErr) {
    console.error("Error fetching ledgers:", fetchErr);
    return;
  }

  console.log(`Found ${ledgers.length} ledgers to backfill.`);

  for (const ledger of ledgers) {
    let voucher_no = '';
    let description = '';
    let total_amount = 0;
    let wac_at_post = 0;

    // Get current WAC as fallback
    const { data: itemData } = await supabase.from('Item').select('current_unit_cost, weighted_average_cost').eq('id', ledger.item_id).single();
    wac_at_post = itemData?.current_unit_cost || itemData?.weighted_average_cost || 0;

    if (ledger.transaction_type === 'PurchaseInvoice') {
      const { data: pi } = await supabase.from('PurchaseInvoice').select('*').eq('id', ledger.reference_id).single();
      if (pi) {
        voucher_no = pi.invoice_number;
        description = 'Purchase from ' + (pi.vendor_name || 'Supplier');
        
        // Find line item to get price
        const lineItem = (pi.line_items || []).find(l => l.item_id === ledger.item_id);
        const price = lineItem ? (Number(lineItem.unit_price) || Number(lineItem.rate) || 0) : 0;
        total_amount = Number(ledger.quantity_in) * price;
      }
    } else if (ledger.transaction_type === 'SalesInvoice') {
      const { data: si } = await supabase.from('SalesInvoice').select('*').eq('id', ledger.reference_id).single();
      if (si) {
        voucher_no = si.invoice_number;
        description = 'Sale to ' + (si.customer_name || 'Customer');
        
        // Find line item to get price
        const lineItem = (si.line_items || []).find(l => l.item_id === ledger.item_id);
        const price = lineItem ? (Number(lineItem.unit_price) || Number(lineItem.rate) || 0) : 0;
        total_amount = Number(ledger.quantity_out) * price;
      }
    } else if (ledger.transaction_type === 'StockTransfer') {
      const { data: st } = await supabase.from('StockTransfer').select('*').eq('id', ledger.reference_id).single();
      if (st) {
        voucher_no = st.transfer_number;
        description = Number(ledger.quantity_in) > 0 ? 'Transfer In from Godown' : 'Transfer Out to Godown';
        total_amount = 0;
      }
    }

    if (voucher_no) {
      const { error: updateErr } = await supabase
        .from('InventoryLedger')
        .update({
          voucher_no,
          description,
          total_amount,
          wac_at_post
        })
        .eq('id', ledger.id);
        
      if (updateErr) {
        console.error(`Error updating ledger ${ledger.id}:`, updateErr);
      } else {
        console.log(`Updated ledger ${ledger.id} (Voucher: ${voucher_no})`);
      }
    }
  }

  console.log("Backfill complete!");
}

backfill();
