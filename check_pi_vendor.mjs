import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: pi } = await supabase.from('PurchaseInvoice').select('*').eq('invoice_number', 'PI-2026-004').single();
  console.log(Object.keys(pi));
  console.log("vendor_id:", pi.vendor_id);
  if (pi.vendor_id) {
    const { data: supplier } = await supabase.from('BusinessPartner').select('*').eq('id', pi.vendor_id).single();
    console.log("Supplier payable_account_id:", supplier?.payable_account_id);
  }
}

run();
