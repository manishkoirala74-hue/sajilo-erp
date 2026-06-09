/**
 * GL Posting Service — Sajilo ERP
 * Central double-entry journal posting for all transactional modules.
 *
 * Refactored to leverage atomic PostgreSQL RPC functions to ensure perfect consistency,
 * strict Group Ledger validation, and race-condition-free inventory costing.
 */

import { supabase } from '@/api/sajiloClient';
import { toast } from 'sonner';

function r2(n) { return Math.round((n || 0) * 100) / 100; }

function handleDBError(error) {
  if (!error) return;
  if (error.message && error.message.includes('ERR_GROUP_LEDGER_POSTING')) {
    toast.error('Posting Blocked: You are attempting to post a transaction to a Group Ledger. Please update your settings to use Sub Ledgers only.', { duration: 8000 });
  } else {
    toast.error('GL Posting Failed: ' + (error.message || 'Unknown database error'), { duration: 8000 });
  }
  throw error;
}

function warnMissingAccount(name) {
  toast.error(`GL Posting aborted: "${name}" account not configured in Settings → GL Accounts.`, { duration: 6000 });
  throw new Error('Missing Account Mapping');
}

function resolvePaymentAccount(paymentMethod, s) {
  if (!paymentMethod || paymentMethod === 'Cash') {
    return { id: s.gl_cash_account_id, name: s.gl_cash_account_name || 'Cash' };
  }
  return { id: s.gl_bank_account_id, name: s.gl_bank_account_name || 'Bank' };
}

// ─── Resolve "Difference in Trial Balance" ledger ────────────────────────────
export async function resolveDifferenceInTrialBalance() {
  const { data } = await supabase.from('ChartOfAccount').select('id, account_name').eq('is_active', true).ilike('account_name', '%difference in trial balance%').limit(1);
  if (!data || data.length === 0) {
    toast.warning('GL Posting skipped: "Difference in Trial Balance" account not found.', { duration: 8000 });
    return null;
  }
  return { id: data[0].id, name: data[0].account_name };
}


// ─── 1. POS SALE ─────────────────────────────────────────────────────────────
export async function postPOSSale(sale, itemsMap, settings, isReversal = false) {
  const s = settings || {};
  const sign = isReversal ? -1 : 1;
  const lines = [];

  const payAcc = resolvePaymentAccount(sale.payment_method, s);
  if (!payAcc.id) return warnMissingAccount('Cash/Bank');

  // DR Cash/Bank
  lines.push({ account_id: payAcc.id, account_name: payAcc.name, debit_amount: r2(sign * sale.grand_total), credit_amount: 0, description: 'Payment received' });

  for (const line of (sale.line_items || [])) {
    const item = itemsMap[line.item_id];
    const salesAccId   = item?.sales_account_id   || s.gl_default_sales_account_id;
    const salesAccName = item?.sales_account_name || s.gl_default_sales_account_name || 'Sales Revenue';
    if (!salesAccId) return warnMissingAccount('Sales Revenue');

    const isPhysical = item && item.item_type !== 'Service';
    const cogsAccId   = item?.purchase_account_id   || s.gl_default_cogs_account_id;
    const invAccId    = item?.inventory_account_id  || s.gl_default_inventory_account_id;

    if (isPhysical && (!cogsAccId || !invAccId)) return warnMissingAccount('COGS or Inventory Asset');

    lines.push({ 
      account_id: salesAccId, account_name: salesAccName, 
      debit_amount: 0, credit_amount: r2(sign * line.line_total), 
      description: `Sale: ${line.item_name}`,
      item_id: line.item_id,
      item_name: line.item_name,
      quantity: line.quantity,
      is_physical: isPhysical,
      cogs_account_id: cogsAccId,
      inventory_account_id: invAccId,
      cost_at_sale: line.cost_at_sale 
    });
  }

  // CR VAT Payable
  if (sale.vat_amount > 0) {
    if (!s.gl_vat_payable_id) return warnMissingAccount('VAT Payable');
    lines.push({ account_id: s.gl_vat_payable_id, account_name: s.gl_vat_payable_name || 'VAT Payable', debit_amount: 0, credit_amount: r2(sign * sale.vat_amount), description: 'VAT collected' });
  }

  const payload = {
    p_company_id: sale.company_id,
    p_date: sale.sale_date,
    p_description: `POS Sale ${sale.sale_number}${isReversal ? ' — VOIDED' : ''}`,
    p_module: 'Sales',
    p_source_id: sale.id,
    p_source_type: 'POSSale',
    p_lines: lines,
    p_is_reversal: isReversal,
    p_lock_cogs: true
  };

  const { data: journalId, error } = await supabase.rpc('rpc_post_gl_transaction', payload);
  if (error) handleDBError(error);
  
  return journalId;
}

