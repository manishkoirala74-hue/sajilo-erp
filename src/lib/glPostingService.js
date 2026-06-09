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

// ΓöÇΓöÇΓöÇ Resolve "Difference in Trial Balance" ledger ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Looks up the account by exact name (case-insensitive) from ChartOfAccounts.
// Returns { id, name } or null if not found.
export async function resolveDifferenceInTrialBalance() {
  const accounts = await sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 2000);
  const hit = accounts.find(a =>
    (a.account_name || '').toLowerCase().includes('difference in trial balance')
  );
  if (!hit) {
    toast.warning(
      'GL Posting skipped: "Difference in Trial Balance" account not found in Chart of Accounts. ' +
      'Please create it first.',
      { duration: 8000 }
    );
    return null;
  }
  return { id: hit.id, name: hit.account_name };
}

function resolvePaymentAccount(paymentMethod, s) {
  if (!paymentMethod || paymentMethod === 'Cash') {
    return { id: s.gl_cash_account_id, name: s.gl_cash_account_name || 'Cash' };
  }
  return { id: s.gl_bank_account_id, name: s.gl_bank_account_name || 'Bank' };
}

function warnMissingAccount(name) {
  toast.warning(`GL Posting skipped: "${name}" account not configured in Settings ΓåÆ GL Accounts.`, { duration: 6000 });
}



async function createJournal({ date, description, module, sourceId, sourceType, lines }) {
  let company_id = null;
  try {
    const me = await sajilo.auth.me();
    company_id = me.company_id;
  } catch (e) {
    company_id = sajilo.config?.company_id || null;
  }

  const payload = {
    p_company_id: company_id,
    p_entry_date: date,
    p_description: description,
    p_reference_module: module,
    p_source_document_id: sourceId,
    p_source_document_type: sourceType,
    p_lines: lines.map(l => ({
      account_id: l.account_id,
      debit_amount: Math.round((l.debit_amount || 0) * 100) / 100,
      credit_amount: Math.round((l.credit_amount || 0) * 100) / 100,
      description: l.description || description
    })),
    p_lock_cogs: false
  };
  const { data, error } = await sajilo.client.rpc('rpc_post_gl_transaction', payload);
  if (error) { toast.error('GL Error: ' + error.message); throw error; }
  return data;
}


// ΓöÇΓöÇΓöÇ 7. OPENING STOCK (Import) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
/**
 * Called after bulk item import to create GL entries for opening inventory value.
 * For each item with quantity_on_hand > 0:
 *   DR Inventory Asset   (qty ├ù purchase_price)
 *   CR Stock Variance    (balancing ΓÇö represents opening equity injection)
 *
 * items: array of { id, item_name, item_code, quantity_on_hand, purchase_price,
 *                   inventory_account_id, inventory_account_name }
 */
export async function postOpeningStock(items, settings, date, offsetAccount = null, inventoryAccount = null) {
  const s = settings || {};
  const lines = [];
  const entryDate = date || new Date().toISOString().slice(0, 10);

  // Credit side: user-provided offset or "Difference in Trial Balance" fallback
  let varAccId, varAccName;
  if (offsetAccount) {
    varAccId = offsetAccount.id;
    varAccName = offsetAccount.account_name;
  } else {
    const ditb = await resolveDifferenceInTrialBalance();
    if (!ditb) return null;
    varAccId   = ditb.id;
    varAccName = ditb.name;
  }

  // Build a nameΓåÆaccount map to resolve account IDs from names when IDs are missing
  const allAccounts = await sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 2000);
  const accountByName = {};
  allAccounts.forEach(a => { if (a.account_name) accountByName[a.account_name.toLowerCase()] = a; });

  let totalAmount = 0;

  for (const item of items) {
    const qty = item.quantity_on_hand || 0;
    const cost = item.weighted_average_cost || item.purchase_price || 0;
    const costAmt = r2(qty * cost);
    if (costAmt <= 0) continue;

    totalAmount += costAmt;

    if (!inventoryAccount) {
      // Resolve inventory account: prefer stored ID, then lookup by name, then fall back to default
      let invAccId   = item.inventory_account_id;
      let invAccName = item.inventory_account_name;
      if (!invAccId && invAccName) {
        const found = accountByName[invAccName.toLowerCase()];
        if (found) { invAccId = found.id; invAccName = found.account_name; }
      }
      invAccId   = invAccId   || s.gl_default_inventory_account_id;
      invAccName = invAccName || s.gl_default_inventory_account_name || 'Inventory';

      if (!invAccId) { warnMissingAccount('Inventory Asset'); continue; }

      lines.push({ account_id: invAccId, account_name: invAccName, debit_amount: costAmt, credit_amount: 0, description: `Opening stock: ${item.item_name}` });
    }
  }

  if (totalAmount === 0) return null;

  if (inventoryAccount) {
    lines.push({ account_id: inventoryAccount.id, account_name: inventoryAccount.account_name, debit_amount: r2(totalAmount), credit_amount: 0, description: `Opening stock batch import` });
  }

  // Single consolidated credit line
  lines.push({ account_id: varAccId, account_name: varAccName, debit_amount: 0, credit_amount: r2(totalAmount), description: `Opening stock batch import` });

  return createJournal({
    date: entryDate,
    description: 'Opening Stock ΓÇö Item Import',
    module: 'Stock',
    sourceId: 'import',
    sourceType: 'ItemImport',
    lines,
  });
}

