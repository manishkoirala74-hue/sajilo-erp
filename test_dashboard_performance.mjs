import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { performance } from 'perf_hooks';

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SAJILO_APP_ID;

const client = createClient(supabaseUrl, serviceKey);

const companyId = 'a10e6e72-13ca-46f0-82ba-5cd421da6e2d'; // Hanuman Workshop

async function timeQuery(name, fn) {
  const t0 = performance.now();
  try {
    const res = await fn();
    const dur = (performance.now() - t0).toFixed(2);
    console.log(`[PASS] ${name.padEnd(35)} : ${dur} ms`);
    return { name, duration: dur, success: true, data: res };
  } catch (err) {
    const dur = (performance.now() - t0).toFixed(2);
    console.log(`[FAIL] ${name.padEnd(35)} : ${dur} ms -> ${err.message}`);
    return { name, duration: dur, success: false, error: err.message };
  }
}

async function runBenchmark() {
  console.log(`=== Benchmarking Dashboard Queries for Company: ${companyId} ===\n`);

  await timeQuery('get_user_auth_context (RPC)', async () => {
    const { data, error } = await client.rpc('get_user_auth_context', { p_company_id: companyId });
    if (error) throw error;
    return data;
  });

  await timeQuery('get_dashboard_summary (RPC)', async () => {
    const { data, error } = await client.rpc('get_dashboard_summary', {
      p_company_id: companyId,
      p_start_date: '2026-04-01',
      p_end_date: '2026-10-14'
    });
    if (error) throw error;
    return data;
  });

  await timeQuery('get_cash_bank_balance (RPC)', async () => {
    const { data, error } = await client.rpc('get_cash_bank_balance', {
      p_company_id: companyId,
      p_as_of_date: '2026-10-14'
    });
    if (error) throw error;
    return data;
  });

  await timeQuery('DailyMetricsRollup select', async () => {
    const { data, error } = await client.from('DailyMetricsRollup')
      .select('*')
      .eq('company_id', companyId)
      .gte('metric_date', '2026-04-01')
      .lte('metric_date', '2026-10-14')
      .order('metric_date', { ascending: false });
    if (error) throw error;
    return data;
  });

  await timeQuery('Recent SalesInvoice select (5)', async () => {
    const { data, error } = await client.from('SalesInvoice')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    return data;
  });

  await timeQuery('Recent PurchaseInvoice select (5)', async () => {
    const { data, error } = await client.from('PurchaseInvoice')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) throw error;
    return data;
  });

  await timeQuery('FiscalYear select', async () => {
    const { data, error } = await client.from('FiscalYear')
      .select('*')
      .eq('company_id', companyId)
      .order('start_date', { ascending: false });
    if (error) throw error;
    return data;
  });

  await timeQuery('Items select (1000)', async () => {
    const { data, error } = await client.from('Item')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    return data;
  });

  await timeQuery('BusinessPartner select (1000)', async () => {
    const { data, error } = await client.from('BusinessPartner')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    return data;
  });

  await timeQuery('FinancialVoucher select (50)', async () => {
    const { data, error } = await client.from('FinancialVoucher')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return data;
  });

  console.log('\n=== Benchmark Finished ===');
}

runBenchmark();
