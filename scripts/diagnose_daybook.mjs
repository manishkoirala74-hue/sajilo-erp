import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const companyId = '198c7d56-84fd-46fb-9c6a-212d9cf428ce'; // Brother Home Decor

const sb = createClient(supabaseUrl, serviceKey);

async function checkDayBook() {
  console.log('=== Checking General Ledger for 2026-10-09 ===');
  
  const { data: journals, error: jErr } = await sb
    .from('GeneralLedgerJournal')
    .select(`
      id,
      voucher_no,
      entry_date,
      status,
      is_reversed,
      source_document_id,
      source_document_type,
      description,
      total_debit,
      total_credit,
      GeneralLedgerLine (
        id,
        account_id,
        debit_amount,
        credit_amount,
        description,
        ChartOfAccount (
          id,
          account_name,
          account_type,
          is_cash_account,
          is_bank_account
        )
      )
    `)
    .eq('company_id', companyId)
    .gte('entry_date', '2026-10-09T00:00:00+00:00')
    .lt('entry_date', '2026-10-10T00:00:00+00:00');

  if (jErr) {
    console.error('Error fetching journals:', jErr);
    return;
  }

  console.log(`Found ${journals.length} journals on 2026-10-09:`);
  for (const j of journals) {
    console.log(`\nJournal ID: ${j.id}`);
    console.log(`Voucher No: ${j.voucher_no} | Status: ${j.status} | is_reversed: ${j.is_reversed}`);
    console.log(`Description: ${j.description}`);
    console.log(`Source Doc: ${j.source_document_type} (ID: ${j.source_document_id})`);

    // Check source voucher status if FinancialVoucher
    if (j.source_document_type === 'FinancialVoucher' && j.source_document_id) {
      const { data: v } = await sb.from('FinancialVoucher').select('id, voucher_number, status, narration').eq('id', j.source_document_id).single();
      console.log(`-> Source FinancialVoucher: ${v?.voucher_number} | Status: ${v?.status} | Narration: ${v?.narration}`);
    }

    for (const l of j.GeneralLedgerLine || []) {
      console.log(`   Line: ${l.ChartOfAccount?.account_name} | Dr: ${l.debit_amount} | Cr: ${l.credit_amount} | Cash: ${l.ChartOfAccount?.is_cash_account}`);
    }
  }
}

checkDayBook();
