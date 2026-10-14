import dns from 'dns/promises';
import { performance } from 'perf_hooks';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const anonKey = process.env.VITE_SAJILO_APP_ID;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('=== Sajilo ERP Database & Connection Diagnostics ===\n');
console.log('Target Supabase URL:', supabaseUrl);

async function runDiagnostics() {
  const host = new URL(supabaseUrl).hostname;

  // 1. DNS Resolution Test
  console.log('\n--- 1. DNS Resolution ---');
  try {
    const t0 = performance.now();
    const addresses = await dns.resolve4(host);
    const dnsTime = (performance.now() - t0).toFixed(2);
    console.log(`DNS Lookup for ${host}: ${addresses.join(', ')} (${dnsTime} ms)`);
  } catch (err) {
    console.error('DNS Lookup failed:', err.message);
  }

  // 2. HTTPS Ping / Health Endpoint Latency
  console.log('\n--- 2. REST & Auth Health Endpoint Latency ---');
  for (let i = 1; i <= 3; i++) {
    const t0 = performance.now();
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
        headers: { apikey: anonKey }
      });
      const dur = (performance.now() - t0).toFixed(2);
      console.log(`Ping #${i} to /auth/v1/health: HTTP ${res.status} (${dur} ms)`);
    } catch (err) {
      console.error(`Ping #${i} failed:`, err.message);
    }
  }

  // 3. Supabase Client Query Latencies (Anon Key)
  console.log('\n--- 3. Client REST Queries (with Anon Key) ---');
  const client = createClient(supabaseUrl, anonKey);

  const tablesToTest = ['Company', 'User', 'FiscalYear', 'Item', 'SalesInvoice', 'FinancialVoucher'];
  for (const table of tablesToTest) {
    const t0 = performance.now();
    try {
      const { data, count, error } = await client
        .from(table)
        .select('*', { count: 'exact', head: true });
      const dur = (performance.now() - t0).toFixed(2);
      if (error) {
        console.log(`Table '${table}' query: ERROR (${dur} ms) -> ${error.message} (code: ${error.code})`);
      } else {
        console.log(`Table '${table}' query: SUCCESS (${dur} ms) -> Count: ${count}`);
      }
    } catch (err) {
      console.error(`Table '${table}' failed:`, err.message);
    }
  }

  // 4. Supabase Client Query with Service Role Key (Database direct check)
  console.log('\n--- 4. Service Role Queries (Table Counts & Latency) ---');
  const adminClient = createClient(supabaseUrl, serviceKey);
  for (const table of ['Company', 'User', 'Item', 'Account', 'FinancialVoucher', 'GeneralLedger', 'AuditLog']) {
    const t0 = performance.now();
    try {
      const { data, count, error } = await adminClient
        .from(table)
        .select('*', { count: 'exact', head: true });
      const dur = (performance.now() - t0).toFixed(2);
      if (error) {
        console.log(`Table '${table}': ERROR (${dur} ms) -> ${error.message}`);
      } else {
        console.log(`Table '${table}': SUCCESS (${dur} ms) -> Rows count: ${count}`);
      }
    } catch (err) {
      console.error(`Table '${table}' failed:`, err.message);
    }
  }

  // 5. Test Sample Fetch Data Rows
  console.log('\n--- 5. Data Fetch Latency (Actual Data Retrieval) ---');
  try {
    const t0 = performance.now();
    const { data: companies, error } = await adminClient.from('Company').select('id, name, created_at').limit(5);
    const dur = (performance.now() - t0).toFixed(2);
    if (error) {
      console.log(`Fetch companies error:`, error.message);
    } else {
      console.log(`Fetched ${companies.length} companies in ${dur} ms:`);
      companies.forEach(c => console.log(`  - [${c.id}] ${c.name}`));
    }
  } catch (err) {
    console.error('Fetch companies exception:', err.message);
  }

  console.log('\n=== Diagnostics Complete ===');
}

runDiagnostics();
