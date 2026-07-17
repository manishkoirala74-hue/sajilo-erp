import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function backfill() {
  console.log("Starting backfill for Electric Scotty Indian Second Hand...");
  
  // 1. Get the item and company ID
  const { data: item } = await supabase.from('Item').select('id, company_id').eq('item_name', 'Electric Scotty Indian Second Hand').single();
  if (!item) return console.error("Item not found");
  
  // 2. Get the purchase invoice
  const { data: invoice } = await supabase.from('PurchaseInvoice').select('id, invoice_date, invoice_number').eq('invoice_number', 'PI-2026-021').single();
  if (!invoice) return console.error("Invoice not found");

  // 3. Check if InventoryHistory already exists
  const { data: existingHist } = await supabase.from('InventoryHistory').select('id').eq('reference_id', invoice.id).eq('item_id', item.id);
  
  if (!existingHist || existingHist.length === 0) {
      console.log("Inserting InventoryHistory record...");
      const { error: insertError } = await supabase.from('InventoryHistory').insert({
          item_id: item.id,
          company_id: item.company_id,
          transaction_date: invoice.invoice_date,
          reference_id: invoice.id,
          reference_type: 'PurchaseInvoice',
          reference_no: invoice.invoice_number,
          quantity_change: 1,
          unit_cost: 25000,
          notes: 'Manual Backfill'
      });
      if (insertError) console.error("Insert Error:", insertError);
  } else {
      console.log("InventoryHistory record already exists.");
  }

  // 4. Trigger Recalculation
  console.log("Triggering rpc_recalculate_item_wac...");
  const { data: wac, error: rpcError } = await supabase.rpc('rpc_recalculate_item_wac', {
      p_company_id: item.company_id,
      p_item_id: item.id
  });
  
  if (rpcError) {
      console.error("RPC Error:", rpcError);
  } else {
      console.log("New WAC calculated:", wac);
      const { data: updatedItem } = await supabase.from('Item').select('weighted_average_cost, current_unit_cost').eq('id', item.id).single();
      console.log("Item costs after recalculation:", updatedItem);
  }
}
backfill();
