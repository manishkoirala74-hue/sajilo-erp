import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const companyId = '198c7d56-84fd-46fb-9c6a-212d9cf428ce'; // Brother Home Decor

const sb = createClient(supabaseUrl, serviceKey);

async function runRemediation() {
  console.log('=== Brother Home Decor Voucher Data Remediation ===\n');

  // 1. Fetch all vouchers for Brother Home Decor matching 00132 and 00128
  const { data: vouchers, error: vErr } = await sb.from('FinancialVoucher')
    .select('id, voucher_number, voucher_type, total_amount, status, narration')
    .eq('company_id', companyId)
    .or('voucher_number.ilike.%00132%,voucher_number.ilike.%00128%')
    .order('created_at', { ascending: true });

  if (vErr) {
    console.error('Error fetching vouchers:', vErr);
    return;
  }

  console.log(`Found ${vouchers.length} target vouchers to normalize.`);
  const voucherIds = vouchers.map(v => v.id);

  // 2. Normalize root original vouchers
  const rootVouchers = vouchers.filter(v => 
    v.voucher_number === 'PV-FS 2083.084-00132' || v.voucher_number === 'PV-FS 2083.084-00128'
  );
  for (const root of rootVouchers) {
    const { error: upErr } = await sb.from('FinancialVoucher').update({
      status: 'Cancelled',
      narration: `${root.narration || ''} [Cancelled via administrative normalization]`.trim()
    }).eq('id', root.id);
    if (upErr) console.error(`Error updating root voucher ${root.voucher_number}:`, upErr);
    else console.log(`✓ Normalized root voucher: ${root.voucher_number} -> Cancelled`);
  }

  // 3. Retire synthetic chained REV-% vouchers
  const syntheticVouchers = vouchers.filter(v => v.voucher_number.startsWith('REV-'));
  for (const syn of syntheticVouchers) {
    const cleanNarration = (syn.narration || '').includes('[Retired synthetic reversal duplicate]')
      ? syn.narration
      : `${syn.narration || ''} [Retired synthetic reversal duplicate]`.trim();

    const { error: synErr } = await sb.from('FinancialVoucher').update({
      status: 'Cancelled',
      narration: cleanNarration
    }).eq('id', syn.id);
    if (synErr) console.error(`Error updating synthetic voucher ${syn.voucher_number}:`, synErr);
    else console.log(`✓ Retired synthetic voucher: ${syn.voucher_number} -> Cancelled`);
  }

  // 4. Robust General Ledger Journal Reconciliation
  // Query all journals by source_document_id, voucher_no, and description
  const { data: journals, error: jErr } = await sb.from('GeneralLedgerJournal')
    .select('id, voucher_no, description, is_reversed')
    .eq('company_id', companyId)
    .or(`source_document_id.in.(${voucherIds.join(',')}),voucher_no.ilike.%00132%,voucher_no.ilike.%00128%,description.ilike.%00132%,description.ilike.%00128%`);

  if (jErr) {
    console.error('Error fetching GL journals:', jErr);
  } else {
    console.log(`\nFound ${journals.length} associated GL journals.`);
    const unflagged = journals.filter(j => !j.is_reversed);
    if (unflagged.length > 0) {
      const { error: jUpErr } = await sb.from('GeneralLedgerJournal')
        .update({ is_reversed: true })
        .in('id', unflagged.map(j => j.id));
      if (jUpErr) console.error('Error updating GL journals:', jUpErr);
      else console.log(`✓ Flagged ${unflagged.length} GL journals with is_reversed = true.`);
    } else {
      console.log('✓ All associated GL journals already flagged as is_reversed = true.');
    }
  }

  // 5. Assert ChartOfAccount balances
  console.log('\n--- Account Balance Verification (Brother Home Decor) ---');
  const { data: accounts, error: aErr } = await sb.from('ChartOfAccount')
    .select('account_code, account_name, account_type, current_balance')
    .eq('company_id', companyId)
    .in('account_code', ['1110', '5320']);

  if (aErr) {
    console.error('Error fetching accounts:', aErr);
  } else {
    console.table(accounts);
  }

  // 6. Final verification of active vouchers in Brother Home Decor
  const { data: activeVouchers } = await sb.from('FinancialVoucher')
    .select('voucher_number, total_amount, status')
    .eq('company_id', companyId)
    .eq('status', 'Posted')
    .or('voucher_number.ilike.%00132%,voucher_number.ilike.%00128%');

  console.log('\nActive (Posted) vouchers matching 00132 or 00128:', activeVouchers?.length || 0);
  if (activeVouchers?.length === 0) {
    console.log('🎉 SUCCESS: Zero orphan/synthetic vouchers remain in Posted status!');
  } else {
    console.warn('⚠️ WARNING: Some vouchers still marked as Posted:', activeVouchers);
  }
}

runRemediation().catch(console.error);
