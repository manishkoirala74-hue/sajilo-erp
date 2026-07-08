import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SAJILO_APP_BASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const mappings = [
  { table: 'CompanySettings', col: 'gl_accounts_receivable_id' },
  { table: 'CompanySettings', col: 'gl_accounts_payable_id' },
  { table: 'CompanySettings', col: 'gl_default_inventory_account_id' },
  { table: 'CompanySettings', col: 'gl_default_cogs_account_id' },
  { table: 'CompanySettings', col: 'gl_default_sales_account_id' },
  { table: 'CompanySettings', col: 'gl_opening_equity_account_id' },
  { table: 'CompanySettings', col: 'gl_vat_payable_id' },
  { table: 'CompanySettings', col: 'gl_sales_return_account_id' },
  { table: 'CompanySettings', col: 'gl_purchase_return_account_id' },
  { table: 'Item', col: 'inventory_account_id' },
  { table: 'Item', col: 'purchase_account_id' },
  { table: 'Item', col: 'sales_account_id' },
  { table: 'BusinessPartner', col: 'receivable_account_id' },
  { table: 'BusinessPartner', col: 'payable_account_id' },
  { table: 'TaxType', col: 'gl_account_id' },
  { table: 'ChartOfAccount', col: 'parent_account_id' },
  { table: 'GeneralLedgerLine', col: 'account_id' }
];

async function run() {
  console.log("Starting Deduplication...");
  
  // 1. Find all system accounts
  const { data: coa, error } = await supabase.from('ChartOfAccount')
    .select('id, account_code, account_name, company_id, created_at')
    .eq('is_system_account', true)
    .order('created_at', { ascending: true });
    
  if (error) {
    console.error("Error fetching COA:", error);
    return;
  }
  
  // 2. Group by company_id + account_code
  const groups = {};
  for (const acc of coa) {
    const key = `${acc.company_id}-${acc.account_code}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(acc);
  }
  
  let mergedCount = 0;
  
  // 3. Process each group
  for (const [key, list] of Object.entries(groups)) {
    if (list.length > 1) {
      const primary = list[0]; // Oldest is primary
      const duplicates = list.slice(1);
      
      console.log(`Processing ${primary.account_code} for company ${primary.company_id}`);
      console.log(`  Primary: ${primary.id} | Duplicates: ${duplicates.length}`);
      
      for (const dup of duplicates) {
        // Update all foreign keys to point to primary concurrently
        const updatePromises = mappings.map(mapping => 
          supabase.from(mapping.table)
            .update({ [mapping.col]: primary.id })
            .eq(mapping.col, dup.id)
            .then(({ error: updErr }) => {
              if (updErr) console.error(`Error updating ${mapping.table}.${mapping.col}:`, updErr);
            })
        );
        await Promise.all(updatePromises);
        
        // Finally, delete the duplicate
        const { error: delErr } = await supabase.from('ChartOfAccount')
          .delete()
          .eq('id', dup.id);
          
        if (delErr) {
          console.error(`Failed to delete duplicate ${dup.id}:`, delErr);
        } else {
          mergedCount++;
          console.log(`  Merged and deleted duplicate: ${dup.id}`);
        }
      }
    }
  }
  
  console.log(`\nDeduplication complete. Successfully merged and deleted ${mergedCount} duplicate ledgers.`);
}

run();
