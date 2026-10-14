import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SAJILO_APP_ID;

const client = createClient(supabaseUrl, serviceKey);

const outputDir = path.resolve('scripts/benchmarks');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function measureRequest(name, fetchFn) {
  const t0 = performance.now();
  let payloadBytes = 0;
  let rowCount = 0;
  let success = false;
  let errorMsg = null;

  try {
    const res = await fetchFn();
    const dur = performance.now() - t0;
    const raw = JSON.stringify(res.data || res);
    payloadBytes = Buffer.byteLength(raw, 'utf8');
    rowCount = Array.isArray(res.data) ? res.data.length : (res.data ? 1 : 0);
    success = true;
    return { name, durationMs: parseFloat(dur.toFixed(2)), payloadBytes, rowCount, success };
  } catch (err) {
    const dur = performance.now() - t0;
    return { name, durationMs: parseFloat(dur.toFixed(2)), payloadBytes: 0, rowCount: 0, success: false, error: err.message };
  }
}

async function runBaseline() {
  console.log('=== Capturing Pre-Optimization Telemetry Baseline ===\n');

  const companyId = 'a10e6e72-13ca-46f0-82ba-5cd421da6e2d'; // Hanuman Workshop
  const metrics = [];

  // 1. Company Table (inspecting base64 payload)
  console.log('Measuring Company table fetch...');
  metrics.push(await measureRequest('Company.select(*)', async () => {
    return await client.from('Company').select('*');
  }));

  // 2. Auth context RPC
  console.log('Measuring get_user_auth_context RPC...');
  metrics.push(await measureRequest('RPC: get_user_auth_context', async () => {
    return await client.rpc('get_user_auth_context', { p_company_id: companyId });
  }));

  // 3. Individual Dashboard queries as currently executed
  console.log('Measuring current individual dashboard queries...');
  metrics.push(await measureRequest('DailyMetricsRollup.select', async () => {
    return await client.from('DailyMetricsRollup').select('*').eq('company_id', companyId).limit(180);
  }));

  metrics.push(await measureRequest('SalesInvoice.recent(5)', async () => {
    return await client.from('SalesInvoice').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(5);
  }));

  metrics.push(await measureRequest('PurchaseInvoice.recent(5)', async () => {
    return await client.from('PurchaseInvoice').select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(5);
  }));

  metrics.push(await measureRequest('FiscalYear.select', async () => {
    return await client.from('FiscalYear').select('*').eq('company_id', companyId);
  }));

  // 4. Master Data queries currently loaded in Items.jsx / SalesInvoices.jsx
  console.log('Measuring master data table queries...');
  metrics.push(await measureRequest('ItemCategory.list', async () => {
    return await client.from('ItemCategory').select('*').eq('company_id', companyId);
  }));

  metrics.push(await measureRequest('UnitOfMeasure.list', async () => {
    return await client.from('UnitOfMeasure').select('*').eq('company_id', companyId);
  }));

  metrics.push(await measureRequest('ChartOfAccount.list(500)', async () => {
    return await client.from('ChartOfAccount').select('*').eq('company_id', companyId).limit(500);
  }));

  metrics.push(await measureRequest('DiscountScheme.list', async () => {
    return await client.from('DiscountScheme').select('*').eq('company_id', companyId);
  }));

  metrics.push(await measureRequest('TaxType.list', async () => {
    return await client.from('TaxType').select('*').eq('company_id', companyId);
  }));

  metrics.push(await measureRequest('Godown.list', async () => {
    return await client.from('Godown').select('*').eq('company_id', companyId);
  }));

  metrics.push(await measureRequest('CompanySettings.list', async () => {
    return await client.from('CompanySettings').select('*').eq('company_id', companyId);
  }));

  const totalTime = metrics.reduce((sum, m) => sum + m.durationMs, 0);
  const totalBytes = metrics.reduce((sum, m) => sum + m.payloadBytes, 0);

  const baselineData = {
    capturedAt: new Date().toISOString(),
    companyId,
    totalWaterfallDurationMs: parseFloat(totalTime.toFixed(2)),
    totalPayloadBytes: totalBytes,
    totalPayloadKB: parseFloat((totalBytes / 1024).toFixed(2)),
    metrics
  };

  const outputPath = path.join(outputDir, 'baseline_metrics.json');
  fs.writeFileSync(outputPath, JSON.stringify(baselineData, null, 2), 'utf8');

  console.log('\n--- Telemetry Baseline Summary ---');
  console.log(`Total Cumulative Time: ${baselineData.totalWaterfallDurationMs} ms`);
  console.log(`Total Cumulative Payload: ${baselineData.totalPayloadKB} KB (${totalBytes} bytes)`);
  console.log(`Saved baseline snapshot to: ${outputPath}`);
}

runBaseline();
