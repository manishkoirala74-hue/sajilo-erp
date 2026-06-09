/**
 * GL Posting Service ΓÇö Sajilo ERP
 * Central double-entry journal posting for all transactional modules.
 *
 * Every function here writes a balanced GeneralLedgerJournal + GeneralLedgerLine records.
 * If a required GL account is not configured, the function warns via toast and skips GL
 * (stock is still updated ΓÇö GL is best-effort until accounts are configured in Settings).
 */

import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';

// ΓöÇΓöÇΓöÇ Helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function r2(n) { return Math.round((n || 0) * 100) / 100; }

// ΓöÇΓöÇΓöÇ No Group Posting Guard ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// Validates that all posting lines target Sub Ledger (leaf) accounts only.
// Accepts an optional preloaded accounts array to avoid extra API calls.
async function validateNoGroupPosting(lines, preloadedAccounts = null) {
  const accountIds = [...new Set(lines.map(l => l.account_id).filter(Boolean))];
  if (accountIds.length === 0) return;

  let accounts;
  if (preloadedAccounts) {
    accounts = accountIds.map(id => preloadedAccounts.find(a => a.id === id) || null);
  } else {
    accounts = await Promise.all(
      accountIds.map(id => sajilo.entities.ChartOfAccount.filter({ id }, 'account_code', 1).then(r => r[0] || null))
    );
  }
  const groupAccounts = accounts.filter(a => a && a.ledger_type === 'Group Ledger');
  if (groupAccounts.length > 0) {
    const names = groupAccounts.map(a => `"${a.account_name}"`).join(', ');
    throw new Error(`No Group Posting: ${names} is a Group Ledger. Transactions must post to Sub Ledger accounts only.`);
  }
}