// ─── 2. SALES INVOICE ────────────────────────────────────────────────────────
export async function postSalesInvoice(invoice, itemsMap, settings, isReversal = false) {
  const s = settings || {};
  const sign = isReversal ? -1 : 1;
  const lines = [];

  if (['Cash', 'Bank'].includes(invoice.payment_mode)) {
    const cbId = invoice.cash_bank_account_id;
    const cbName = invoice.cash_bank_account_name || invoice.payment_mode;
    if (!cbId) return warnMissingAccount(`${invoice.payment_mode} Account`);
    lines.push({ account_id: cbId, account_name: cbName, debit_amount: r2(sign * invoice.grand_total), credit_amount: 0 });
  } else {
    const arId   = s.gl_accounts_receivable_id;
    const arName = s.gl_accounts_receivable_name || 'Accounts Receivable';
    if (!arId) return warnMissingAccount('Accounts Receivable');
    lines.push({ account_id: arId, account_name: arName, debit_amount: r2(sign * invoice.grand_total), credit_amount: 0 });
  }

  for (const line of (invoice.line_items || [])) {
    const item = itemsMap[line.item_id];
    const salesAccId   = item?.sales_account_id   || s.gl_default_sales_account_id;
    const salesAccName = item?.sales_account_name || s.gl_default_sales_account_name || 'Sales Revenue';
    if (!salesAccId) return warnMissingAccount('Sales Revenue');

    const isPhysical = item && item.item_type !== 'Service';
    const cogsAccId = item?.purchase_account_id || s.gl_default_cogs_account_id;
    const invAccId  = item?.inventory_account_id || s.gl_default_inventory_account_id;
    if (isPhysical && (!cogsAccId || !invAccId)) return warnMissingAccount('COGS or Inventory Asset');

    lines.push({ 
      account_id: salesAccId, account_name: salesAccName, 
      debit_amount: 0, credit_amount: r2(sign * line.line_total), 
      description: `Sale: ${line.item_name}`,
      item_id: line.item_id,
      item_name: line.item_name,
      quantity: line.quantity,
      is_physical: isPhysical,
      cogs_account_id: cogsAccId,
      inventory_account_id: invAccId,
      cost_at_sale: line.cost_at_sale
    });
  }

  if (invoice.total_tax_amount > 0 && s.gl_vat_payable_id) {
    lines.push({ account_id: s.gl_vat_payable_id, account_name: s.gl_vat_payable_name || 'VAT Payable', debit_amount: 0, credit_amount: r2(sign * invoice.total_tax_amount) });
  }

  const payload = {
    p_company_id: invoice.company_id,
    p_date: invoice.invoice_date,
    p_description: `Sales Invoice ${invoice.invoice_number}${isReversal ? ' — CANCELLED' : ''}`,
    p_module: 'Sales',
    p_source_id: invoice.id,
    p_source_type: 'SalesInvoice',
    p_lines: lines,
    p_is_reversal: isReversal,
    p_lock_cogs: true
  };

  const { data: journalId, error } = await supabase.rpc('rpc_post_gl_transaction', payload);
  if (error) handleDBError(error);
  return journalId;
}


