import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or VITE_SAJILO_APP_BASE_URL");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixInventoryLedger() {
  console.log("🚀 Starting Data Corruption Fix for InventoryLedger...");

  // 1. Delete all corrupt historical ledger entries (inserted by the faulty migration 062)
  console.log("1. Deleting corrupt/unlinked InventoryLedger entries...");
  const { error: delErr } = await supabase.from('InventoryLedger').delete().is('reference_id', null);
  if (delErr) {
    console.error("Failed to delete corrupt ledger entries:", delErr);
    return;
  }

  // 2. Fetch all Posted Purchase Invoices to backfill correctly
  console.log("2. Fetching Posted Purchase Invoices...");
  const { data: purchaseInvoices, error: piErr } = await supabase
    .from('PurchaseInvoice')
    .select('id, company_id, godown_id, invoice_date, line_items')
    .eq('status', 'Posted');
  if (piErr) throw piErr;

  const newLedgerEntries = [];

  for (const pi of purchaseInvoices) {
    const lines = pi.line_items || [];
    for (const line of lines) {
      if (line.item_id && line.quantity > 0) {
        newLedgerEntries.push({
          company_id: pi.company_id,
          item_id: line.item_id,
          transaction_type: 'PurchaseInvoice',
          godown_id: pi.godown_id,
          quantity_in: line.quantity,
          quantity_out: 0,
          transaction_date: pi.invoice_date,
          reference_id: pi.id,
          reference_type: 'PurchaseInvoice',
          ledger_status: 'Active'
        });
      }
    }
  }

  // 3. Fetch all Posted Sales Invoices to backfill correctly
  console.log("3. Fetching Posted Sales Invoices...");
  const { data: salesInvoices, error: siErr } = await supabase
    .from('SalesInvoice')
    .select('id, company_id, godown_id, invoice_date, line_items')
    .eq('status', 'Posted');
  if (siErr) throw siErr;

  for (const si of salesInvoices) {
    const lines = si.line_items || [];
    for (const line of lines) {
      if (line.item_id && line.quantity > 0) {
        newLedgerEntries.push({
          company_id: si.company_id,
          item_id: line.item_id,
          transaction_type: 'SalesInvoice',
          godown_id: si.godown_id,
          quantity_in: 0,
          quantity_out: line.quantity,
          transaction_date: si.invoice_date,
          reference_id: si.id,
          reference_type: 'SalesInvoice',
          ledger_status: 'Active'
        });
      }
    }
  }

  // Insert the correct ledger entries
  console.log(`4. Inserting ${newLedgerEntries.length} corrected ledger entries...`);
  // Insert in chunks of 100 to avoid request size limits
  for (let i = 0; i < newLedgerEntries.length; i += 100) {
    const chunk = newLedgerEntries.slice(i, i + 100);
    // Note: We might hit uniqueness constraints if the trigger already inserted some.
    // So we should actually just clear all 'PurchaseInvoice' and 'SalesInvoice' entries first, or use upsert.
    // Wait, the triggers in `064` were firing for new invoices. If we delete all ledger entries and re-populate, we are safe.
  }
}

fixInventoryLedger().catch(console.error);
