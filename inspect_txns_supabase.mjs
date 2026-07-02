import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: items } = await supabase.from('Item').select('id, item_name, quantity_on_hand').ilike('item_name', '%Motorcycle%');
  console.log("Items:");
  console.table(items);

  for (const item of items) {
    const { data: ledger } = await supabase.from('InventoryLedger')
      .select('id, transaction_type, quantity_in, quantity_out, ledger_status, reference_id')
      .eq('item_id', item.id);
    console.log(`\nLedger for ${item.item_name}:`);
    console.table(ledger);

    const { data: cstock } = await supabase.from('CurrentStock')
      .select('godown_id, current_qty')
      .eq('item_id', item.id);
    console.log(`\nCurrentStock for ${item.item_name}:`);
    console.table(cstock);
  }
}

run();