// ─── 3. PURCHASE INVOICE ─────────────────────────────────────────────────────
export async function postPurchaseInvoice(invoice, itemsMap, settings, isReversal = false) {
  const s = settings || {};
  const sign = isReversal ? -1 : 1;
  const lines = [];

  let apId, apName;
  if (!['Cash', 'Bank'].includes(invoice.payment_mode)) {
    apId   = s.gl_accounts_payable_id;
    apName = s.gl_accounts_payable_name || 'Accounts Payable';
    if (!apId) return warnMissingAccount('Accounts Payable');
  }

  for (const line of (invoice.line_items || [])) {
    const item = itemsMap[line.item_id];
    const invAccId   = item?.inventory_account_id   || s.gl_default_inventory_account_id;
    const invAccName = item?.inventory_account_name || s.gl_default_inventory_account_name || 'Inventory';
    if (!invAccId) return warnMissingAccount('Inventory Asset');
    lines.push({ account_id: invAccId, account_name: invAccName, debit_amount: r2(sign * line.line_total), credit_amount: 0, description: `Purchase: ${line.item_name}` });
  }

  if (invoice.vat_amount > 0 && s.gl_vat_payable_id) {
    lines.push({ account_id: s.gl_vat_payable_id, account_name: s.gl_vat_payable_name || 'VAT Payable', debit_amount: r2(sign * invoice.vat_amount), credit_amount: 0, description: 'Input VAT' });
  }

  if (['Cash', 'Bank'].includes(invoice.payment_mode)) {
    const cbId = invoice.cash_bank_account_id;
    const cbName = invoice.cash_bank_account_name || invoice.payment_mode;
    if (!cbId) return warnMissingAccount(`${invoice.payment_mode} Account`);
    lines.push({ account_id: cbId, account_name: cbName, debit_amount: 0, credit_amount: r2(sign * invoice.grand_total) });
  } else {
    lines.push({ account_id: apId, account_name: apName, debit_amount: 0, credit_amount: r2(sign * invoice.grand_total) });
  }

  const payload = {
    p_company_id: invoice.company_id,
    p_date: invoice.invoice_date,
    p_description: `Purchase Invoice ${invoice.invoice_number}${isReversal ? ' — CANCELLED' : ''}`,
    p_module: 'Purchase',
    p_source_id: invoice.id,
    p_source_type: 'PurchaseInvoice',
    p_lines: lines,
    p_is_reversal: isReversal,
    p_lock_cogs: false
  };

  const { data: journalId, error } = await supabase.rpc('rpc_post_gl_transaction', payload);
  if (error) handleDBError(error);

  if (!isReversal) {
    const { error: wacError } = await supabase.rpc('rpc_recalculate_wac_on_purchase', {
      p_company_id: invoice.company_id,
      p_invoice_lines: invoice.line_items || []
    });
    if (wacError) console.error("WAC recalculation failed: ", wacError);
  }

  return journalId;
}


// ─── 4. SALES RETURN ─────────────────────────────────────────────────────────
export async function postSalesReturn(ret, itemsMap, settings) {
  const s = settings || {};
  const lines = [];

  const srAccId   = s.gl_sales_return_account_id;
  const srAccName = s.gl_sales_return_account_name || 'Sales Returns & Allowances';
  if (!srAccId) return warnMissingAccount('Sales Returns & Allowances');

  const refundMethod = ret.refund_method || 'Cash';
  const refundAcc = resolvePaymentAccount(refundMethod === 'Bank Transfer' ? 'Card' : refundMethod, s);
  if (!refundAcc.id) return warnMissingAccount('Cash/Bank (refund)');

  lines.push({ account_id: srAccId, account_name: srAccName, debit_amount: r2(ret.subtotal), credit_amount: 0 });

  if (ret.vat_amount > 0 && s.gl_vat_payable_id) {
    lines.push({ account_id: s.gl_vat_payable_id, account_name: s.gl_vat_payable_name || 'VAT Payable', debit_amount: r2(ret.vat_amount), credit_amount: 0, description: 'VAT reversal' });
  }

  lines.push({ account_id: refundAcc.id, account_name: refundAcc.name, debit_amount: 0, credit_amount: r2(ret.grand_total), description: `Refund via ${refundMethod}` });

  for (const line of (ret.line_items || [])) {
    const item = itemsMap[line.item_id];
    if (item && item.item_type !== 'Service') {
      const invAccId  = item.inventory_account_id  || s.gl_default_inventory_account_id;
      const cogsAccId = item.purchase_account_id   || s.gl_default_cogs_account_id;
      const costAmt   = r2(line.quantity * (item.current_unit_cost || item.weighted_average_cost || 0));
      if (invAccId && cogsAccId && costAmt > 0) {
        lines.push({ account_id: invAccId,  account_name: item.inventory_account_name || 'Inventory', debit_amount: costAmt, credit_amount: 0, description: `Return in: ${line.item_name}` });
        lines.push({ account_id: cogsAccId, account_name: item.purchase_account_name  || 'COGS',      debit_amount: 0, credit_amount: costAmt, description: `COGS reversal: ${line.item_name}` });
      }
    }
  }

  const payload = {
    p_company_id: ret.company_id,
    p_date: ret.return_date,
    p_description: `Sales Return ${ret.return_number}`,
    p_module: 'Sales',
    p_source_id: ret.id,
    p_source_type: 'SalesReturn',
    p_lines: lines,
    p_lock_cogs: false
  };

  const { data: journalId, error } = await supabase.rpc('rpc_post_gl_transaction', payload);
  if (error) handleDBError(error);
  return journalId;
}


