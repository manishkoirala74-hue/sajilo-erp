import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: cogs } = await supabase.from('ChartOfAccount').select('*').eq('account_type', 'Cost of Sales').limit(1).single();
  const { data: equity } = await supabase.from('ChartOfAccount').select('*').eq('account_type', 'Equity').limit(1).single();
  
  console.log("COGS Account:", cogs?.account_name, cogs?.id);
  console.log("Equity Account:", equity?.account_name, equity?.id);
  
  if (!cogs || !equity) {
    console.log("Missing accounts!");
    return;
  }
  
  const company_id = cogs.company_id;
  
  // Create Journal
  const journalId = crypto.randomUUID();
  const { error: jErr } = await supabase.from('GeneralLedgerJournal').insert({
    id: journalId,
    company_id: company_id,
    journal_date: new Date().toISOString().split('T')[0],
    description: 'AJE: Historical COGS Reconciliation',
    module: 'Inventory',
    source_type: 'Manual',
    voucher_no: 'AJE-COGS-001',
    is_posted: true
  });
  if (jErr) {
    console.error("Journal Error:", jErr);
    return;
  }
  
  // Create Lines
  const gap = 110500;
  
  const { error: lErr } = await supabase.from('GeneralLedgerLine').insert([
    {
      company_id: company_id,
      journal_id: journalId,
      account_id: cogs.id,
      debit_amount: gap,
      credit_amount: 0,
      description: 'AJE: Historical COGS Adjustment'
    },
    {
      company_id: company_id,
      journal_id: journalId,
      account_id: equity.id,
      debit_amount: 0,
      credit_amount: gap,
      description: 'AJE: Historical COGS Adjustment'
    }
  ]);
  
  if (lErr) console.error("Lines Error:", lErr);
  else console.log("AJE Posted Successfully!");
}
run();
