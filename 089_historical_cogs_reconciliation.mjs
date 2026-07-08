import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function reconcileCOGS() {
  console.log("Starting Historical COGS Reconciliation...");
  
  // 1. Find all physical items
  const { data: items } = await supabase.from('Item').select('*').eq('is_physical', true);
  
  let totalCogsGap = 0;
  
  for (const item of items) {
    let currentWac = 0;
    let currentQty = 0;
    let expectedTotalCogs = 0;
    let actualRecordedCogs = 0;
    
    // 2. Get chronological inventory ledger
    const { data: ledger } = await supabase.from('InventoryLedger')
      .select('*')
      .eq('item_id', item.id)
      .order('transaction_date', { ascending: true });
      
    for (const entry of ledger) {
      if (entry.transaction_type === 'PurchaseInvoice') {
        const { data: pi } = await supabase.from('PurchaseInvoice').select('line_items').eq('id', entry.reference_id).single();
        if (pi && pi.line_items) {
          const line = pi.line_items.find(l => l.item_id === item.id);
          if (line) {
            const qty = Number(line.quantity || 0);
            const unitPrice = Number(line.unit_price || 0);
            if (currentQty <= 0) {
              currentWac = unitPrice;
            } else {
              currentWac = ((currentQty * currentWac) + (qty * unitPrice)) / (currentQty + qty);
            }
            currentQty += qty;
          }
        }
      } else if (entry.transaction_type === 'SalesInvoice') {
        // Sales deduct quantity and book COGS
        const qtySold = Number(entry.quantity_out || 0);
        expectedTotalCogs += (qtySold * currentWac);
        
        // Find what was actually recorded
        const { data: si } = await supabase.from('SalesInvoice').select('line_items').eq('id', entry.reference_id).single();
        if (si && si.line_items) {
          const line = si.line_items.find(l => l.item_id === item.id);
          if (line) {
            const costAtSale = Number(line.wac_unit_cost_snapshot || line.cost_at_sale || item.purchase_price || 0); // as fallback
            actualRecordedCogs += (qtySold * costAtSale);
          }
        }
        currentQty -= qtySold;
      }
    }
    
    const gap = expectedTotalCogs - actualRecordedCogs;
    if (Math.abs(gap) > 0.01) {
      console.log(`Item: ${item.item_name} | Expected COGS: ${expectedTotalCogs} | Actual COGS: ${actualRecordedCogs} | Gap: ${gap}`);
      totalCogsGap += gap;
    }
  }
  
  console.log(`\nTotal COGS Adjustment Required: Rs ${totalCogsGap}`);
  if (totalCogsGap !== 0) {
    console.log("To reconcile this, post an Adjusting Journal Entry (AJE):");
    if (totalCogsGap > 0) {
      console.log(`  Debit:  Cost of Sales           Rs ${totalCogsGap}`);
      console.log(`  Credit: Retained Earnings       Rs ${totalCogsGap}`);
    } else {
      console.log(`  Debit:  Retained Earnings       Rs ${Math.abs(totalCogsGap)}`);
      console.log(`  Credit: Cost of Sales           Rs ${Math.abs(totalCogsGap)}`);
    }
  }
}

reconcileCOGS();
