import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
  const anonKey = process.env.VITE_SAJILO_APP_ID;
  
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/current_user_has_company_permission`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'params=single-object'
    },
    body: JSON.stringify({
      p_company_id: '8acefe6e-fc5c-4951-b719-decf990d8b24',
      p_permission_key: 'users.edit'
    })
  });
  
  console.log('Status:', res.status);
  console.log('Body:', await res.text());
}
run();
