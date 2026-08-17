import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const { Client } = pg;

async function run() {
    const file = process.argv[2];
    if (!file) throw new Error("Please provide a SQL file path");
    
    const sql = fs.readFileSync(file, 'utf8');
    
    // Parse the connection string from Supabase URL (just a quick hack, or maybe there's a POSTGRES_URL in .env)
    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' 
    });

    try {
        await client.connect();
        const res = await client.query(sql);
        console.log(`Migration ${file} executed successfully!`);
        if (res.length) {
            res.forEach(r => {
                if (r.command === 'SELECT') console.dir(r.rows, { depth: null });
            });
        } else if (res.command === 'SELECT') {
            console.dir(res.rows, { depth: null });
        }
    } catch (e) {
        console.error("Migration failed:", e);
    } finally {
        await client.end();
    }
}

run();
