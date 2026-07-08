import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Fetching companies...");
    const { data: companies, error: compErr } = await supabase.from('Company').select('id');
    if (compErr) { console.error(compErr); return; }

    for (const comp of companies) {
        const { data: godowns } = await supabase.from('Godown').select('id, name, is_main, godown_name').eq('company_id', comp.id);
        let main = godowns.find(g => g.is_main);
        if (!main) main = godowns.find(g => g.name === 'Main Location' || g.godown_name === 'Main Location');
        
        if (main) {
            console.log(`Updating for company ${comp.id}, Main Godown: ${main.id}`);
            
            // 1. Fetch ledgers that have no godown or different godown
            const { data: ledgers } = await supabase.from('InventoryLedger')
                .select('id, godown_id')
                .eq('company_id', comp.id);
                
            const ledgersToUpdate = ledgers.filter(l => l.godown_id !== main.id);
            
            if (ledgersToUpdate.length > 0) {
                console.log(`Found ${ledgersToUpdate.length} InventoryLedger records to update.`);
                for (const l of ledgersToUpdate) {
                    await supabase.from('InventoryLedger').update({ godown_id: main.id }).eq('id', l.id);
                }
            } else {
                console.log('No InventoryLedger records to update.');
            }

            // 2. Fetch Sales Invoices
            const { data: sales } = await supabase.from('SalesInvoice').select('id, godown_id').eq('company_id', comp.id);
            const salesToUpdate = sales.filter(s => s.godown_id !== main.id);
            for (const s of salesToUpdate) {
                await supabase.from('SalesInvoice').update({ godown_id: main.id }).eq('id', s.id);
            }

            // 3. Fetch Purchase Invoices
            const { data: purchases } = await supabase.from('PurchaseInvoice').select('id, godown_id').eq('company_id', comp.id);
            const purchToUpdate = purchases.filter(p => p.godown_id !== main.id);
            for (const p of purchToUpdate) {
                await supabase.from('PurchaseInvoice').update({ godown_id: main.id }).eq('id', p.id);
            }
            
            // 4. Any standalone CurrentStock missing godown?
            const { data: cstock } = await supabase.from('CurrentStock').select('id, godown_id, current_qty').eq('company_id', comp.id);
            const cstockNull = cstock.filter(c => c.godown_id === null || c.godown_id !== main.id);
            for (const c of cstockNull) {
                console.log(`Found stock in different godown: ID ${c.id}, Qty ${c.current_qty}`);
                const { error } = await supabase.from('CurrentStock').update({ godown_id: main.id }).eq('id', c.id);
                if (error) {
                    console.error(`Failed to update CurrentStock ${c.id}: ${error.message}`);
                }
            }
        } else {
            console.log(`No Main Location found for company ${comp.id}`);
        }
    }
    console.log("Done.");
}

run();
