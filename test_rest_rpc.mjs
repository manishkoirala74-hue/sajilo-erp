import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
  const anonKey = process.env.VITE_SAJILO_APP_ID;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  const supabase = createClient(supabaseUrl, serviceKey);
  
  const companyId = '8acefe6e-fc5c-4951-b719-decf990d8b24';
  
  const { data, error } = await supabase.rpc('current_user_has_company_permission', {
    p_company_id: companyId,
    p_permission_key: 'users.edit'
  });
  
  console.log('Data:', data);
  console.log('Error:', error);
}
run();
