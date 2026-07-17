import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).reduce((acc, line) => {
  const [key, ...val] = line.split('=');
  if (key && val.length) acc[key.trim()] = val.join('=').trim().replace(/['"]/g, '');
  return acc;
}, {});

const supabase = createClient(env.VITE_SAJILO_APP_BASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SAJILO_APP_ID);

async function run() {
  // Find all Sales Invoice journals
  const { data: journals } = await supabase.from('GeneralLedgerJournal').select('id, source_document_id').eq('source_document_type', 'SalesInvoice');
  
  // Find COGS and Inv accounts
  const { data: accounts } = await supabase.from('ChartOfAccount').select('id, account_category, account_code').in('account_code', ['5100', '5000', '1140']);
  const cogsAccountIds = accounts.filter(a => a.account_code === '5100' || a.account_code === '5000').map(a => a.id);
  const invAccountIds = accounts.filter(a => a.account_code === '1140').map(a => a.id);
  
  // Look at lines before delete
  const { data: linesBefore } = await supabase.from('GeneralLedgerLine').select('*').in('journal_id', journals.map(j => j.id)).in('account_id', [...cogsAccountIds, ...invAccountIds]);
  console.log('Lines to delete:', linesBefore.length);



}

run();
