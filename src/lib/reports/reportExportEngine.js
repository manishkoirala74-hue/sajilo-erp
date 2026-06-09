/**
 * Report Export Engine
 * Handles CSV, and print/PDF exports with business header injection.
 */

import { downloadCSV } from './reportColumnUtils';
import { adToBS, formatBS, formatAD } from '@/lib/nepaliDate';

/**
 * Build the plain-text business header lines for CSV exports.
 */
function buildTextHeader(company, reportTitle, fromDate, toDate) {
  const lines = [];
  lines.push([company?.company_name || 'Company']);
  if (company?.address) lines.push([company.address]);
  if (company?.phone || company?.email) {
    lines.push([`${company.phone || ''} ${company.email ? '| ' + company.email : ''}`.trim()]);
  }
  lines.push(['']);
  lines.push([reportTitle]);

  if (fromDate && toDate) {
    const fromBS = adToBS(fromDate);
    const toBS   = adToBS(toDate);
    const bsStr  = fromBS && toBS ? `${formatBS(fromBS)} — ${formatBS(toBS)} (B.S)` : '';
    const adStr  = `${formatAD(fromDate)} — ${formatAD(toDate)} (A.D)`;
    lines.push([bsStr || adStr]);
    if (bsStr) lines.push([adStr]);
  }

  lines.push(['']);
  return lines;
}

/**
 * Export any tabular report as CSV with business header prepended.
 */
export function exportReportCSV({ company, reportTitle, filename, headers, rows, fromDate, toDate }) {
  const headerLines = buildTextHeader(company, reportTitle, fromDate, toDate);
  const allRows = [...headerLines, headers, ...rows];
  downloadCSV(filename, [], allRows.map(r => r));
  // Note: downloadCSV expects headers + rows — use a version that just concatenates
  exportRawCSV(filename, allRows);
}

function exportRawCSV(filename, rows) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map(r => (Array.isArray(r) ? r : [r]).map(escape).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export { exportRawCSV, buildTextHeader };

/**
 * Trigger browser print with a styled print stylesheet injected.
 */
export function printReport(printAreaId) {
  window.print();
}