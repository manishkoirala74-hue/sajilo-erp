import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: ledgers } = await supabase.from('InventoryLedger').select('company_id, item_id').limit(1);
  if (!ledgers || ledgers.length === 0) {
    console.log('No inventory ledger entries found across all companies.');
    return;
  }
  const companyId = ledgers[0].company_id;
  const itemId = ledgers[0].item_id;

  console.log(`Testing RPC for Company: ${companyId}, Item: ${itemId}`);

  const { data, error } = await supabase.rpc('get_stock_ledger_statement_rpc', {
    p_company_id: companyId,
    p_item_id: itemId,
    p_from_date: '2020-01-01',
    p_to_date: '2026-12-31'
  });

  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log(`RPC returned ${data?.length} rows.`);
    if (data?.length > 0) {
      console.log('First row:', data[0]);
    }
  }
}
run();
