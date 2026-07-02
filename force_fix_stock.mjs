import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function forceFix() {
  console.log("🚀 Starting Force Stock Fix...");

  // 1. Delete the bogus StockAdjustments I created
  console.log("Cleaning up temporary StockAdjustments...");
  await supabase.from('InventoryLedger').delete().eq('transaction_type', 'StockAdjustment');

  // 2. Fetch all Items
  const { data: items } = await supabase.from('Item').select('id, item_name, quantity_on_hand').eq('is_physical', true);
  
  // 3. Fetch all Invoices
  const { data: purchaseInvoices } = await supabase.from('PurchaseInvoice').select('company_id, godown_id, line_items').eq('status', 'Posted');
  const { data: salesInvoices } = await supabase.from('SalesInvoice').select('company_id, godown_id, line_items').eq('status', 'Posted');
  
  const trueStock = {}; // key: item_id, value: qty
  const trueCurrentStock = {}; // key: godown_id + item_id, value: qty
  
  for (const pi of (purchaseInvoices || [])) {
    for (const line of (pi.line_items || [])) {
      if (line.item_id) {
        trueStock[line.item_id] = (trueStock[line.item_id] || 0) + (line.quantity || 0);
        const key = `${pi.godown_id}_${line.item_id}`;
        trueCurrentStock[key] = (trueCurrentStock[key] || 0) + (line.quantity || 0);
      }
    }
  }
  
  for (const si of (salesInvoices || [])) {
    for (const line of (si.line_items || [])) {
      if (line.item_id) {
        trueStock[line.item_id] = (trueStock[line.item_id] || 0) - (line.quantity || 0);
        const key = `${si.godown_id}_${line.item_id}`;
        trueCurrentStock[key] = (trueCurrentStock[key] || 0) - (line.quantity || 0);
      }
    }
  }

  // 4. Update CurrentStock forcing positive via Max(0)
  console.log("Forcing CurrentStock updates...");
  const currentStocksToUpsert = [];
  // We don't have company_id easily from the map, so we'll just pull it from Item or Godown
  const { data: godowns } = await supabase.from('Godown').select('id, company_id');
  const godownMap = {};
  godowns.forEach(g => godownMap[g.id] = g.company_id);

  for (const [key, qty] of Object.entries(trueCurrentStock)) {
    const [godown_id, item_id] = key.split('_');
    const company_id = godownMap[godown_id];
    if (company_id) {
      currentStocksToUpsert.push({
        company_id,
        godown_id,
        item_id,
        current_qty: Math.max(0, qty)
      });
    }
  }
  
  for (let i = 0; i < currentStocksToUpsert.length; i += 100) {
    await supabase.from('CurrentStock').upsert(currentStocksToUpsert.slice(i, i + 100), { onConflict: 'company_id, godown_id, item_id' });
  }

  // 5. Update Item.quantity_on_hand directly
  console.log("Forcing Item updates...");
  for (const item of (items || [])) {
    const correctQty = Math.max(0, trueStock[item.id] || 0);
    if (item.quantity_on_hand !== correctQty) {
      await supabase.from('Item').update({ quantity_on_hand: correctQty }).eq('id', item.id);
      console.log(`✅ Fixed ${item.item_name} -> ${correctQty}`);
    }
  }
  
  console.log("🎉 Done!");
}

forceFix().catch(console.error);
