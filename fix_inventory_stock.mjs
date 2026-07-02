import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// We must use the SERVICE_ROLE_KEY to bypass Row-Level Security during admin tasks
const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or VITE_SAJILO_APP_BASE_URL in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixInventory() {
  console.log("🚀 Starting Inventory Stock Reconciliation Script...");

  try {
    // 1. Fetch all active items
    const { data: items, error: itemsError } = await supabase.from('Item').select('id, item_name, quantity_on_hand');
    if (itemsError) throw itemsError;
    
    // 2. Fetch all current stock aggregates across all godowns
    const { data: currentStocks, error: stockError } = await supabase.from('CurrentStock').select('item_id, current_qty');
    if (stockError) throw stockError;

    // 3. Aggregate true stock per item from CurrentStock
    const trueStockMap = {};
    currentStocks.forEach(stock => {
      const id = stock.item_id;
      const qty = Number(stock.current_qty) || 0;
      trueStockMap[id] = (trueStockMap[id] || 0) + qty;
    });

    let mismatchCount = 0;
    const updates = [];

    // 4. Compare and prepare fixes
    for (const item of items) {
      const trueStock = trueStockMap[item.id] || 0;
      const displayStock = Number(item.quantity_on_hand) || 0;

      if (trueStock !== displayStock) {
        mismatchCount++;
        console.log(`⚠️ Mismatch found -> [${item.item_name}]: UI Shows: ${displayStock} | True Stock: ${trueStock}`);
        
        updates.push({
          id: item.id,
          quantity_on_hand: trueStock
        });
      }
    }

    if (updates.length === 0) {
      console.log("✅ All items are perfectly synced. No fixes needed.");
      return;
    }

    console.log(`\n🔧 Found ${mismatchCount} items with mismatched stock. Applying fixes...`);

    // 5. Apply updates in batches to avoid overwhelming the database
    for (const update of updates) {
      const { error } = await supabase
        .from('Item')
        .update({ quantity_on_hand: update.quantity_on_hand })
        .eq('id', update.id);
        
      if (error) {
        console.error(`❌ Failed to update item ${update.id}:`, error.message);
      } else {
        console.log(`✅ Fixed stock for Item ID: ${update.id}`);
      }
    }

    console.log("\n🎉 Inventory Stock Reconciliation Completed Successfully!");

  } catch (err) {
    console.error("❌ Script aborted due to error:", err.message);
  }
}

fixInventory();