// ΓöÇΓöÇΓöÇ 8. ITEM DELETION ΓÇö Inventory Write-Off ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
/**
 * Called when an item with remaining stock value is permanently deleted.
 * Writes off the remaining inventory asset value to Stock Variance so that
 * the Trial Balance reflects zero balance for the deleted item's inventory account.
 *
 * For each item with quantity_on_hand > 0 and a known cost:
 *   CR Inventory Asset   (qty ├ù current_unit_cost)  ΓÇö removes asset
 *   DR Stock Variance    (balancing entry)
 *
 * items: array of Item entity objects to be deleted
 */
export async function postItemDeletionWriteOff(items, settings) {
  const s = settings || {};
  const lines = [];
  const today = new Date().toISOString().slice(0, 10);

  const varAccId   = s.gl_stock_variance_account_id;
  const varAccName = s.gl_stock_variance_account_name || 'Stock Variance';
  if (!varAccId) { warnMissingAccount('Stock Variance'); return null; }

  for (const item of items) {
    if (item.item_type === 'Service') continue;
    const qty  = r2(item.quantity_on_hand || 0);
    const cost = r2(item.current_unit_cost || item.weighted_average_cost || item.purchase_price || 0);
    const costAmt = r2(qty * cost);
    if (costAmt <= 0) continue;

    const invAccId   = item.inventory_account_id   || s.gl_default_inventory_account_id;
    const invAccName = item.inventory_account_name || s.gl_default_inventory_account_name || 'Inventory';
    if (!invAccId) { warnMissingAccount('Inventory Asset'); continue; }

    // CR Inventory Asset (write off stock value), DR Stock Variance (expense the loss)
    lines.push({ account_id: varAccId,  account_name: varAccName,  debit_amount: costAmt, credit_amount: 0,        description: `Item deleted: ${item.item_name} (${qty} ${item.unit_of_measure || 'units'} @ NPR ${cost})` });
    lines.push({ account_id: invAccId,  account_name: invAccName,  debit_amount: 0,       credit_amount: costAmt,  description: `Item deleted: ${item.item_name}` });
  }

  if (lines.length === 0) return null;

  return createJournal({
    date: today,
    description: `Inventory Write-Off ΓÇö ${items.length} item(s) deleted`,
    module: 'Stock',
    sourceId: 'item-deletion',
    sourceType: 'ItemDeletion',
    lines,
  });
}

// ΓöÇΓöÇΓöÇ 9. ASSET PURCHASE ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
/**
 * Posted when a Fixed Asset is first registered (or on demand).
 * Uses the asset's own per-asset ledger mappings (preferred) and falls
 * back to the global CompanySettings depreciation accounts.
 *
 *   DR Asset Cost Ledger      (gross_purchase_value)   ΓÇö asset.asset_ledger_id
 *   CR Accounts Payable / Cash (gross_purchase_value)  ΓÇö s.gl_accounts_payable_id
 *
 * isReversal = true flips all signs (e.g. on asset disposal/delete).
 */
