import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: pi } = await supabase.from('PurchaseInvoice').select('invoice_date, created_at').eq('invoice_number', 'PI-2026-004').single();
  console.log("PI-2026-004 Date:", pi?.invoice_date, "Created:", pi?.created_at);

  const { data: si } = await supabase.from('SalesInvoice').select('invoice_date, created_at').eq('invoice_number', 'SI-2026-001-D5').single();
  console.log("SI-2026-001-D5 Date:", si?.invoice_date, "Created:", si?.created_at);

  const { data: item } = await supabase.from('Item').select('wac_unit_cost').ilike('item_name', '%Motorcycle FZ V3 Gray%').single();
  console.log("Current Item WAC:", item?.wac_unit_cost);
}
run();
