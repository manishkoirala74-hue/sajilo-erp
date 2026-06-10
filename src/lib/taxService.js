/**
 * taxService.js — Sajilo ERP
 *
 * Dynamic, cascading multi-tax engine.
 *
 * Supports:
 *   - Multiple tax types per item (e.g. Excise Duty → then VAT on top)
 *   - Compound taxes: tax applied on (base + previous taxes), not just base
 *   - Inclusive and Exclusive calculation methods
 *   - Fallback to default tax type for legacy items with is_vat_applicable=true
 *
 * How Cascading Works:
 *   Taxes on a line are sorted by sort_order ASC.
 *   Non-compound: taxable base = line_total (net price)
 *   Compound    : taxable base = line_total + sum of all prior tax amounts
 *
 * Example — Excise 20% (non-compound) + VAT 13% (compound):
 *   Base = 100, Excise = 100 × 20% = 20, VAT = (100 + 20) × 13% = 15.6
 *   Total tax = 35.6, Grand total = 135.6
 */
import { sajilo } from '@/api/sajiloClient';

let _cache = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

// ─── Cache Management ─────────────────────────────────────────────────────────

/**
 * Load all active tax types for the current company, sorted by sort_order.
 * Results are cached for 60 seconds.
 * @returns {Promise<TaxType[]>}
 */
export async function loadActiveTaxTypes() {
  const now = Date.now();
  if (_cache && now - _cacheTs < CACHE_TTL_MS) return _cache;
  const data = await sajilo.entities.TaxType.filter({ is_active: true }, 'sort_order', 50);
  _cache = (data || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  _cacheTs = now;
  return _cache;
}

/** Invalidate the cache (call after saving/deleting a TaxType). */
export function invalidateTaxCache() {
  _cache = null;
  _cacheTs = 0;
}

/**
 * Get the default tax type (is_default = true).
 * Falls back to lowest sort_order type in the list.
 * @param {TaxType[]} [taxTypes]  Optional pre-loaded list
 * @returns {Promise<TaxType|null>}
 */
export async function getDefaultTaxType(taxTypes) {
  const types = taxTypes || await loadActiveTaxTypes();
  if (!types.length) return null;
  return types.find(t => t.is_default) || types[0];
}

/**
 * Get a specific tax type by ID.
 */
export async function getTaxTypeById(id, taxTypes) {
  if (!id) return null;
  const types = taxTypes || await loadActiveTaxTypes();
  return types.find(t => t.id === id) || null;
}

// ─── Core Calculation Engine ──────────────────────────────────────────────────

/**
 * Compute cascading taxes for a single line item.
 *
 * @param {number}    netAmount     The pre-tax line amount (net price × qty × (1 - disc%))
 * @param {string[]}  taxTypeIds    Ordered list of tax type IDs to apply (sorted by sort_order)
 * @param {TaxType[]} allTaxTypes   Pre-loaded list of all active tax types
 *
 * @returns {{
 *   taxBreakdown: Array<{ taxTypeId, taxName, rate, isCompound, taxAmount }>,
 *   totalTaxAmount: number,
 *   grandTotal: number
 * }}
 */
export function computeItemTaxes(netAmount, taxTypeIds, allTaxTypes) {
  if (!taxTypeIds || taxTypeIds.length === 0 || netAmount <= 0) {
    return { taxBreakdown: [], totalTaxAmount: 0, grandTotal: netAmount };
  }

  // Resolve and sort by sort_order
  const orderedTypes = taxTypeIds
    .map(id => (allTaxTypes || []).find(t => t.id === id))
    .filter(Boolean)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const breakdown = [];
  let cumulativeTax = 0;

  for (const taxType of orderedTypes) {
    const rate = Number(taxType.tax_rate || 0) / 100;
    if (rate <= 0) continue;

    // Taxable base: net + previous taxes IF compound, else just net
    const taxableBase = taxType.is_compound
      ? netAmount + cumulativeTax
      : netAmount;

    let taxAmount;
    if (taxType.tax_type === 'Inclusive') {
      // Extract from gross: gross already includes this tax
      taxAmount = (taxableBase * rate) / (1 + rate);
    } else {
      taxAmount = taxableBase * rate;
    }

    taxAmount = Math.round(taxAmount * 100) / 100;
    cumulativeTax += taxAmount;

    breakdown.push({
      taxTypeId:  taxType.id,
      taxName:    taxType.tax_name,
      taxCode:    taxType.tax_code || '',
      rate:       Number(taxType.tax_rate),
      isCompound: !!taxType.is_compound,
      glAccountId:   taxType.gl_account_id   || null,
      glAccountName: taxType.gl_account_name || taxType.tax_name,
      taxAmount,
    });
  }

  const totalTaxAmount = Math.round(cumulativeTax * 100) / 100;
  return {
    taxBreakdown:    breakdown,
    totalTaxAmount,
    grandTotal: Math.round((netAmount + totalTaxAmount) * 100) / 100,
  };
}

/**
 * Compute the total tax for a list of invoice line items.
 *
 * Each line must have:
 *   - line_total        : net amount
 *   - tax_type_ids      : string[] of tax type IDs (preferred)
 *   - vat_applicable    : boolean (legacy fallback — uses default tax type)
 *
 * @param {LineItem[]} lines
 * @param {TaxType[]}  taxTypes   Pre-loaded list
 * @returns {{ totalTaxAmount: number, perLineTax: Record<index, number> }}
 */
export function computeTotalTax(lines, taxTypes) {
  const defaultType = (taxTypes || []).find(t => t.is_default) || (taxTypes || [])[0];
  let totalTaxAmount = 0;
  const perLineTax = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const netAmount = line.line_total || 0;

    let effectiveIds = [];

    if (line.tax_type_ids && line.tax_type_ids.length > 0) {
      // Modern path: explicit multi-tax IDs on line
      effectiveIds = line.tax_type_ids;
    } else if (line.vat_applicable && defaultType) {
      // Legacy fallback: single default tax
      effectiveIds = [defaultType.id];
    }

    if (effectiveIds.length > 0) {
      const { totalTaxAmount: lineTax } = computeItemTaxes(netAmount, effectiveIds, taxTypes);
      perLineTax[i] = lineTax;
      totalTaxAmount += lineTax;
    } else {
      perLineTax[i] = 0;
    }
  }

  return {
    totalTaxAmount: Math.round(totalTaxAmount * 100) / 100,
    perLineTax,
  };
}