export async function postAssetPurchase(asset, settings, isReversal = false, preloadedAccounts = null, creditAccount = null) {
  const s = settings || {};
  const sign = isReversal ? -1 : 1;

  // Asset cost debit account ΓÇö MUST be per-asset or fail
  const assetAccId   = asset.asset_ledger_id;
  const assetAccName = asset.asset_ledger_name || asset.asset_name + ' (Cost)';
  if (!assetAccId) {
    warnMissingAccount(`Asset Cost Ledger for "${asset.asset_name}" ΓÇö set it in the asset form`);
    return null;
  }

  // Credit: use explicit creditAccount if provided, otherwise fall back to AP ΓåÆ Cash from settings
  let apId, apName;
  if (creditAccount?.id) {
    apId   = creditAccount.id;
    apName = creditAccount.name;
  } else {
    apId   = s.gl_accounts_payable_id || s.gl_cash_account_id;
    apName = s.gl_accounts_payable_name || s.gl_cash_account_name || 'Accounts Payable / Cash';
  }
  if (!apId) {
    warnMissingAccount(
      '"Accounts Payable" account not configured in Settings ΓåÆ GL Accounts. ' +
      'Please map an Accounts Payable or Cash account in Settings to enable asset GL posting.'
    );
    return null;
  }

  const gross = r2(asset.gross_purchase_value || 0);
  if (gross <= 0) return null;

  const lines = [
    { account_id: assetAccId, account_name: assetAccName, debit_amount: r2(sign * gross), credit_amount: 0, description: `Asset cost: ${asset.asset_name}` },
    { account_id: apId,       account_name: apName,        debit_amount: 0, credit_amount: r2(sign * gross), description: `Asset cost: ${asset.asset_name}` },
  ];

  return createJournal({
    date: asset.purchase_date || new Date().toISOString().slice(0, 10),
    description: `Fixed Asset ${isReversal ? 'Write-Off' : 'Purchase'} ΓÇö ${asset.asset_name} (${asset.asset_code || ''})`,
    module: 'Assets',
    sourceId: asset.id,
    sourceType: 'FixedAsset',
    lines,
    preloadedAccounts,
  });
}

// ΓöÇΓöÇΓöÇ 10. ASSET DEPRECIATION (per-asset ledger wiring) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
/**
 * Uses the asset's own ledger mappings (highest priority), falling back to
 * the category-based CompanySettings accounts.
 *
 *   DR dep_expense_ledger    (depreciation amount)
 *   CR accumulated_dep_ledger (depreciation amount)
 */
export async function postAssetDepreciation(asset, depAmount, periodLabel, settings) {
  const s = settings || {};

  // Resolve expense account: per-asset ΓåÆ category fallback
  const expAccId   = asset.dep_expense_ledger_id   || (
    ['Machinery', 'IT Equipment'].includes(asset.category)
      ? s.dep_factory_expense_account_id
      : s.dep_admin_expense_account_id
  );
  const expAccName = asset.dep_expense_ledger_name || (
    ['Machinery', 'IT Equipment'].includes(asset.category)
      ? (s.dep_factory_expense_account_name || 'Factory Overhead Control')
      : (s.dep_admin_expense_account_name || 'Depreciation Expense')
  );

  // Resolve credit account: per-asset ΓåÆ category fallback
  const crAccId   = asset.accumulated_dep_ledger_id || (
    ['Machinery', 'IT Equipment'].includes(asset.category)
      ? s.dep_accumulated_machinery_account_id
      : asset.category === 'Vehicles'
        ? s.dep_accumulated_vehicle_account_id
        : s.dep_accumulated_office_account_id
  );
  const crAccName = asset.accumulated_dep_ledger_name || (
    ['Machinery', 'IT Equipment'].includes(asset.category)
      ? (s.dep_accumulated_machinery_account_name || 'Accum. Dep. ΓÇö Machinery')
      : asset.category === 'Vehicles'
        ? (s.dep_accumulated_vehicle_account_name || 'Accum. Dep. ΓÇö Vehicles')
        : (s.dep_accumulated_office_account_name || 'Accum. Dep. ΓÇö Office')
  );

  if (!expAccId)  { warnMissingAccount(`Depreciation Expense Ledger for "${asset.asset_name}"`); return null; }
  if (!crAccId)   { warnMissingAccount(`Accumulated Dep. Ledger for "${asset.asset_name}"`); return null; }

  const amt = r2(depAmount || 0);
  if (amt <= 0) return null;

  const lines = [
    { account_id: expAccId, account_name: expAccName, debit_amount: amt,  credit_amount: 0,   description: `Dep. expense ΓÇö ${asset.asset_name} (${periodLabel})` },
    { account_id: crAccId,  account_name: crAccName,  debit_amount: 0,    credit_amount: amt,  description: `Accum. dep. ΓÇö ${asset.asset_name} (${periodLabel})` },
  ];

  return createJournal({
    date: new Date().toISOString().slice(0, 10),
    description: `Depreciation ΓÇö ${asset.asset_name} (${periodLabel})`,
    module: 'Assets',
    sourceId: asset.id,
    sourceType: 'FixedAsset',
    lines,
  });
}