// ─── 5. PURCHASE RETURN ──────────────────────────────────────────────────────
export async function postPurchaseReturn(ret, itemsMap, settings) {
  const s = settings || {};
  const lines = [];

  const apId   = s.gl_accounts_payable_id;
  const apName = s.gl_accounts_payable_name || 'Accounts Payable';
  if (!apId) return warnMissingAccount('Accounts Payable');

  lines.push({ account_id: apId, account_name: apName, debit_amount: r2(ret.grand_total), credit_amount: 0, description: 'Vendor credit for return' });

  for (const line of (ret.line_items || [])) {
    const item = itemsMap[line.item_id];
    const invAccId   = item?.inventory_account_id   || s.gl_default_inventory_account_id;
    const invAccName = item?.inventory_account_name || s.gl_default_inventory_account_name || 'Inventory';
    if (!invAccId) return warnMissingAccount('Inventory Asset');
    lines.push({ account_id: invAccId, account_name: invAccName, debit_amount: 0, credit_amount: r2(line.line_total), description: `Return: ${line.item_name}` });
  }

  if (ret.vat_amount > 0 && s.gl_vat_payable_id) {
    lines.push({ account_id: s.gl_vat_payable_id, account_name: s.gl_vat_payable_name || 'VAT Payable', debit_amount: 0, credit_amount: r2(ret.vat_amount), description: 'Input VAT reversal' });
  }

  const payload = {
    p_company_id: ret.company_id,
    p_date: ret.return_date,
    p_description: `Purchase Return ${ret.return_number}`,
    p_module: 'Purchase',
    p_source_id: ret.id,
    p_source_type: 'PurchaseReturn',
    p_lines: lines,
    p_lock_cogs: false
  };

  const { data: journalId, error } = await supabase.rpc('rpc_post_gl_transaction', payload);
  if (error) handleDBError(error);
  return journalId;
}


// ─── 6. STOCK ADJUSTMENT ─────────────────────────────────────────────────────
export async function postStockAdjustment(adj, itemsMap, settings) {
  const s = settings || {};
  const lines = [];

  const varAccId   = s.gl_stock_variance_account_id;
  const varAccName = s.gl_stock_variance_account_name || 'Stock Variance';
  if (!varAccId) return warnMissingAccount('Stock Variance');

  for (const line of (adj.line_items || [])) {
    const item = itemsMap[line.item_id];
    const invAccId   = item?.inventory_account_id   || s.gl_default_inventory_account_id;
    const invAccName = item?.inventory_account_name || s.gl_default_inventory_account_name || 'Inventory';
    if (!invAccId) return warnMissingAccount('Inventory Asset');
    const costAmt = r2(line.cost_impact || 0);
    if (costAmt <= 0) continue;

    if (line.difference_qty > 0) {
      lines.push({ account_id: invAccId,  account_name: invAccName,  debit_amount: costAmt, credit_amount: 0,        description: `Stock up: ${line.item_name}` });
      lines.push({ account_id: varAccId,  account_name: varAccName,  debit_amount: 0,       credit_amount: costAmt,  description: `Stock up: ${line.item_name}` });
    } else if (line.difference_qty < 0) {
      lines.push({ account_id: varAccId,  account_name: varAccName,  debit_amount: costAmt, credit_amount: 0,        description: `Stock down: ${line.item_name}` });
      lines.push({ account_id: invAccId,  account_name: invAccName,  debit_amount: 0,       credit_amount: costAmt,  description: `Stock down: ${line.item_name}` });
    }
  }

  const payload = {
    p_company_id: adj.company_id,
    p_date: adj.adjustment_date,
    p_description: `Stock Adjustment ${adj.adjustment_number} — ${adj.reason}`,
    p_module: 'Stock',
    p_source_id: adj.id,
    p_source_type: 'StockAdjustment',
    p_lines: lines,
    p_lock_cogs: false
  };

  const { data: journalId, error } = await supabase.rpc('rpc_post_gl_transaction', payload);
  if (error) handleDBError(error);
  return journalId;
}