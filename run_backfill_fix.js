import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function backfill() {
  const { data: item } = await supabase.from('Item').select('id, weighted_average_cost').eq('item_name', 'Electric Scotty Indian Second Hand').single();
  
  if (item && item.weighted_average_cost > 0) {
      console.log("Updating current_unit_cost to match WAC:", item.weighted_average_cost);
      await supabase.from('Item').update({ current_unit_cost: item.weighted_average_cost }).eq('id', item.id);
      
      const { data: updatedItem } = await supabase.from('Item').select('weighted_average_cost, current_unit_cost').eq('id', item.id).single();
      console.log("Final Item Costs:", updatedItem);
  }
}
backfill();
