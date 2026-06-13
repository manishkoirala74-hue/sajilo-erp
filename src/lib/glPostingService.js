/**
 * GL Posting Service — Sajilo ERP
 * REFACTORED to use Two-Tiered Hub-and-Spoke Architecture
 * All math validation, idempotency checks, and WAC locking occur in PostgreSQL.
 */

import { supabase, sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';

function handleDBError(error) {
  if (!error) return;
  if (error.message && error.message.includes('ERR_UNBALANCED_JOURNAL')) {
    toast.error('Posting Blocked: The journal entry is mathematically unbalanced.', { duration: 8000 });
  } else if (error.message && error.message.includes('ERR_MISSING_ACCOUNT')) {
    toast.error('Posting Aborted: Missing required control account mapping.', { duration: 8000 });
  } else {
    toast.error('GL Posting Failed: ' + (error.message || 'Unknown database error'), { duration: 8000 });
  }
  throw error;
}

// Ensure items map and settings are loaded if not passed
export async function loadItemsMap(itemIds) {
  if (!itemIds || itemIds.length === 0) return {};
  const { data } = await supabase.from('Item').select('id, current_unit_cost, weighted_average_cost, is_physical').in('id', itemIds);
  const map = {};
  for (const item of (data || [])) map[item.id] = item;
  return map;
}

export async function loadSettings() {
  const data = await sajilo.entities.CompanySettings.list();
  return data.length > 0 ? data[0] : {};
}

// ─── SECONDARY HUB RPC POSTINGS ───
export async function postItemDeletionWriteOff(items, settings) { return null; }
export async function postSalesReturn(returns, itemsMap, settings, isReversal = false) {
  if (isReversal) return null; // Reversed handled differently
  const payload = {
    ...returns,
    line_items: returns.line_items.map(l => ({
      item_id: l.item_id,
      quantity: l.quantity,
      rate: l.rate,
      tax_rate: l.tax_rate,
      total: l.total,
      asset_account_id: itemsMap[l.item_id]?.inventory_account_id,
      income_account_id: itemsMap[l.item_id]?.sales_account_id,
      cogs_account_id: itemsMap[l.item_id]?.cogs_account_id
    }))
  };
  const { data, error } = await sajilo.client.rpc('rpc_post_sales_return', {
    p_payload: payload,
    p_idempotency_key: returns.idempotency_key,
    p_gl_settings: settings
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function postPurchaseReturn(returns, itemsMap, settings, isReversal = false) {
  if (isReversal) return null;
  const payload = {
    ...returns,
    line_items: returns.line_items.map(l => ({
      item_id: l.item_id,
      quantity: l.quantity,
      rate: l.rate,
      tax_rate: l.tax_rate,
      total: l.total,
      asset_account_id: itemsMap[l.item_id]?.inventory_account_id,
      cogs_account_id: itemsMap[l.item_id]?.cogs_account_id
    }))
  };
  const { data, error } = await sajilo.client.rpc('rpc_post_purchase_return', {
    p_payload: payload,
    p_idempotency_key: returns.idempotency_key,
    p_gl_settings: settings
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function postStockAdjustment(adjustment, itemsMap, settings, isReversal = false) {
  if (isReversal) return null;
  const payload = {
    ...adjustment,
    line_items: adjustment.line_items.map(l => ({
      item_id: l.item_id,
      quantity: l.difference_qty, // used by journal
      adjusted_qty: l.adjusted_qty, // used by item update
      cost_impact: l.cost_impact,
      asset_account_id: itemsMap[l.item_id]?.inventory_account_id,
      cogs_account_id: itemsMap[l.item_id]?.cogs_account_id
    }))
  };
  const { data, error } = await sajilo.client.rpc('rpc_post_stock_adjustment', {
    p_payload: payload,
    p_idempotency_key: adjustment.idempotency_key,
    p_gl_settings: settings
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function postPayroll(payroll, settings, isReversal = false) {
  if (isReversal) return null;
  const { data, error } = await sajilo.client.rpc('rpc_post_payroll_run', {
    p_payload: payroll,
    p_idempotency_key: payroll.idempotency_key,
    p_gl_settings: settings
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function postAssetPurchase() { return null; }
export async function postAssetDepreciation() { return null; }
export async function postAssetDisposal() { return null; }
export async function postOpeningStock(balances, settings) { return null; }
export async function resolveDifferenceInTrialBalance(data, settings) { return null; }


// ─── 1. POS SALE (For backwards compatibility if POS is used) ───
export async function postPOSSale(sale, itemsMap, settings, isReversal = false) {
  const payload = {
    ...sale,
    line_items: sale.line_items.map(l => ({
      item_id: l.item_id,
      quantity: l.quantity,
      rate: l.rate,
      tax_rate: l.tax_rate,
      total: l.total,
      asset_account_id: itemsMap[l.item_id]?.inventory_account_id,
      income_account_id: itemsMap[l.item_id]?.sales_account_id,
      cogs_account_id: itemsMap[l.item_id]?.cogs_account_id
    }))
  };
  const { data, error } = await sajilo.client.rpc('rpc_post_pos_sale', {
    p_payload: payload,
    p_idempotency_key: sale.idempotency_key,
    p_gl_settings: settings
  });
  if (error) throw new Error(error.message);
  return data;
}

// ─── 2. SALES INVOICE ──────────────────────────────────────────────────────────
export async function postSalesInvoice(invoice, itemsMap, settings, isReversal = false, idempotencyKey = null) {
  const s = settings || await loadSettings();
  const lines = [];

  let customerArId = invoice.receivable_account_id || invoice.customer?.receivable_account_id;
  if (!customerArId && invoice.customer_id) {
    const { data: cData } = await supabase.from('BusinessPartner').select('receivable_account_id').eq('id', invoice.customer_id).maybeSingle();
    if (cData) customerArId = cData.receivable_account_id;
  }
  const arId = customerArId || s.gl_accounts_receivable_id;

  // Determine Payment Mode logic (Cash vs Credit) based on the presence of a cash_bank_account
  const cbId = invoice.cash_bank_account_id;
  
  if (cbId) {
    lines.push({ account_id: cbId, debit_amount: invoice.grand_total, credit_amount: 0, entity_type: 'Customer', entity_id: invoice.customer_id, due_date: invoice.due_date || invoice.invoice_date });
  } else {
    if (!arId) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing Accounts Receivable (AR) Account for this Customer');
    lines.push({ account_id: arId, debit_amount: invoice.grand_total, credit_amount: 0, entity_type: 'Customer', entity_id: invoice.customer_id, due_date: invoice.due_date || invoice.invoice_date });
  }

  for (const line of (invoice.line_items || [])) {
    lines.push({ 
      account_category: 'sales', item_id: line.item_id,
      debit_amount: 0, credit_amount: line.line_total, 
      description: `Sale: ${line.item_name}`
    });
  }

  if (invoice.total_tax_amount > 0) {
    if (!s.gl_vat_payable_id) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing VAT Payable Account in Company Settings');
    lines.push({ account_id: s.gl_vat_payable_id, debit_amount: 0, credit_amount: invoice.total_tax_amount });
  }

  const payload = {
    p_company_id: invoice.company_id || sajilo.getCompanyId(),
    p_invoice_id: invoice.id,
    p_idempotency_key: idempotencyKey,
    p_gl_lines: lines,
    p_is_reversal: isReversal
  };

  const { data, error } = await supabase.rpc('rpc_post_sales_invoice', payload);
  if (error) handleDBError(error);
  
  if (data && data.status === 'duplicate') {
    toast.info('This transaction was already posted. Recovered successfully.');
  }

  return data?.journal_id;
}

// ─── 3. PURCHASE INVOICE ──────────────────────────────────────────────────────────
export async function postPurchaseInvoice(invoice, itemsMap, settings, isReversal = false, idempotencyKey = null) {
  const s = settings || await loadSettings();
  const lines = [];

  for (const line of (invoice.line_items || [])) {
    lines.push({ account_category: 'inventory', item_id: line.item_id, debit_amount: line.line_total, credit_amount: 0, description: `Purchase: ${line.item_name}` });
  }

  if (invoice.total_tax_amount > 0) {
    if (!s.gl_vat_receivable_id) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing VAT Receivable Account in Company Settings');
    lines.push({ account_id: s.gl_vat_receivable_id, debit_amount: invoice.total_tax_amount, credit_amount: 0 });
  }

  let supplierApId = invoice.payable_account_id || invoice.supplier?.payable_account_id;
  if (!supplierApId && invoice.supplier_id) {
    const { data: cData } = await supabase.from('BusinessPartner').select('payable_account_id').eq('id', invoice.supplier_id).maybeSingle();
    if (cData) supplierApId = cData.payable_account_id;
  }
  const apId = supplierApId || s.gl_accounts_payable_id;

  const cbId = invoice.cash_bank_account_id;
  if (cbId) {
    lines.push({ account_id: cbId, debit_amount: 0, credit_amount: invoice.grand_total, entity_type: 'Supplier', entity_id: invoice.supplier_id, due_date: invoice.due_date || invoice.invoice_date });
  } else {
    if (!apId) throw new Error('ERR_STRICT_ACCOUNT_MAPPING: Missing Accounts Payable (AP) Account for this Supplier');
    lines.push({ account_id: apId, debit_amount: 0, credit_amount: invoice.grand_total, entity_type: 'Supplier', entity_id: invoice.supplier_id, due_date: invoice.due_date || invoice.invoice_date });
  }

  const payload = {
    p_company_id: invoice.company_id || sajilo.getCompanyId(),
    p_invoice_id: invoice.id,
    p_idempotency_key: idempotencyKey,
    p_gl_lines: lines,
    p_is_reversal: isReversal
  };

  const { data, error } = await supabase.rpc('rpc_post_purchase_invoice', payload);
  if (error) handleDBError(error);

  if (data && data.status === 'duplicate') {
    toast.info('This transaction was already posted. Recovered successfully.');
  }

  return data?.journal_id;
}

// ─── 4. FINANCIAL VOUCHERS ──────────────────────────────────────────────────────────
export async function postFinancialVoucher(voucher, isReversal = false, idempotencyKey = null) {
  const payload = {
    p_company_id: voucher.company_id || sajilo.getCompanyId(),
    p_voucher_id: voucher.id,
    p_idempotency_key: idempotencyKey,
    p_gl_lines: voucher.lines, // UI MUST pass correct debits/credits inside the lines array
    p_is_reversal: isReversal
  };

  const { data, error } = await supabase.rpc('rpc_post_financial_voucher', payload);
  if (error) handleDBError(error);

  if (data && data.status === 'duplicate') {
    toast.info('This transaction was already posted. Recovered successfully.');
  }

  return data?.journal_id;
}
