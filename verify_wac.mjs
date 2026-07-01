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
  console.log("Before Recalculation -> WAC:", item.weighted_average_cost);

  console.log("Calling rpc_recalculate_item_wac...");
  const { data: newWac, error } = await supabase.rpc('rpc_recalculate_item_wac', {
    p_company_id: item.company_id,
    p_item_id: item.id
  });

  if (error) {
    console.error("Error calling RPC:", error.message);
  } else {
    console.log("RPC returned New WAC:", newWac);
    
    // Fetch item again to verify it persisted
    const { data: updatedItems } = await supabase.from('Item').select('weighted_average_cost').eq('id', item.id);
    console.log("Database Verified WAC:", updatedItems[0].weighted_average_cost);
  }
}

run();
