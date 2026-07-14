import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('SalesInvoice').select('*').ilike('invoice_number', '%006%');
  console.log('Invoice in DB:', data, error);
  
  const { data: glData } = await supabase.from('GeneralLedgerJournal').select('*').ilike('reference_no', '%006%');
  console.log('GL Journals in DB:', glData);
}
test();