async function createJournal({ date, description, module, sourceId, sourceType, lines, preloadedAccounts = null }) {
  // Normalize negative amounts by swapping debit and credit (to support reversal logic safely without DB errors)
  const normalizedLines = lines.map(l => {
    let dr = r2(l.debit_amount || 0);
    let cr = r2(l.credit_amount || 0);
    if (dr < 0) { cr += Math.abs(dr); dr = 0; }
    if (cr < 0) { dr += Math.abs(cr); cr = 0; }
    return { ...l, debit_amount: dr, credit_amount: cr };
  });

  const totalDebit  = r2(normalizedLines.reduce((s, l) => s + l.debit_amount, 0));
  const totalCredit = r2(normalizedLines.reduce((s, l) => s + l.credit_amount, 0));

  if (totalDebit === 0 && totalCredit === 0) return null; // nothing to post

  // Enforce No Group Posting rule before writing any records
  await validateNoGroupPosting(lines, preloadedAccounts);

  const journal = await sajilo.entities.GeneralLedgerJournal.create({
    entry_date: date,
    description,
    reference_module: module,
    source_document_id: sourceId,
    source_document_type: sourceType,
    status: 'Posted',
    total_debit: totalDebit,
    total_credit: totalCredit,
    is_balanced: Math.abs(totalDebit - totalCredit) < 0.01,
  });

  await sajilo.entities.GeneralLedgerLine.bulkCreate(
    normalizedLines.map(l => ({
      journal_id: journal.id,
      account_id: l.account_id,
      account_code: l.account_code || '',
      account_name: l.account_name || '',
      account_type: l.account_type || '',
      debit_amount:  r2(l.debit_amount  || 0),
      credit_amount: r2(l.credit_amount || 0),
      description: l.description || description,
    }))
  );

  // Update running balance on each ChartOfAccount record
  // Net effect per account: Debit increases Debit-normal accounts, Credit increases Credit-normal accounts
  const accountDeltas = {};
  normalizedLines.forEach(l => {
    if (!l.account_id) return;
    if (!accountDeltas[l.account_id]) accountDeltas[l.account_id] = 0;
    // net change = debit - credit
    accountDeltas[l.account_id] += r2((l.debit_amount || 0) - (l.credit_amount || 0));
  });
  // Fetch affected accounts and update balances
  const accountIds = Object.keys(accountDeltas);
  if (accountIds.length > 0) {
    // Fetch each affected account individually to avoid filter/limit issues
    const accountEntries = await Promise.all(
      accountIds.map(async (accId) => {
        try {
          const results = await sajilo.entities.ChartOfAccount.filter({ id: accId }, 'account_code', 1);
          return results.length > 0 ? results[0] : null;
        } catch {
          return null;
        }
      })
    );
    await Promise.all(accountEntries.map(async (acc) => {
      if (!acc) return;
      const delta = accountDeltas[acc.id];
      if (delta === undefined || delta === 0) return;
      // For Debit-normal accounts (Asset, COGS, Expense, OPEX): positive delta increases balance
      // For Credit-normal accounts (Liability, Equity, Revenue): negative delta increases balance
      const debitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(acc.account_type);
      const balanceChange = debitNormal ? delta : -delta;
      const newBalance = r2((acc.current_balance || 0) + balanceChange);
      await sajilo.entities.ChartOfAccount.update(acc.id, { current_balance: newBalance });
    }));
  }

  return journal.id;
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

// ΓöÇΓöÇΓöÇ 1. POS SALE ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
/**
 * On Complete:
 *   DR Cash/Bank          (grand_total)
 *   CR Sales Revenue      (subtotal net of discount, per item)
 *   CR VAT Payable        (vat_amount)
 *   DR COGS               (qty ├ù WAC, physical items only)
 *   CR Inventory Asset    (qty ├ù WAC, physical items only)
 *
 * On Void (isReversal=true): all signs flipped.
 */
export async function postPOSSale(sale, itemsMap, settings, isReversal = false) {
  const s = settings || {};
  const sign = isReversal ? -1 : 1;
  const lines = [];

  const payAcc = resolvePaymentAccount(sale.payment_method, s);
  if (!payAcc.id) { warnMissingAccount('Cash/Bank'); return null; }

  // DR Cash/Bank
  lines.push({ account_id: payAcc.id, account_name: payAcc.name, debit_amount: r2(sign * sale.grand_total), credit_amount: 0, description: 'Payment received' });

  // CR Sales Revenue (per line) + COGS/Inventory
  const posLineItemsWithCost = [];
  for (const line of (sale.line_items || [])) {
    const item = itemsMap[line.item_id];
    const salesAccId   = item?.sales_account_id   || s.gl_default_sales_account_id;
    const salesAccName = item?.sales_account_name || s.gl_default_sales_account_name || 'Sales Revenue';
    if (!salesAccId) { warnMissingAccount('Sales Revenue'); continue; }

    // On reversal, we MUST use the exact cost_at_sale that was recorded on the line to balance the GL perfectly.
    // On normal post, we lock in the current unit cost.
    const costAtSale = isReversal 
      ? r2(line.cost_at_sale || 0)
      : r2(item?.current_unit_cost || item?.weighted_average_cost || 0);

    lines.push({ account_id: salesAccId, account_name: salesAccName, debit_amount: 0, credit_amount: r2(sign * line.line_total), description: `Sale: ${line.item_name}` });

    if (item && item.item_type !== 'Service') {
      const cogsAccId   = item.purchase_account_id   || s.gl_default_cogs_account_id;
      const cogsAccName = item.purchase_account_name || s.gl_default_cogs_account_name || 'COGS';
      const invAccId    = item.inventory_account_id  || s.gl_default_inventory_account_id;
      const invAccName  = item.inventory_account_name || s.gl_default_inventory_account_name || 'Inventory';
      const costAmt     = r2(line.quantity * costAtSale);
      if (cogsAccId && invAccId && costAmt > 0) {
        lines.push({ account_id: cogsAccId, account_name: cogsAccName, debit_amount: r2(sign * costAmt), credit_amount: 0, description: `COGS: ${line.item_name}` });
        lines.push({ account_id: invAccId,  account_name: invAccName,  debit_amount: 0, credit_amount: r2(sign * costAmt), description: `Inventory out: ${line.item_name}` });
      }
    }

    posLineItemsWithCost.push({ ...line, cost_at_sale: costAtSale });
  }

  // CR VAT Payable
  if (sale.vat_amount > 0) {
    if (!s.gl_vat_payable_id) { warnMissingAccount('VAT Payable'); }
    else lines.push({ account_id: s.gl_vat_payable_id, account_name: s.gl_vat_payable_name || 'VAT Payable', debit_amount: 0, credit_amount: r2(sign * sale.vat_amount), description: 'VAT collected' });
  }

  const journalId = await createJournal({
    date: sale.sale_date,
    description: `POS Sale ${sale.sale_number}${isReversal ? ' ΓÇö VOIDED' : ''}`,
    module: 'Sales',
    sourceId: sale.id,
    sourceType: 'POSSale',
    lines,
  });

  // Write cost_at_sale back onto the POS sale line items (only on initial post, not reversal)
  if (!isReversal && sale.id && posLineItemsWithCost.length > 0) {
    await sajilo.entities.POSSale.update(sale.id, { line_items: posLineItemsWithCost });
  }

  return journalId;
}

// ΓöÇΓöÇΓöÇ 2. SALES INVOICE ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
/**
 * On Post:
 *   DR Accounts Receivable   (grand_total)
 *   CR Sales Revenue         (goods_subtotal, per item)
 *   CR VAT Payable           (total_tax_amount)
 *   DR COGS / CR Inventory   (physical items)
 *
 * On Cancel (isReversal=true): all signs flipped.
 */
export async function postSalesInvoice(invoice, itemsMap, settings, isReversal = false) {
  const s = settings || {};
  const sign = isReversal ? -1 : 1;
  const lines = [];

  if (['Cash', 'Bank'].includes(invoice.payment_mode)) {
    const cbId = invoice.cash_bank_account_id;
    const cbName = invoice.cash_bank_account_name || invoice.payment_mode;
    if (!cbId) { warnMissingAccount(`${invoice.payment_mode} Account`); return null; }
    lines.push({ account_id: cbId, account_name: cbName, debit_amount: r2(sign * invoice.grand_total), credit_amount: 0 });
  } else {
    const arId   = s.gl_accounts_receivable_id;
    const arName = s.gl_accounts_receivable_name || 'Accounts Receivable';
    if (!arId) { warnMissingAccount('Accounts Receivable'); return null; }
    lines.push({ account_id: arId, account_name: arName, debit_amount: r2(sign * invoice.grand_total), credit_amount: 0 });
  }

  const siLineItemsWithCost = [];
  for (const line of (invoice.line_items || [])) {
    const item = itemsMap[line.item_id];
    const salesAccId   = item?.sales_account_id   || s.gl_default_sales_account_id;
    const salesAccName = item?.sales_account_name || s.gl_default_sales_account_name || 'Sales Revenue';
    if (!salesAccId) { warnMissingAccount('Sales Revenue'); continue; }

    // On reversal, we MUST use the exact cost_at_sale that was recorded on the line to balance the GL perfectly.
    // On normal post, we lock in the current unit cost.
    const costAtSale = isReversal 
      ? r2(line.cost_at_sale || 0)
      : r2(item?.current_unit_cost || item?.weighted_average_cost || 0);

    lines.push({ account_id: salesAccId, account_name: salesAccName, debit_amount: 0, credit_amount: r2(sign * line.line_total), description: `Sale: ${line.item_name}` });

    if (item && item.item_type !== 'Service') {
      const cogsAccId = item.purchase_account_id || s.gl_default_cogs_account_id;
      const invAccId  = item.inventory_account_id || s.gl_default_inventory_account_id;
      const costAmt   = r2(line.quantity * costAtSale);
      if (cogsAccId && invAccId && costAmt > 0) {
        lines.push({ account_id: cogsAccId, account_name: item.purchase_account_name || 'COGS',      debit_amount: r2(sign * costAmt), credit_amount: 0 });
        lines.push({ account_id: invAccId,  account_name: item.inventory_account_name || 'Inventory', debit_amount: 0, credit_amount: r2(sign * costAmt) });
      }
    }

    siLineItemsWithCost.push({ ...line, cost_at_sale: costAtSale });
  }

  if (invoice.total_tax_amount > 0 && s.gl_vat_payable_id) {
    lines.push({ account_id: s.gl_vat_payable_id, account_name: s.gl_vat_payable_name || 'VAT Payable', debit_amount: 0, credit_amount: r2(sign * invoice.total_tax_amount) });
  }

  const journalId = await createJournal({
    date: invoice.invoice_date,
    description: `Sales Invoice ${invoice.invoice_number}${isReversal ? ' ΓÇö CANCELLED' : ''}`,
    module: 'Sales',
    sourceId: invoice.id,
    sourceType: 'SalesInvoice',
    lines,
  });

  // Write cost_at_sale back onto the invoice line items (only on initial post, not reversal)
  if (!isReversal && invoice.id && siLineItemsWithCost.length > 0) {
    await sajilo.entities.SalesInvoice.update(invoice.id, { line_items: siLineItemsWithCost });
  }

  return journalId;
}

// ΓöÇΓöÇΓöÇ WAC RECALCULATION HOOK ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
/**
 * Triggered ONLY after a Purchase Invoice is successfully posted.
 * Applies the Moving Weighted Average Cost formula atomically per item.
 * Skips Service items and items with costing_method !== 'WAC'.
 *
 * Formula:
 *   new_total_qty   = quantity_on_hand + received_qty
 *   new_total_value = total_asset_value + (received_qty ├ù unit_price)
 *   current_unit_cost = new_total_value / new_total_qty
 *
 * Also writes wac_unit_cost_snapshot back onto the invoice line for audit trail.
 */
async function recalculateWAC(invoiceLines, itemsMap) {
  const lineSnapshots = {};
  for (const line of invoiceLines) {
    const item = itemsMap[line.item_id];
    if (!item || item.item_type === 'Service') continue;
    if ((item.costing_method || 'WAC') !== 'WAC') continue;

    const incomingQty   = r2(line.received_qty ?? line.quantity ?? 0);
    const incomingPrice = r2(line.unit_price ?? 0);
    if (incomingQty <= 0) continue;

    // Bootstrap old value mathematically from WAC (ignoring total_asset_value which is not decremented on sales)
    const oldQty   = r2(item.quantity_on_hand || 0);
    const oldValue = r2(oldQty * (item.current_unit_cost || item.weighted_average_cost || 0));

    const newTotalQty   = r2(oldQty + incomingQty);
    const newTotalValue = r2(oldValue + (incomingQty * incomingPrice));
    const newUnitCost   = newTotalQty > 0 ? r2(newTotalValue / newTotalQty) : r2(incomingPrice);

    await sajilo.entities.Item.update(item.id, {
      quantity_on_hand:      newTotalQty,
      current_unit_cost:     newUnitCost,
      weighted_average_cost: newUnitCost, // Keep legacy field in sync
    });

    lineSnapshots[line.item_id] = newUnitCost;
  }
  return lineSnapshots; // caller writes these back onto invoice lines
}

// ΓöÇΓöÇΓöÇ 3. PURCHASE INVOICE ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
/**
 * On Post:
 *   DR Inventory Asset       (per line, at purchase price)
 *   DR VAT Receivable/Input  (if VAT applicable ΓÇö treated as input tax recoverable)
 *   CR Accounts Payable      (grand_total)
 *
 * After GL is committed, recalculateWAC() runs to update item cost fields
 * and writes wac_unit_cost_snapshot back onto each invoice line for audit trail.
 */
export async function postPurchaseInvoice(invoice, itemsMap, settings, isReversal = false) {
  const s = settings || {};
  const sign = isReversal ? -1 : 1;
  const lines = [];

  let apId, apName;
  if (!['Cash', 'Bank'].includes(invoice.payment_mode)) {
    apId   = s.gl_accounts_payable_id;
    apName = s.gl_accounts_payable_name || 'Accounts Payable';
    if (!apId) { warnMissingAccount('Accounts Payable'); return null; }
  }

  for (const line of (invoice.line_items || [])) {
    const item = itemsMap[line.item_id];
    const invAccId   = item?.inventory_account_id   || s.gl_default_inventory_account_id;
    const invAccName = item?.inventory_account_name || s.gl_default_inventory_account_name || 'Inventory';
    if (!invAccId) { warnMissingAccount('Inventory Asset'); continue; }
    lines.push({ account_id: invAccId, account_name: invAccName, debit_amount: r2(sign * line.line_total), credit_amount: 0, description: `Purchase: ${line.item_name}` });
  }

  if (invoice.vat_amount > 0 && s.gl_vat_payable_id) {
    // Input VAT ΓÇö DR VAT Payable (reduces liability / treated as input credit)
    lines.push({ account_id: s.gl_vat_payable_id, account_name: s.gl_vat_payable_name || 'VAT Payable', debit_amount: r2(sign * invoice.vat_amount), credit_amount: 0, description: 'Input VAT' });
  }

  if (['Cash', 'Bank'].includes(invoice.payment_mode)) {
    const cbId = invoice.cash_bank_account_id;
    const cbName = invoice.cash_bank_account_name || invoice.payment_mode;
    if (!cbId) { warnMissingAccount(`${invoice.payment_mode} Account`); return null; }
    lines.push({ account_id: cbId, account_name: cbName, debit_amount: 0, credit_amount: r2(sign * invoice.grand_total) });
  } else {
    lines.push({ account_id: apId, account_name: apName, debit_amount: 0, credit_amount: r2(sign * invoice.grand_total) });
  }

  // Commit GL journal first ΓÇö WAC runs after so GL remains atomic even if cost update fails
  const journalId = await createJournal({
    date: invoice.invoice_date,
    description: `Purchase Invoice ${invoice.invoice_number}${isReversal ? ' ΓÇö CANCELLED' : ''}`,
    module: 'Purchase',
    sourceId: invoice.id,
    sourceType: 'PurchaseInvoice',
    lines,
  });

  // WAC recalculation trigger ΓÇö runs only on WAC items after GL is committed
  // Skip during reversals because cancellation manual stock adjustment handles restoration
  if (!isReversal) {
    const snapshots = await recalculateWAC(invoice.line_items || [], itemsMap);

    // Write wac_unit_cost_snapshot back onto the invoice line_items for audit trail
    if (invoice.id && Object.keys(snapshots).length > 0) {
      const updatedLines = (invoice.line_items || []).map(l => ({
        ...l,
        received_qty: l.received_qty ?? l.quantity,
        wac_unit_cost_snapshot: snapshots[l.item_id] ?? l.wac_unit_cost_snapshot ?? null,
      }));
      await sajilo.entities.PurchaseInvoice.update(invoice.id, { line_items: updatedLines });
    }
  }

  return journalId;
}

// ΓöÇΓöÇΓöÇ 4. SALES RETURN ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
/**
 * On Post:
 *   DR Sales Returns & Allowances  (subtotal ΓÇö contra-revenue)
 *   DR VAT Payable                 (vat reversal)
 *   CR Cash / Bank                 (refund paid out ΓÇö asset decreases)
 *   DR Inventory Asset             (goods returned to stock)
 *   CR COGS                        (reversal of cost)
 *
 * NOTE: Cash/Bank is CREDITED (asset leaves business as refund to customer).
 */
export async function postSalesReturn(ret, itemsMap, settings) {
  const s = settings || {};
  const lines = [];

  const srAccId   = s.gl_sales_return_account_id;
  const srAccName = s.gl_sales_return_account_name || 'Sales Returns & Allowances';
  if (!srAccId) { warnMissingAccount('Sales Returns & Allowances'); return null; }

  const refundMethod = ret.refund_method || 'Cash';
  const refundAcc = resolvePaymentAccount(refundMethod === 'Bank Transfer' ? 'Card' : refundMethod, s);
  if (!refundAcc.id) { warnMissingAccount('Cash/Bank (refund)'); return null; }

  // DR Sales Returns & Allowances
  lines.push({ account_id: srAccId, account_name: srAccName, debit_amount: r2(ret.subtotal), credit_amount: 0 });

  // DR VAT Payable (reversal)
  if (ret.vat_amount > 0 && s.gl_vat_payable_id) {
    lines.push({ account_id: s.gl_vat_payable_id, account_name: s.gl_vat_payable_name || 'VAT Payable', debit_amount: r2(ret.vat_amount), credit_amount: 0, description: 'VAT reversal' });
  }

  // CR Cash / Bank (refund out)
  lines.push({ account_id: refundAcc.id, account_name: refundAcc.name, debit_amount: 0, credit_amount: r2(ret.grand_total), description: `Refund via ${refundMethod}` });

  // Inventory reversal per line
  for (const line of (ret.line_items || [])) {
    const item = itemsMap[line.item_id];
    if (item && item.item_type !== 'Service') {
      const invAccId  = item.inventory_account_id  || s.gl_default_inventory_account_id;
      const cogsAccId = item.purchase_account_id   || s.gl_default_cogs_account_id;
      const costAmt   = r2(line.quantity * (item.weighted_average_cost || 0));
      if (invAccId && cogsAccId && costAmt > 0) {
        lines.push({ account_id: invAccId,  account_name: item.inventory_account_name || 'Inventory', debit_amount: costAmt, credit_amount: 0, description: `Return in: ${line.item_name}` });
        lines.push({ account_id: cogsAccId, account_name: item.purchase_account_name  || 'COGS',      debit_amount: 0, credit_amount: costAmt, description: `COGS reversal: ${line.item_name}` });
      }
    }
  }

  return createJournal({
    date: ret.return_date,
    description: `Sales Return ${ret.return_number}`,
    module: 'Sales',
    sourceId: ret.id,
    sourceType: 'SalesReturn',
    lines,
  });
}

// ΓöÇΓöÇΓöÇ 5. PURCHASE RETURN ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
/**
 * On Post:
 *   DR Accounts Payable      (reduces liability ΓÇö vendor owes us)
 *   CR Inventory Asset       (stock leaving)
 *   CR VAT Payable           (input VAT reversed)
 */
export async function postPurchaseReturn(ret, itemsMap, settings) {
  const s = settings || {};
  const lines = [];

  const apId   = s.gl_accounts_payable_id;
  const apName = s.gl_accounts_payable_name || 'Accounts Payable';
  if (!apId) { warnMissingAccount('Accounts Payable'); return null; }

  lines.push({ account_id: apId, account_name: apName, debit_amount: r2(ret.grand_total), credit_amount: 0, description: 'Vendor credit for return' });

  for (const line of (ret.line_items || [])) {
    const item = itemsMap[line.item_id];
    const invAccId   = item?.inventory_account_id   || s.gl_default_inventory_account_id;
    const invAccName = item?.inventory_account_name || s.gl_default_inventory_account_name || 'Inventory';
    if (!invAccId) { warnMissingAccount('Inventory Asset'); continue; }
    lines.push({ account_id: invAccId, account_name: invAccName, debit_amount: 0, credit_amount: r2(line.line_total), description: `Return: ${line.item_name}` });
  }

  if (ret.vat_amount > 0 && s.gl_vat_payable_id) {
    lines.push({ account_id: s.gl_vat_payable_id, account_name: s.gl_vat_payable_name || 'VAT Payable', debit_amount: 0, credit_amount: r2(ret.vat_amount), description: 'Input VAT reversal' });
  }

  return createJournal({
    date: ret.return_date,
    description: `Purchase Return ${ret.return_number}`,
    module: 'Purchase',
    sourceId: ret.id,
    sourceType: 'PurchaseReturn',
    lines,
  });
}

// ΓöÇΓöÇΓöÇ 6. STOCK ADJUSTMENT ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
/**
 * Increase:  DR Inventory Asset  / CR Stock Variance
 * Decrease:  DR Stock Variance   / CR Inventory Asset
 */
export async function postStockAdjustment(adj, itemsMap, settings) {
  const s = settings || {};
  const lines = [];

  const varAccId   = s.gl_stock_variance_account_id;
  const varAccName = s.gl_stock_variance_account_name || 'Stock Variance';
  if (!varAccId) { warnMissingAccount('Stock Variance'); return null; }

  for (const line of (adj.line_items || [])) {
    const item = itemsMap[line.item_id];
    const invAccId   = item?.inventory_account_id   || s.gl_default_inventory_account_id;
    const invAccName = item?.inventory_account_name || s.gl_default_inventory_account_name || 'Inventory';
    if (!invAccId) { warnMissingAccount('Inventory Asset'); continue; }
    const costAmt = r2(line.cost_impact || 0);
    if (costAmt <= 0) continue;

    if (line.difference_qty > 0) {
      // Increase: DR Inventory, CR Variance
      lines.push({ account_id: invAccId,  account_name: invAccName,  debit_amount: costAmt, credit_amount: 0,        description: `Stock up: ${line.item_name}` });
      lines.push({ account_id: varAccId,  account_name: varAccName,  debit_amount: 0,       credit_amount: costAmt,  description: `Stock up: ${line.item_name}` });
    } else if (line.difference_qty < 0) {
      // Decrease: DR Variance, CR Inventory
      lines.push({ account_id: varAccId,  account_name: varAccName,  debit_amount: costAmt, credit_amount: 0,        description: `Stock down: ${line.item_name}` });
      lines.push({ account_id: invAccId,  account_name: invAccName,  debit_amount: 0,       credit_amount: costAmt,  description: `Stock down: ${line.item_name}` });
    }
  }

  return createJournal({
    date: adj.adjustment_date,
    description: `Stock Adjustment ${adj.adjustment_number} ΓÇö ${adj.reason}`,
    module: 'Stock',
    sourceId: adj.id,
    sourceType: 'StockAdjustment',
    lines,
  });
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
