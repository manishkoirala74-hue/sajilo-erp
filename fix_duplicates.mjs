import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xkobauhvsayqcxmmmtkm.supabase.co',
  'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O'
);

async function run() {
  console.log('Fetching Purchase Invoices with multiple GL journals...');

  // Get all GeneralLedgerJournals for PurchaseInvoices
  const { data: journals, error: jErr } = await supabase
    .from('GeneralLedgerJournal')
    .select('*')
    .eq('source_document_type', 'PurchaseInvoice')
    .order('created_at', { ascending: true });

  if (jErr) throw jErr;

  const grouped = {};
  for (const j of journals) {
    if (!grouped[j.source_document_id]) grouped[j.source_document_id] = [];
    grouped[j.source_document_id].push(j);
  }

  for (const [docId, list] of Object.entries(grouped)) {
    if (list.length > 1) {
      console.log(`Found ${list.length} journals for PurchaseInvoice ${docId}`);
      
      // Keep the last one, reverse the earlier ones
      const journalsToReverse = list.slice(0, list.length - 1);
      
      for (const j of journalsToReverse) {
        console.log(`Reversing duplicate journal: ${j.id}`);
        // Reverse journal
        const { error: rErr } = await supabase.rpc('rpc_reverse_gl_transaction', {
          p_company_id: j.company_id,
          p_original_journal_id: j.id,
          p_reversal_date: j.entry_date,
          p_reason: 'Duplicate due to schema cache error'
        });
        if (rErr) console.error(`Error reversing ${j.id}:`, rErr);
        else console.log(`Successfully reversed ${j.id}`);
      }
    }
  }

  // Now fix item quantities.
  console.log('Fetching Purchase Invoices to fix Item quantities...');
  const { data: invoices, error: invErr } = await supabase
    .from('PurchaseInvoice')
    .select('*, line_items');

  if (invErr) throw invErr;

  const affectedInvoices = Object.keys(grouped).filter(id => grouped[id].length > 1);

  for (const inv of invoices) {
    if (affectedInvoices.includes(inv.id)) {
      const extraTimesAdded = grouped[inv.id].length - 1;
      console.log(`Invoice ${inv.invoice_number} was added ${grouped[inv.id].length} times. Extra = ${extraTimesAdded}`);
      
      if (inv.status === 'Posted') {
        // Reduce the quantity by extraTimesAdded * line.quantity
        for (const line of inv.line_items) {
           const itemId = line.item_id;
           const qty = line.quantity;
           const extraQty = qty * extraTimesAdded;
           
           const { data: itemData } = await supabase.from('Item').select('id, quantity_on_hand').eq('id', itemId).single();
           if (itemData) {
              const newQty = Math.max(0, itemData.quantity_on_hand - extraQty);
              console.log(`Fixing item ${itemId} qty: ${itemData.quantity_on_hand} -> ${newQty}`);
              await supabase.from('Item').update({ quantity_on_hand: newQty }).eq('id', itemId);
           }
        }
      }
    }
  }

  console.log('Done fixing duplicates.');
}

run().catch(console.error);