/**
 * Build GL journal lines for all tax breakdowns across invoice lines.
 * Groups tax amounts by GL account to produce one journal entry per tax ledger.
 *
 * @param {Array<{ taxBreakdown: [], line_total: number }>} lineTaxDetails
 * @param {number} sign  1 for normal posting, -1 for reversal
 * @returns {Array<{ account_id, account_name, debit_amount, credit_amount }>}
 */
export function buildTaxJournalLines(lineTaxDetails, sign = 1) {
  // Aggregate by GL account
  const byAccount = {};
  for (const { taxBreakdown } of lineTaxDetails) {
    for (const t of taxBreakdown) {
      if (!t.glAccountId || !t.taxAmount) continue;
      if (!byAccount[t.glAccountId]) {
        byAccount[t.glAccountId] = { id: t.glAccountId, name: t.glAccountName, total: 0 };
      }
      byAccount[t.glAccountId].total += t.taxAmount;
    }
  }

  return Object.values(byAccount)
    .filter(a => a.total > 0)
    .map(a => ({
      account_id:    a.id,
      account_name:  a.name,
      debit_amount:  sign > 0 ? 0 : Math.round(a.total * 100) / 100,
      credit_amount: sign > 0 ? Math.round(a.total * 100) / 100 : 0,
      description:   `Tax: ${a.name}`,
    }));
}
