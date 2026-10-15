import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SAJILO_APP_BASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const companyId = '198c7d56-84fd-46fb-9c6a-212d9cf428ce'; // Brother Home Decor

const sb = createClient(supabaseUrl, serviceKey);

async function runFullRemediation() {
  console.log('=== Brother Home Decor: Complete Voucher & GL Remediation ===\n');

  // 1. Fetch all vouchers for Brother Home Decor
  const { data: allVouchers, error: vErr } = await sb
    .from('FinancialVoucher')
    .select('id, voucher_number, voucher_type, voucher_date, status, narration, total_amount')
    .eq('company_id', companyId);

  if (vErr) {
    console.error('Error fetching vouchers:', vErr);
    return;
  }

  // Identify cancelled root vouchers and all synthetic REV-% vouchers
  const cancelledRootVouchers = allVouchers.filter(v => v.status === 'Cancelled' && !v.voucher_number.startsWith('REV-'));
  const allSyntheticRevVouchers = allVouchers.filter(v => v.voucher_number.startsWith('REV-'));
  const activeSyntheticRevVouchers = allSyntheticRevVouchers.filter(v => v.status !== 'Cancelled');

  console.log(`Total vouchers in company: ${allVouchers.length}`);
  console.log(`Cancelled root vouchers: ${cancelledRootVouchers.length}`);
  console.log(`Total synthetic REV-% vouchers: ${allSyntheticRevVouchers.length}`);
  console.log(`Still-active (Posted) synthetic REV-% vouchers: ${activeSyntheticRevVouchers.length}`);

  // 2. Mark any active synthetic REV-% vouchers as Cancelled
  if (activeSyntheticRevVouchers.length > 0) {
    console.log(`\nRetiring ${activeSyntheticRevVouchers.length} active synthetic REV-% vouchers...`);
    for (const syn of activeSyntheticRevVouchers) {
      const cleanNarration = (syn.narration || '').includes('[Retired synthetic reversal duplicate]')
        ? syn.narration
        : `${syn.narration || ''} [Retired synthetic reversal duplicate]`.trim();

      await sb.from('FinancialVoucher')
        .update({
          status: 'Cancelled',
          narration: cleanNarration
        })
        .eq('id', syn.id);
      console.log(`  ✓ Retired: ${syn.voucher_number} -> Cancelled`);
    }
  }

  // 3. Collect all voucher IDs that are Cancelled (both roots and synthetic)
  const allTargetVoucherIds = [
    ...cancelledRootVouchers.map(v => v.id),
    ...allSyntheticRevVouchers.map(v => v.id)
  ];
  const targetVoucherNumbers = [
    ...cancelledRootVouchers.map(v => v.voucher_number),
    ...allSyntheticRevVouchers.map(v => v.voucher_number)
  ];

  console.log(`\nTotal Cancelled/Retired voucher IDs to synchronize in GL: ${allTargetVoucherIds.length}`);

  // 4. Find all GeneralLedgerJournal rows linked to these vouchers
  const { data: linkedJournals, error: jErr } = await sb
    .from('GeneralLedgerJournal')
    .select('id, voucher_no, entry_date, status, is_reversed, source_document_id, description')
    .eq('company_id', companyId);

  if (jErr) {
    console.error('Error fetching journals:', jErr);
    return;
  }

  const journalsToCancel = linkedJournals.filter(j => {
    // Linked directly by source_document_id
    if (j.source_document_id && allTargetVoucherIds.includes(j.source_document_id)) return true;
    // Linked by voucher_no matching target vouchers
    if (j.voucher_no && targetVoucherNumbers.some(vn => j.voucher_no === vn || j.voucher_no.includes(vn))) return true;
    // Linked by description mentioning any target root vouchers
    if (cancelledRootVouchers.some(rv => j.description && j.description.includes(rv.voucher_number))) return true;
    return false;
  });

  console.log(`Found ${journalsToCancel.length} GL journals matching cancelled/retired vouchers.`);

  const uncancelledJournals = journalsToCancel.filter(j => j.status !== 'Cancelled' || !j.is_reversed);
  console.log(`Journals needing status normalization: ${uncancelledJournals.length}`);

  for (const j of uncancelledJournals) {
    const { error: upErr } = await sb.from('GeneralLedgerJournal')
      .update({
        status: 'Cancelled',
        is_reversed: true
      })
      .eq('id', j.id);

    if (upErr) {
      console.error(`  Error updating journal ${j.id} (${j.voucher_no}):`, upErr);
    } else {
      console.log(`  ✓ GL Journal Normalized: ${j.voucher_no || j.id} (${j.entry_date?.substring(0, 10)}) -> Status: Cancelled, is_reversed: true`);
    }
  }

  // 5. Assert ChartOfAccount balances
  console.log('\n--- Account Balances Verification (Brother Home Decor) ---');
  const { data: accounts } = await sb.from('ChartOfAccount')
    .select('account_code, account_name, account_type, current_balance')
    .eq('company_id', companyId)
    .in('account_code', ['1110', '5320', '1010']);
  console.table(accounts);

  console.log('\n=== Remediation Complete ===');
}

runFullRemediation().catch(console.error);
