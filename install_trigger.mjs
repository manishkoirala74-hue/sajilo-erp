import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// Assuming the env contains something like DATABASE_URL or we can build it
// Let's check process.env
const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres'; 
// If VITE_SAJILO_APP_BASE_URL is Supabase, we don't have the direct DB URL unless it's in .env.local

console.log("Supabase URL:", process.env.VITE_SAJILO_APP_BASE_URL);
// But wait, there was a check_db_conn.js earlier that might have had the connection string.
