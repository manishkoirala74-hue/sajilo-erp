const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://xkobauhvsayqcxmmmtkm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O';

async function check() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  
  console.log("Checking PI-2026-005...");
  const { data: inv } = await supabase.from('PurchaseInvoice').select('*').eq('invoice_number', 'PI-2026-005');
  console.log('Invoice length:', inv ? inv.length : 0);
  
  if (inv && inv.length > 0) {
    console.log('Invoice status:', inv[0].status);
    console.log('Line items:', JSON.stringify(inv[0].line_items, null, 2));
    
    for (const item of inv[0].line_items || []) {
      const { data: dbItem } = await supabase.from('Item').select('*').eq('id', item.item_id);
      console.log(`Item in DB for ${item.item_id}:`, JSON.stringify(dbItem, null, 2));
    }
  }
}
check();
