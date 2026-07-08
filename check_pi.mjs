import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Checking PI-2026-004...");
  const { data: pi } = await supabase.from('PurchaseInvoice').select('*').eq('invoice_number', 'PI-2026-004').single();
  if (!pi) {
    console.log("PI not found");
    return;
  }
  console.log("PI supplier_id:", pi.supplier_id);
  
  if (pi.supplier_id) {
    const { data: supplier } = await supabase.from('BusinessPartner').select('*').eq('id', pi.supplier_id).single();
    console.log("Supplier payable_account_id:", supplier?.payable_account_id);
  }

  const { data: cSettings } = await supabase.from('CompanySettings').select('gl_accounts_payable_id, gl_accounts_receivable_id').eq('company_id', pi.company_id).single();
  console.log("Company Settings:", cSettings);
  
  console.log("PI line items:", pi.line_items);
}

run();
