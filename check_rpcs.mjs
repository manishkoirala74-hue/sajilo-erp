import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL || 'https://xkobauhvsayqcxmmmtkm.supabase.co';
const supabaseKey = process.env.VITE_SAJILO_APP_ID || 'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    const { data: sales, error: salesErr } = await supabase.rpc('get_sales_summary_rpc', { p_company_id: null, p_from_date: null, p_to_date: null });
    console.log("get_sales_summary_rpc:", salesErr ? salesErr.message : "Success");
    
    const { data: ap, error: apErr } = await supabase.rpc('get_ap_aging_rpc', { p_company_id: null });
    console.log("get_ap_aging_rpc:", apErr ? apErr.message : "Success");
    
    const { data: ar, error: arErr } = await supabase.rpc('get_ar_aging_rpc', { p_company_id: null });
    console.log("get_ar_aging_rpc:", arErr ? arErr.message : "Success");

    const { data: pur, error: purErr } = await supabase.rpc('get_purchase_summary_rpc', { p_company_id: null, p_from_date: null, p_to_date: null });
    console.log("get_purchase_summary_rpc:", purErr ? purErr.message : "Success");
}

checkSchema();
