import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const client = new Client({ connectionString: process.env.VITE_SUPABASE_DB_URL || 'postgresql://postgres:postgres@localhost:5432/postgres' });
await client.connect();

const { rows } = await client.query(`
SELECT i.item_name, i.quantity_on_hand, il.transaction_type, il.quantity_in, il.quantity_out 
FROM "Item" i 
LEFT JOIN "InventoryLedger" il ON i.id = il.item_id 
WHERE i.item_name LIKE '%Motorcycle%'
`);
console.log(rows);
await client.end();
