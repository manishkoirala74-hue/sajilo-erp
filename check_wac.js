import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xkobauhvsayqcxmmmtkm.supabase.co',
  'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O'
);

async function run() {
  const { data: items } = await supabase.from('Item').select('*');
  console.log('ITEMS:');
  items.forEach(i => {
    console.log(`[${i.item_code}] ${i.item_name} | QTY: ${i.quantity_on_hand} | WAC: ${i.weighted_average_cost} | Asset Val: ${i.total_asset_value}`);
  });
}
run();
