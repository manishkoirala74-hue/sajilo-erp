import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: items } = await supabase.from('Item').select('id, item_name').ilike('item_name', '%Motorcycle FZ V3 Gray%');
  if (!items || items.length === 0) {
    console.log("Item not found");
    return;
  }
  const item = items[0];
  console.log("Item:", item);

  const { data: history } = await supabase
    .from('InventoryHistory')
    .select('*')
    .eq('item_id', item.id)
    .order('created_at', { ascending: true });

  console.log("Inventory History:");
  history?.forEach(h => console.log(`${h.created_at} | ${h.transaction_type} | Qty: ${h.quantity_change} | Unit Cost: ${h.unit_cost} | Source: ${h.source_document_id}`));
}

run();
