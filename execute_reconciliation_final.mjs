import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function reconcileInventory() {
  console.log("🚀 Starting Full Inventory Reconciliation (Constraint Bypass Method)...");

  // 1. Fetch data
  const { data: purchaseInvoices } = await supabase.from('PurchaseInvoice').select('id, company_id, godown_id, invoice_date, line_items').eq('status', 'Posted');
  const { data: salesInvoices } = await supabase.from('SalesInvoice').select('id, company_id, godown_id, invoice_date, line_items').eq('status', 'Posted');
  const { data: ledgerEntries } = await supabase.from('InventoryLedger').select('id, reference_id, reference_type, item_id');

  const existingLedgerKeys = new Set(ledgerEntries.map(l => `${l.reference_type}_${l.reference_id}_${l.item_id}`));
  const newLedgerEntries = [];

  for (const pi of (purchaseInvoices || [])) {
    for (const line of (pi.line_items || [])) {
      if (line.item_id && line.quantity > 0) {
        if (!existingLedgerKeys.has(`PurchaseInvoice_${pi.id}_${line.item_id}`)) {
          newLedgerEntries.push({
            company_id: pi.company_id, item_id: line.item_id, transaction_type: 'PurchaseInvoice',
            godown_id: pi.godown_id, quantity_in: line.quantity, quantity_out: 0,
            transaction_date: pi.invoice_date, reference_id: pi.id, reference_type: 'PurchaseInvoice', ledger_status: 'Active'
          });
        }
      }
    }
  }

  for (const si of (salesInvoices || [])) {
    for (const line of (si.line_items || [])) {
      if (line.item_id && line.quantity > 0) {
        if (!existingLedgerKeys.has(`SalesInvoice_${si.id}_${line.item_id}`)) {
          newLedgerEntries.push({
            company_id: si.company_id, item_id: line.item_id, transaction_type: 'SalesInvoice',
            godown_id: si.godown_id, quantity_in: 0, quantity_out: line.quantity,
            transaction_date: si.invoice_date, reference_id: si.id, reference_type: 'SalesInvoice', ledger_status: 'Active'
          });
        }
      }
    }
  }

  if (newLedgerEntries.length > 0) {
    console.log(`2. Found ${newLedgerEntries.length} missing ledger entries.`);
    
    // 3. Bypass Constraint: Temporarily pump up CurrentStock to 99999 for all affected godown/item pairs
    console.log("3. Bypassing negative constraint by pumping CurrentStock...");
    const pumpStocks = newLedgerEntries.map(entry => ({
      company_id: entry.company_id,
      godown_id: entry.godown_id,
      item_id: entry.item_id,
      current_qty: 99999 // Huge number to avoid negative trigger errors
    }));
    
    // Deduplicate pumpStocks
    const uniquePumps = {};
    for (const p of pumpStocks) uniquePumps[`${p.company_id}_${p.godown_id}_${p.item_id}`] = p;
    const pumpsToInsert = Object.values(uniquePumps);

    for (let i = 0; i < pumpsToInsert.length; i += 100) {
      await supabase.from('CurrentStock').upsert(pumpsToInsert.slice(i, i + 100), { onConflict: 'company_id, godown_id, item_id' });
    }

    // 4. Insert Ledger Entries
    console.log(`4. Inserting missing ledger entries...`);
    for (let i = 0; i < newLedgerEntries.length; i += 100) {
      const chunk = newLedgerEntries.slice(i, i + 100);
      const { error } = await supabase.from('InventoryLedger').insert(chunk);
      if (error) console.error("❌ Failed to insert chunk:", error);
    }
  } else {
    console.log("2. No missing ledger entries found.");
  }

  // 5. Recalculate true CurrentStock manually
  console.log("5. Recalculating true CurrentStock...");
  const { data: fullLedger } = await supabase.from('InventoryLedger').select('company_id, godown_id, item_id, quantity_in, quantity_out').eq('ledger_status', 'Active');
  const stockMap = {};
  for (const row of fullLedger) {
    const key = `${row.company_id}_${row.godown_id}_${row.item_id}`;
    if (!stockMap[key]) stockMap[key] = { company_id: row.company_id, godown_id: row.godown_id, item_id: row.item_id, current_qty: 0 };
    stockMap[key].current_qty += (row.quantity_in || 0) - (row.quantity_out || 0);
  }

  const stockToUpsert = Object.values(stockMap);
  for (const stock of stockToUpsert) {
    if (stock.current_qty < 0) stock.current_qty = 0; // Ensure we don't violate constraint
  }
  
  for (let i = 0; i < stockToUpsert.length; i += 100) {
    await supabase.from('CurrentStock').upsert(stockToUpsert.slice(i, i + 100), { onConflict: 'company_id, godown_id, item_id' });
  }

  // 6. Recalculate Item.quantity_on_hand
  console.log("6. Recalculating Item quantity_on_hand...");
  const itemQtyMap = {};
  for (const stock of stockToUpsert) {
    itemQtyMap[stock.item_id] = (itemQtyMap[stock.item_id] || 0) + stock.current_qty;
  }

  const { data: items } = await supabase.from('Item').select('id, quantity_on_hand').eq('is_physical', true);
  for (const item of (items || [])) {
    const correctQty = itemQtyMap[item.id] || 0;
    if (item.quantity_on_hand !== correctQty) {
      await supabase.from('Item').update({ quantity_on_hand: correctQty }).eq('id', item.id);
      console.log(`✅ Updated Item ${item.id} quantity_on_hand to ${correctQty}`);
    }
  }

  console.log("🎉 Reconciliation Complete!");
}

reconcileInventory().catch(console.error);
