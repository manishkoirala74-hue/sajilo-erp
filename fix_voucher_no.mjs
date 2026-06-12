import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xkobauhvsayqcxmmmtkm.supabase.co';
const supabaseKey = 'sb_publishable_lTJaRl_5d13X3jbFUElwHA_VpTwhq5O';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: journals, error } = await supabase
    .from('GeneralLedgerJournal')
    .select('id, source_document_id, source_document_type, voucher_no');

  if (error) {
    console.error('Error fetching journals:', error);
    return;
  }

  let count = 0;
  for (const j of journals) {
    // Check if voucher_no looks like a UUID (36 chars with hyphens)
    const isUUID = j.voucher_no && j.voucher_no.length === 36 && j.voucher_no.split('-').length === 5;
    
    if (isUUID || !j.voucher_no) {
      let voucherNo = null;
      if (j.source_document_type === 'PurchaseInvoice') {
        const { data } = await supabase.from('PurchaseInvoice').select('invoice_number').eq('id', j.source_document_id).single();
        if (data) voucherNo = data.invoice_number;
      } else if (j.source_document_type === 'SalesInvoice') {
        const { data } = await supabase.from('SalesInvoice').select('invoice_number').eq('id', j.source_document_id).single();
        if (data) voucherNo = data.invoice_number;
      } else if (j.source_document_type === 'POSSale') {
        const { data } = await supabase.from('POSSale').select('sale_number').eq('id', j.source_document_id).single();
        if (data) voucherNo = data.sale_number;
      } else if (j.source_document_type === 'FinancialVoucher') {
        const { data } = await supabase.from('FinancialVoucher').select('voucher_number').eq('id', j.source_document_id).single();
        if (data) voucherNo = data.voucher_number;
      } else if (j.source_document_type === 'StockAdjustment') {
        const { data } = await supabase.from('StockAdjustment').select('reference_number').eq('id', j.source_document_id).single();
        if (data) voucherNo = data.reference_number;
      } else if (j.source_document_type === 'SalesReturn') {
        const { data } = await supabase.from('SalesReturn').select('return_number').eq('id', j.source_document_id).single();
        if (data) voucherNo = data.return_number;
      }

      if (voucherNo) {
        console.log(`Fixing journal ${j.id}: ${j.voucher_no} -> ${voucherNo}`);
        await supabase.from('GeneralLedgerJournal').update({ voucher_no: voucherNo }).eq('id', j.id);
        count++;
      }
    }
  }

  console.log(`Fixed ${count} journals.`);
}

run();
