import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL || 'https://xkobauhvsayqcxmmmtkm.supabase.co';
const supabaseKey = process.env.VITE_SAJILO_APP_ID || 'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkType() {
    const { data } = await supabase.from('GeneralLedgerLine').select('journal_id').limit(1);
    console.log("Journal ID type in JS:", typeof data[0].journal_id, data[0].journal_id);
    
    // Test the exact failing query from get_sales_summary_rpc
    const test1 = await supabase.rpc('get_sales_summary_rpc', { p_company_id: null, p_from_date: null, p_to_date: null });
    console.log("sales error:", test1.error?.message);
}

checkType();
