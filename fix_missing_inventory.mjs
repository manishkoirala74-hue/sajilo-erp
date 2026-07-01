import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  console.log("Fixing missing InventoryHistory for PI-2026-005...");

  const { data: item } = await supabase.from('Item').select('*').eq('item_name', 'Motorcycle Apache 160 CC Blue').single();
  const { data: pi } = await supabase.from('PurchaseInvoice').select('*').eq('invoice_number', 'PI-2026-005').single();

  if (!item || !pi) return console.log("Could not find Item or PI");

  const line = pi.line_items.find(l => l.item_id === item.id);

  const { data: insertData, error: insertError } = await supabase.from('InventoryHistory').insert({
    company_id: item.company_id,
    item_id: item.id,
    transaction_date: pi.invoice_date,
    reference_id: pi.id,
    reference_type: 'PurchaseInvoice',
    reference_no: pi.invoice_number,
    quantity_change: line.received_qty || line.quantity || 1,
    unit_cost: line.unit_price,
    notes: 'Restored missing purchase entry'
  }).select();

  if (insertError) {
    console.error("Failed to insert InventoryHistory:", insertError);
  } else {
    console.log("Inserted missing InventoryHistory:", insertData);
    
    // Now trigger the WAC recalculation!
    console.log("Calling rpc_recalculate_item_wac...");
    const { data: newWac, error: rpcError } = await supabase.rpc('rpc_recalculate_item_wac', {
      p_company_id: item.company_id,
      p_item_id: item.id
    });
    
    if (rpcError) {
      console.error("RPC Error:", rpcError.message);
    } else {
      console.log("WAC Successfully Recalculated! New WAC is:", newWac);
    }
  }
}

fix();
