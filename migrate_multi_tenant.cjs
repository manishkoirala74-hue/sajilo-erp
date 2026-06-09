const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
// Needs service role key to bypass RLS for migration
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SAJILO_APP_ID; 

const supabase = createClient(supabaseUrl, supabaseKey);

const entitiesDir = path.join(__dirname, 'sajilo', 'entities');

async function migrate() {
  console.log("Starting multi-tenant migration...");

  // 1. Get or create default company
  let { data: company, error: companyErr } = await supabase.from('Company').select('id, name').limit(1).single();
  
  if (!company) {
    console.log("No company found, creating 'Default Company'...");
    const { data: newCompany, error: insertErr } = await supabase
      .from('Company')
      .insert({ name: 'Default Company' })
      .select('id, name')
      .single();
    
    if (insertErr) {
      console.error("Failed to create default company:", insertErr);
      return;
    }
    company = newCompany;
  }
  
  console.log(`Using company: ${company.name} (${company.id})`);

  // 2. Assign all existing users to this company
  const { data: users, error: usersErr } = await supabase.from('User').select('id');
  if (usersErr) {
    console.error("Failed to fetch users:", usersErr);
  } else if (users && users.length > 0) {
    for (const u of users) {
      const { data: existingUc } = await supabase.from('UserCompany').select('id').eq('user_id', u.id).eq('company_id', company.id).single();
      if (!existingUc) {
         await supabase.from('UserCompany').insert({
           user_id: u.id,
           company_id: company.id,
           is_default: true
         });
      }
    }
    console.log(`Assigned ${users.length} users to the default company.`);
  }

  // 3. Update all tables with the company_id
  const files = fs.readdirSync(entitiesDir).filter(f => f.endsWith('.jsonc'));
  const globalTables = ['User', 'Company', 'UserCompany'];
  
  for (const file of files) {
    const tableName = file.replace('.jsonc', '');
    if (globalTables.includes(tableName)) continue;
    
    console.log(`Updating table: ${tableName}`);
    const { error: updateErr } = await supabase
      .from(tableName)
      .update({ company_id: company.id })
      .is('company_id', null);
      
    if (updateErr) {
      console.error(`Error updating ${tableName}:`, updateErr.message);
    } else {
      console.log(`Successfully updated ${tableName}`);
    }
  }

  console.log("Migration complete!");
}

migrate();