// ΓöÇΓöÇΓöÇ 11. ASSET DISPOSAL ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
/**
 * IAS 16 compliant disposal journal. Called when an asset is marked Disposed or Sold.
 *
 * Required payload fields:
 *   asset                    ΓÇö FixedAsset record (with ledger IDs populated)
 *   settings                 ΓÇö CompanySettings record
 *   proceeds                 ΓÇö cash/bank proceeds received (0 if none)
 *   proceedsPaymentMethod    ΓÇö 'Cash' | 'Bank' (default: 'Cash')
 *   disposalDate             ΓÇö ISO date string
 *   manual_disposal_ledger_id ΓÇö (optional) FK override for the Gain/Loss line
 *
 * Journal structure:
 *   DR  Accumulated Dep. Ledger     (accumulated_depreciation)         ΓÇö removes contra-asset
 *   DR  Cash / Bank                 (proceeds, if any)                 ΓÇö realized inflow
 *   DR  Loss on Disposal            (if NBV > proceeds, i.e. loss)     ΓÇö expense
 *   CR  Asset Cost Ledger           (gross_purchase_value)             ΓÇö removes asset
 *   CR  Gain on Disposal            (if proceeds > NBV, i.e. gain)     ΓÇö income
 *
 * Gain/Loss account resolution order:
 *   1. manual_disposal_ledger_id (explicit override from caller)
 *   2. System account matched by name in ChartOfAccounts
 *   3. gl_stock_variance_account (last-resort balancing account)
 */
