import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: items } = await supabase.from('Item').select('*').ilike('item_name', '%Motorcycle Apache 160 CC Blue%');
  if (!items || items.length === 0) {
    console.log("Item not found");
    return;
  }
  const item = items[0];
  console.log("Found Item:", JSON.stringify(item, null, 2));

  const { data: history, error: hError } = await supabase.from('InventoryHistory').select('*').eq('item_id', item.id).order('created_at', { ascending: true });
  if (hError) console.error(hError);
  
  console.log("Checking PI-2026-005 Details:");
  const { data: pi, error: piError } = await supabase.from('PurchaseInvoice').select('*').eq('invoice_number', 'PI-2026-005');
  console.log(JSON.stringify(pi, null, 2));
  relevantAdjustments.forEach(adj => {
    console.log(`SA: ${adj.adjustment_number} (Status: ${adj.status}, Type: ${adj.adjustment_type})`);
    const line = adj.line_items.find(l => l.item_id === item.id);
    console.log(JSON.stringify(line, null, 2));
  });
}

run();
