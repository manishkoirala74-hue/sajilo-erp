import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixInvoice() {
  console.log('--- Reverting SI-2026-005 to Draft ---');
  const { data, error } = await supabase
    .from('SalesInvoice')
    .update({ status: 'Draft' })
    .eq('invoice_number', 'SI-2026-005');
  
  if (error) {
    console.error('Error fixing invoice:', error);
  } else {
    console.log('Successfully reverted SI-2026-005 to Draft.');
  }
}
fixInvoice();