export async function postAssetDisposal({
  asset,
  settings,
  proceeds = 0,
  proceedsPaymentMethod = 'Cash',
  disposalDate,
  manual_disposal_ledger_id = null,
}) {
  const s = settings || {};
  const lines = [];
  const date  = disposalDate || new Date().toISOString().slice(0, 10);

  // ΓöÇΓöÇ Validate mandatory asset ledgers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const assetCostId   = asset.asset_ledger_id;
  const assetCostName = asset.asset_ledger_name || `${asset.asset_name} (Cost)`;
  if (!assetCostId) {
    warnMissingAccount(`Asset Cost Ledger for "${asset.asset_name}"`);
    return null;
  }

  const accumDepId   = asset.accumulated_dep_ledger_id;
  const accumDepName = asset.accumulated_dep_ledger_name || 'Accumulated Depreciation';
  if (!accumDepId) {
    warnMissingAccount(`Accumulated Dep. Ledger for "${asset.asset_name}"`);
    return null;
  }

  // ΓöÇΓöÇ Amounts ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const gross       = r2(asset.gross_purchase_value   || 0);
  const accumDep    = r2(asset.accumulated_depreciation || 0);
  const nbv         = r2(gross - accumDep);
  const proc        = r2(proceeds || 0);
  const gainOrLoss  = r2(proc - nbv); // positive = gain, negative = loss

  // ΓöÇΓöÇ Gain/Loss account resolution (3-tier) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  let glAccId   = null;
  let glAccName = null;

  if (manual_disposal_ledger_id) {
    // Tier 1: explicit manual override ΓÇö trust the caller, resolve name from CoA
    glAccId = manual_disposal_ledger_id;
    const found = await sajilo.entities.ChartOfAccount.filter({ id: manual_disposal_ledger_id }, 'account_code', 1);
    glAccName = found[0]?.account_name || 'Disposal Adjustment';
  } else {
    // Tier 2: match by canonical name in ChartOfAccounts
    const targetName = gainOrLoss >= 0
      ? 'Gain on Disposal of Assets'
      : 'Loss on Disposal of Assets';
    const matched = await sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_name', 500);
    const hit = matched.find(a =>
      a.account_name.toLowerCase().includes(gainOrLoss >= 0 ? 'gain on disposal' : 'loss on disposal')
    );
    if (hit) {
      glAccId   = hit.id;
      glAccName = hit.account_name;
    } else {
      // Tier 3: last-resort balancing account
      glAccId   = s.gl_stock_variance_account_id;
      glAccName = s.gl_stock_variance_account_name || 'Stock Variance / Disposal Adjustment';
      if (!glAccId) {
        warnMissingAccount(
          `Gain/Loss on Disposal account ΓÇö create "${targetName}" in Chart of Accounts or set a manual_disposal_ledger_id`
        );
        return null;
      }
    }
  }

  // ΓöÇΓöÇ Build journal lines ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  // DR Accumulated Depreciation (removes contra-asset balance)
  if (accumDep > 0) {
    lines.push({
      account_id: accumDepId, account_name: accumDepName,
      debit_amount: accumDep, credit_amount: 0,
      description: `Disposal: remove accum. dep. ΓÇö ${asset.asset_name}`,
    });
  }

  // DR Cash/Bank for proceeds (if any)
  if (proc > 0) {
    const procAcc = resolvePaymentAccount(proceedsPaymentMethod, s);
    if (!procAcc.id) { warnMissingAccount('Cash/Bank (disposal proceeds)'); return null; }
    lines.push({
      account_id: procAcc.id, account_name: procAcc.name,
      debit_amount: proc, credit_amount: 0,
      description: `Disposal proceeds ΓÇö ${asset.asset_name}`,
    });
  }

  // CR Asset Cost Ledger (removes the gross cost)
  lines.push({
    account_id: assetCostId, account_name: assetCostName,
    debit_amount: 0, credit_amount: gross,
    description: `Disposal: remove asset cost ΓÇö ${asset.asset_name}`,
  });

  // Gain (CR) or Loss (DR) ΓÇö uses the resolved glAccId from the 3-tier logic above
  if (Math.abs(gainOrLoss) > 0.01) {
    if (gainOrLoss > 0) {
      // GAIN: CR income account
      lines.push({
        account_id: glAccId, account_name: glAccName,
        debit_amount: 0, credit_amount: gainOrLoss,
        description: `Gain on disposal ΓÇö ${asset.asset_name}`,
      });
    } else {
      // LOSS: DR expense account
      lines.push({
        account_id: glAccId, account_name: glAccName,
        debit_amount: Math.abs(gainOrLoss), credit_amount: 0,
        description: `Loss on disposal ΓÇö ${asset.asset_name}`,
      });
    }
  }

  return createJournal({
    date,
    description: `Asset Disposal ΓÇö ${asset.asset_name} (${asset.asset_code || ''}) | NBV: ${nbv} | Proceeds: ${proc} | ${gainOrLoss >= 0 ? 'Gain' : 'Loss'}: ${Math.abs(gainOrLoss)}`,
    module: 'Assets',
    sourceId: asset.id,
    sourceType: 'FixedAsset',
    lines,
  });
}

// ΓöÇΓöÇΓöÇ Utility: load all items as a map {id ΓåÆ item} ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
export async function loadItemsMap(itemIds) {
  if (!itemIds || itemIds.length === 0) return {};
  const all = await sajilo.entities.Item.filter({ is_active: true }, 'item_name', 500);
  const map = {};
  all.forEach(i => { map[i.id] = i; });
  return map;
}

// ΓöÇΓöÇΓöÇ Utility: load company settings ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
export async function loadSettings() {
  const data = await sajilo.entities.CompanySettings.list();
  return data.length > 0 ? data[0] : {};
}
