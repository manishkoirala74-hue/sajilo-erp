/**
 * GL Posting Service — Sajilo ERP
 * Central double-entry journal posting for all transactional modules.
 * Now fully refactored to use atomic PostgreSQL RPCs and server-side account resolution.
 */

import { supabase, sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';

function handleDBError(error) {
  if (!error) return;
  if (error.message && error.message.includes('ERR_GROUP_LEDGER_POSTING')) {
    toast.error('Posting Blocked: Attempting to post to a Group Ledger. Use Sub Ledgers only.', { duration: 8000 });
  } else if (error.message && error.message.includes('ERR_STRICT_ACCOUNT_MAPPING')) {
    toast.error('Posting Aborted: Missing required control account mapping.', { duration: 8000 });
  } else {
    toast.error('GL Posting Failed: ' + (error.message || 'Unknown database error'), { duration: 8000 });
  }
  throw error;
}

// ─── Immutable Reversal Utility ──────────────────────────────────────────────
export async function reverseJournal(journalId, reversalDate, reason) {
  const { data, error } = await supabase.rpc('rpc_reverse_gl_transaction', {
    p_company_id: sajilo.getCompanyId(),
    p_original_journal_id: journalId,
    p_reversal_date: reversalDate || new Date().toISOString().slice(0, 10),
    p_reason: reason || 'Cancelled'
  });
  if (error) handleDBError(error);
  return data;
}

// ─── 1. POS SALE ──────────────────────────────────────────────────────────
export async function postPOSSale(sale, itemsMap, settings, isReversal = false) {
  if (isReversal && sale.gl_journal_id) return reverseJournal(sale.gl_journal_id, sale.sale_date, 'POS Sale Cancelled');
  
  const lines = [];
  const s = settings || await sajilo.entities.CompanySettings.list().then(d => d[0] || {});

  const payAccId = sale.cash_bank_account_id || (sale.payment_method === 'Cash' ? s.gl_cash_account_id : s.gl_bank_account_id);
  
  let customerArId = sale.receivable_account_id || sale.customer?.receivable_account_id;
  if (!customerArId && sale.customer_id) {
    const { data: cData } = await supabase.from('BusinessPartner').select('receivable_account_id').eq('id', sale.customer_id).maybeSingle();
    if (cData) customerArId = cData.receivable_account_id;
  }
  const arId = customerArId || s.gl_accounts_receivable_id;

  if (sale.payment_method === 'Credit' && sale.customer_id) {
    if (!arId) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing Accounts Receivable (AR) Account for this Customer');
    lines.push({ account_category: 'ar', account_id: arId, debit_amount: sale.grand_total, credit_amount: 0, description: 'Credit sale', entity_type: 'Customer', entity_id: sale.customer_id, due_date: sale.sale_date });
  } else {
    if (!payAccId) throw new Error(`ERR_STRICT_ACCOUNT_MAPPING: Missing ${sale.payment_method} Account in Company Settings`);
    lines.push({ account_id: payAccId, debit_amount: sale.grand_total, credit_amount: 0, description: 'Payment received', entity_type: 'Customer', entity_id: sale.customer_id, due_date: sale.sale_date });
  }

  for (const line of (sale.line_items || [])) {
    lines.push({ 
      account_category: 'sales', item_id: line.item_id,
      debit_amount: 0, credit_amount: line.line_total, 
      description: `Sale: ${line.item_name}`, quantity: line.quantity, is_physical: true
    });
  }

  if (sale.vat_amount > 0) {
    if (!s.gl_vat_payable_id) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing VAT Payable Account in Company Settings');
    lines.push({ account_id: s.gl_vat_payable_id, debit_amount: 0, credit_amount: sale.vat_amount, description: 'Tax collected' });
  }

  const payload = {
    p_company_id: sale.company_id || sajilo.getCompanyId(),
    p_date: sale.sale_date,
    p_description: `POS Sale ${sale.sale_number}`,
    p_module: 'Sales',
    p_source_id: sale.id,
    p_source_type: 'POSSale',
    p_lines: lines,
    p_is_reversal: false,
    p_lock_cogs: true,
    p_voucher_no: sale.sale_number
  };

  const { data: journalId, error } = await supabase.rpc('rpc_post_gl_transaction', payload);
  if (error) handleDBError(error);
  return journalId;
}

// ─── 2. SALES INVOICE ──────────────────────────────────────────────────────────
export async function postSalesInvoice(invoice, itemsMap, settings, isReversal = false) {
  if (isReversal && invoice.gl_journal_id) return reverseJournal(invoice.gl_journal_id, invoice.invoice_date, 'Sales Invoice Cancelled');

  const s = settings || await sajilo.entities.CompanySettings.list().then(d => d[0] || {});
  const lines = [];

  let customerArId = invoice.receivable_account_id || invoice.customer?.receivable_account_id;
  if (!customerArId && invoice.customer_id) {
    const { data: cData } = await supabase.from('BusinessPartner').select('receivable_account_id').eq('id', invoice.customer_id).maybeSingle();
    if (cData) customerArId = cData.receivable_account_id;
  }
  const arId = customerArId || s.gl_accounts_receivable_id;

  if (['Cash', 'Bank'].includes(invoice.payment_mode)) {
    const cbId = invoice.cash_bank_account_id || (invoice.payment_mode === 'Cash' ? s.gl_cash_account_id : s.gl_bank_account_id);
    if (!cbId) throw new Error(`ERR_STRICT_ACCOUNT_MAPPING: Missing ${invoice.payment_mode} Account in Company Settings`);
    lines.push({ account_id: cbId, debit_amount: invoice.grand_total, credit_amount: 0, entity_type: 'Customer', entity_id: invoice.customer_id, due_date: invoice.due_date || invoice.invoice_date });
  } else {
    if (!arId) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing Accounts Receivable (AR) Account for this Customer');
    lines.push({ account_id: arId, debit_amount: invoice.grand_total, credit_amount: 0, entity_type: 'Customer', entity_id: invoice.customer_id, due_date: invoice.due_date || invoice.invoice_date });
  }

  for (const line of (invoice.line_items || [])) {
    lines.push({ 
      account_category: 'sales', item_id: line.item_id,
      debit_amount: 0, credit_amount: line.line_total, 
      description: `Sale: ${line.item_name}`, quantity: line.quantity, is_physical: true
    });
  }

  if (invoice.total_tax_amount > 0) {
    if (!s.gl_vat_payable_id) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing VAT Payable Account in Company Settings');
    lines.push({ account_id: s.gl_vat_payable_id, debit_amount: 0, credit_amount: invoice.total_tax_amount });
  }

  const payload = {
    p_company_id: invoice.company_id || sajilo.getCompanyId(),
    p_date: invoice.invoice_date,
    p_description: `Sales Invoice ${invoice.invoice_number}`,
    p_module: 'Sales',
    p_source_id: invoice.id,
    p_source_type: 'SalesInvoice',
    p_lines: lines,
    p_is_reversal: false,
    p_lock_cogs: true,
    p_voucher_no: invoice.invoice_number
  };

  const { data: journalId, error } = await supabase.rpc('rpc_post_gl_transaction', payload);
  if (error) handleDBError(error);
  return journalId;
}

// ─── 3. PURCHASE INVOICE ──────────────────────────────────────────────────────────
export async function postPurchaseInvoice(invoice, itemsMap, settings, isReversal = false) {
  let journalIdToReverse = invoice.gl_journal_id;
  if (isReversal && !journalIdToReverse) {
    const { data: journalData } = await supabase
      .from('GeneralLedgerJournal')
      .select('id')
      .eq('source_document_id', invoice.id)
      .eq('source_document_type', 'PurchaseInvoice')
      .order('created_at', { ascending: false })
      .limit(1);
    if (journalData && journalData.length > 0) {
      journalIdToReverse = journalData[0].id;
    }
  }

  if (isReversal && journalIdToReverse) return reverseJournal(journalIdToReverse, invoice.invoice_date, 'Purchase Invoice Cancelled');
  
  const s = settings || await sajilo.entities.CompanySettings.list().then(d => d[0] || {});
  const lines = [];

  for (const line of (invoice.line_items || [])) {
    lines.push({ account_category: 'inventory', item_id: line.item_id, debit_amount: line.line_total, credit_amount: 0, description: `Purchase: ${line.item_name}` });
  }

  if (invoice.vat_amount > 0) {
    if (!s.gl_vat_payable_id) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing VAT Payable Account in Company Settings');
    lines.push({ account_id: s.gl_vat_payable_id, debit_amount: invoice.vat_amount, credit_amount: 0, description: 'Input Tax' });
  }

  let vendorApId = invoice.payable_account_id || invoice.vendor?.payable_account_id;
  if (!vendorApId && invoice.vendor_id) {
    const { data: vData } = await supabase.from('BusinessPartner').select('payable_account_id').eq('id', invoice.vendor_id).maybeSingle();
    if (vData) vendorApId = vData.payable_account_id;
  }
  const apId = vendorApId || s.gl_accounts_payable_id;

  if (['Cash', 'Bank'].includes(invoice.payment_mode)) {
    const cbId = invoice.cash_bank_account_id || (invoice.payment_mode === 'Cash' ? s.gl_cash_account_id : s.gl_bank_account_id);
    if (!cbId) throw new Error(`ERR_STRICT_ACCOUNT_MAPPING: Missing ${invoice.payment_mode} Account in Company Settings`);
    lines.push({ account_id: cbId, debit_amount: 0, credit_amount: invoice.grand_total, entity_type: 'Vendor', entity_id: invoice.vendor_id, due_date: invoice.due_date || invoice.invoice_date });
  } else {
    if (!apId) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing Accounts Payable (AP) Account for this Vendor');
    lines.push({ account_id: apId, debit_amount: 0, credit_amount: invoice.grand_total, entity_type: 'Vendor', entity_id: invoice.vendor_id, due_date: invoice.due_date || invoice.invoice_date });
  }

  const payload = {
    p_company_id: invoice.company_id || sajilo.getCompanyId(),
    p_date: invoice.invoice_date,
    p_description: `Purchase Invoice ${invoice.invoice_number}`,
    p_module: 'Purchase',
    p_source_id: invoice.id,
    p_source_type: 'PurchaseInvoice',
    p_lines: lines,
    p_is_reversal: false,
    p_lock_cogs: false,
    p_voucher_no: invoice.invoice_number
  };

  const { data: journalId, error } = await supabase.rpc('rpc_post_gl_transaction', payload);
  if (error) handleDBError(error);

  // Note: WAC recalculation is now handled natively by the item trigger or purchase WAC RPC
  const { error: wacError } = await supabase.rpc('rpc_recalculate_wac_on_purchase', {
    p_company_id: invoice.company_id || sajilo.getCompanyId(),
    p_invoice_lines: invoice.line_items || []
  });
  if (wacError) console.error("WAC recalculation failed: ", wacError);

  return journalId;
}

// ─── 4. SALES RETURN ──────────────────────────────────────────────────────────
export async function postSalesReturn(ret, itemsMap, settings) {
  const s = settings || await sajilo.entities.CompanySettings.list().then(d => d[0] || {});
  const lines = [];

  const refundMethod = ret.refund_method || 'Cash';
  const refundAccId = (refundMethod === 'Bank Transfer' || refundMethod === 'Card') ? s.gl_bank_account_id : s.gl_cash_account_id;

  if (!s.gl_sales_return_account_id) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing Sales Return Account in Company Settings');
  lines.push({ account_id: s.gl_sales_return_account_id, debit_amount: ret.subtotal, credit_amount: 0 });

  if (ret.vat_amount > 0) {
    if (!s.gl_vat_payable_id) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing VAT Payable Account in Company Settings');
    lines.push({ account_id: s.gl_vat_payable_id, debit_amount: ret.vat_amount, credit_amount: 0, description: 'Tax reversal' });
  }

  if (!refundAccId) throw new Error(`ERR_STRICT_ACCOUNT_MAPPING: Missing ${refundMethod} Account in Company Settings`);
  lines.push({ account_id: refundAccId, debit_amount: 0, credit_amount: ret.grand_total, description: `Refund via ${refundMethod}` });

  for (const line of (ret.line_items || [])) {
    lines.push({
      item_id: line.item_id, quantity: line.quantity, is_physical: true,
      debit_amount: 0, credit_amount: 0, // 0 for sales/cash line, but triggers COGS lock reverse
      cost_at_sale: line.cost_at_sale // explicitly reuse the frozen cost
    });
  }

  const payload = {
    p_company_id: ret.company_id || sajilo.getCompanyId(),
    p_date: ret.return_date,
    p_description: `Sales Return ${ret.return_number}`,
    p_module: 'Sales',
    p_source_id: ret.id,
    p_source_type: 'SalesReturn',
    p_lines: lines,
    p_is_reversal: true, // triggers reverse COGS logic
    p_lock_cogs: true,
    p_voucher_no: ret.return_number
  };

  const { data: journalId, error } = await supabase.rpc('rpc_post_gl_transaction', payload);
  if (error) handleDBError(error);
  return journalId;
}

// ─── 5. PURCHASE RETURN ──────────────────────────────────────────────────────────
export async function postPurchaseReturn(ret, itemsMap, settings) {
  const s = settings || await sajilo.entities.CompanySettings.list().then(d => d[0] || {});
  const lines = [];

  let vendorApId = ret.payable_account_id || ret.vendor?.payable_account_id;
  if (!vendorApId && ret.vendor_id) {
    const { data: vData } = await supabase.from('BusinessPartner').select('payable_account_id').eq('id', ret.vendor_id).maybeSingle();
    if (vData) vendorApId = vData.payable_account_id;
  }
  const apId = vendorApId || s.gl_accounts_payable_id;

  if (!apId) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing Accounts Payable (AP) Account for this Vendor');
  lines.push({ account_id: apId, debit_amount: ret.grand_total, credit_amount: 0, entity_type: 'Vendor', entity_id: ret.vendor_id, due_date: ret.return_date });

  for (const line of (ret.line_items || [])) {
    lines.push({ account_category: 'inventory', item_id: line.item_id, debit_amount: 0, credit_amount: line.line_total, description: `Return: ${line.item_name}` });
  }

  if (ret.vat_amount > 0) {
    if (!s.gl_vat_payable_id) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing VAT Payable Account in Company Settings');
    lines.push({ account_id: s.gl_vat_payable_id, debit_amount: 0, credit_amount: ret.vat_amount, description: 'Tax reversal' });
  }

  const payload = {
    p_company_id: ret.company_id || sajilo.getCompanyId(),
    p_date: ret.return_date,
    p_description: `Purchase Return ${ret.return_number}`,
    p_module: 'Purchase',
    p_source_id: ret.id,
    p_source_type: 'PurchaseReturn',
    p_lines: lines,
    p_is_reversal: false,
    p_lock_cogs: false,
    p_voucher_no: ret.return_number
  };

  const { data: journalId, error } = await supabase.rpc('rpc_post_gl_transaction', payload);
  if (error) handleDBError(error);
  return journalId;
}

// ─── 6. STOCK ADJUSTMENT ─────────────────────────────────────────────────────────
export async function postStockAdjustment(adj, itemsMap, settings) {
  const payload = {
    p_company_id: adj.company_id || sajilo.getCompanyId(),
    p_adjustment_id: adj.id,
    p_adjustment_date: adj.adjustment_date,
    p_reason: adj.reason,
    p_lines: adj.line_items || [],
    p_voucher_no: adj.adjustment_number
  };

  const { data: journalId, error } = await supabase.rpc('rpc_post_stock_adjustment', payload);
  if (error) handleDBError(error);
  return journalId;
}

// Export legacy placeholders explicitly to prevent imports from crashing
export async function resolveDifferenceInTrialBalance() { return null; }
export async function postOpeningStock() { return null; }
export async function postItemDeletionWriteOff() { return null; }
export async function postAssetPurchase() { return null; }
export async function postAssetDepreciation() { return null; }
export async function postAssetDisposal() { return null; }
export async function loadItemsMap() { return {}; }
export async function loadSettings() {
  const data = await sajilo.entities.CompanySettings.list();
  return data.length > 0 ? data[0] : {};
}
