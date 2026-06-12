import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xkobauhvsayqcxmmmtkm.supabase.co',
  'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O'
);

async function run() {
  const { data: journals, error } = await supabase
    .from('GeneralLedgerJournal')
    .select('id, source_document_type, source_document_id, created_at, entry_date');

  if (error) {
    console.error("Error fetching journals:", error);
    return;
  }

  console.log(`Found ${journals.length} journals in total.`);

  const piJournals = journals.filter(j => j.source_document_type === 'PurchaseInvoice');
  console.log(`Found ${piJournals.length} journals for PurchaseInvoice.`);

  const counts = {};
  for (const j of piJournals) {
    counts[j.source_document_id] = (counts[j.source_document_id] || 0) + 1;
  }
  
  for (const [docId, c] of Object.entries(counts)) {
    console.log(`Doc ID ${docId}: ${c} journals`);
  }

}

run().catch(console.error);
