import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing environment variables");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    try {
        const { data, error } = await supabase.rpc('get_sales_summary_rpc', {
            p_company_id: '00000000-0000-0000-0000-000000000000',
            p_from_date: '2026-01-01',
            p_to_date: '2026-12-31'
        });
        
        console.log("Sales Summary RPC result:");
        console.log("Data:", data);
        console.log("Error:", error);
        
        const { data: arData, error: arError } = await supabase.rpc('get_ar_aging_rpc', {
            p_company_id: '00000000-0000-0000-0000-000000000000'
        });
        
        console.log("\nAR Aging RPC result:");
        console.log("Data:", arData);
        console.log("Error:", arError);

    } catch (e) {
        console.error("Caught error:", e);
    }
}

run();
