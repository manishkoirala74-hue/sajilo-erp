import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function patch() {
  console.log("Patching SI-2026-003...");

  const { data: si } = await supabase.from('SalesInvoice').select('*').eq('invoice_number', 'SI-2026-003').single();
  const { data: item } = await supabase.from('Item').select('id').eq('item_name', 'Motorcycle Apache 160 CC Blue').single();

  if (!si || !item) return console.log("Missing SI or Item");

  const newLineItems = si.line_items.map(line => {
    if (line.item_id === item.id) {
      return { ...line, cost_at_sale: 75000 };
    }
    return line;
  });

  const { error } = await supabase.from('SalesInvoice').update({ line_items: newLineItems }).eq('id', si.id);
  
  if (error) {
    console.error("Failed to patch SalesInvoice:", error);
  } else {
    console.log("Successfully patched SI-2026-003 with cost_at_sale = 75000.");
  }
}

patch();
