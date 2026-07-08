import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: item } = await supabase.from('Item').select('id, item_name').ilike('item_name', '%Motorcycle FZ V3 Gray%').single();
  if (!item) {
    console.log("Item not found");
    return;
  }
  
  const { data: ledger } = await supabase
    .from('InventoryLedger')
    .select('*')
    .eq('item_id', item.id)
    .order('transaction_date', { ascending: true });

  console.log("Inventory Ledger:");
  ledger?.forEach(l => console.log(`${l.transaction_date} | ${l.transaction_type} | QtyIn: ${l.quantity_in} | QtyOut: ${l.quantity_out} | Ref: ${l.reference_id}`));
}
run();
