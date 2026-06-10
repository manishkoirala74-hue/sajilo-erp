const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.VITE_SAJILO_APP_BASE_URL,
  process.env.VITE_SAJILO_APP_ID
);

async function run() {
  const { data: journals } = await supabase.from('GeneralLedgerJournal').select('*').ilike('description', '%SI-2026-001%');
  console.log('Journals for SI-2026-001:', journals.length);
  for (const j of journals) {
    console.log(`\nJournal ID: ${j.id} | Desc: ${j.description} | Status: ${j.status} | Balanced: ${j.is_balanced}`);
    const { data: lines } = await supabase.from('GeneralLedgerLine').select('*').eq('journal_id', j.id);
    for (const l of lines) {
      console.log(`  [${l.account_name}] DR: ${l.debit_amount} | CR: ${l.credit_amount} | ${l.description}`);
    }
  }
}
run().catch(console.error);
