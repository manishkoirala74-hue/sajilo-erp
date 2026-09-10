/**
 * Utility to calculate predicted document sequence numbers for UI previews across ERP modules.
 * Matches the PL/pgSQL database kernel dynamic sequence generator.
 */

export function getPredictedVoucherNumber(documentType, sequenceConfigs = [], activeFiscalYear = null, settings = {}) {
  const cfg = (sequenceConfigs || []).find(c => c.document_type === documentType);

  const defaultPrefixes = {
    FinancialVoucher: 'VOUCHER',
    SalesInvoice: settings?.invoice_prefix_sales || 'SI',
    PurchaseInvoice: settings?.invoice_prefix_purchase || 'PI',
    POSSale: 'POS',
    Quotation: 'QT',
    SalesOrder: 'SO',
    PurchaseOrder: 'PO',
    StockAdjustment: 'SA',
    SalesReturn: 'SR',
    PurchaseReturn: 'PR',
  };

  const rawPrefix = cfg?.prefix !== undefined && cfg?.prefix !== null
    ? cfg.prefix
    : (defaultPrefixes[documentType] || 'DOC');

  const prefix = rawPrefix ? (rawPrefix.endsWith('-') || rawPrefix.endsWith('/') ? rawPrefix : `${rawPrefix}-`) : '';
  const fyPart = (cfg?.include_fy_prefix ?? true) && activeFiscalYear?.fiscal_year_name ? `${activeFiscalYear.fiscal_year_name}-` : '';
  const startNo = Math.max(1, Number(cfg?.starting_number) || 1);
  const padding = Math.max(2, Math.min(10, Number(cfg?.padding) || 5));
  const numPart = String(startNo).padStart(padding, '0');
  const suffix = cfg?.suffix || '';

  return `${prefix}${fyPart}${numPart}${suffix}`;
}
