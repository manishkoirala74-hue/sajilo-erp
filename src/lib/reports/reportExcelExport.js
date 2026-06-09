/**
 * reportExcelExport.js
 * Formatted .xlsx export engine using SheetJS (xlsx).
 * Enforces: group header tints + bold, sub-group indentation + bold,
 * leaf indentation regular, numeric currency formatting right-aligned.
 */
import * as XLSX from 'xlsx';
import { computeGroupTotals } from '@/lib/reports/reportColumnUtils';

// ── Colour palette ─────────────────────────────────────────────────────────────
const GROUP_FILLS = {
  Asset:     'FFDBEDFF',  // blue tint
  Liability: 'FFFDE8E8',  // red tint
  Equity:    'FFF3E8FD',  // purple tint
  Revenue:   'FFE8FDF3',  // green tint
  COGS:      'FFFFF3E0',  // amber tint
  OPEX:      'FFFFF3E0',
  Expense:   'FFFFF3E0',
  Other:     'FFF5F5F5',
};
const DEFAULT_FILL   = 'FFF5F5F5';
const SUBGROUP_FILL  = 'FFEFF2F7';
const TOTAL_FILL     = 'FFE2E8F0';
const HEADER_FILL    = 'FF334155';  // dark slate

// ── Helper: create a cell object with full style ──────────────────────────────
function cell(value, { bold = false, italic = false, fill = null, numFmt = null, indent = 0, color = null, borderTop = false } = {}) {
  const c = { v: value, t: typeof value === 'number' ? 'n' : 's' };
  const style = {};

  style.font = { name: 'Calibri', sz: 10, bold, italic, color: color ? { rgb: color } : undefined };
  style.alignment = {
    wrapText: true,
    vertical: 'center',
    horizontal: typeof value === 'number' ? 'right' : 'left',
    indent: indent || 0,
  };
  if (fill) style.fill = { patternType: 'solid', fgColor: { rgb: fill } };
  if (numFmt) { c.z = numFmt; style.numFmt = numFmt; }
  if (borderTop) {
    style.border = { top: { style: 'medium', color: { rgb: 'FF94A3B8' } } };
  }
  c.s = style;
  return c;
}

function numCell(value, fill = null, bold = false, borderTop = false) {
  const n = Number(value || 0);
  return cell(n, { bold, fill, numFmt: '#,##0.00', borderTop });
}

// ── Build worksheet rows for hierarchical financial data ──────────────────────
function buildFinancialSheet(wb, sheetName, { groups, columns, columnState, companyName, reportTitle, fromDate, toDate }) {
  const ws = {};
  const colKeys   = columns.filter(c => c.key !== 'account_type');
  const numCols   = colKeys.filter(c => c.align === 'right');
  const colCount  = colKeys.length;
  const R         = { current: 0 }; // mutable row counter

  const addr = (r, c) => XLSX.utils.encode_cell({ r, c });
  const push  = (rowCells) => {
    rowCells.forEach((c, ci) => { if (c) ws[addr(R.current, ci)] = c; });
    R.current++;
  };

  // ── Corporate header block (rows 1-4) ──
  // Row 1: Company name — Bold 16pt
  push([{ v: companyName || 'Company', t: 's', s: { font: { name: 'Calibri', sz: 16, bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: HEADER_FILL } }, alignment: { horizontal: 'left', vertical: 'center' } } },
    ...Array(colCount - 1).fill(cell('', { fill: HEADER_FILL }))]);
  // Row 2: Report title — Bold 12pt
  push([{ v: reportTitle || 'Financial Report', t: 's', s: { font: { name: 'Calibri', sz: 12, bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: HEADER_FILL } }, alignment: { horizontal: 'left', vertical: 'center' } } },
    ...Array(colCount - 1).fill(cell('', { fill: HEADER_FILL }))]);
  // Row 3: Date range — Italic 10pt
  push([{ v: fromDate && toDate ? `Period: ${fromDate}  →  ${toDate}` : '', t: 's', s: { font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: 'FFCBD5E1' } }, fill: { patternType: 'solid', fgColor: { rgb: HEADER_FILL } }, alignment: { horizontal: 'left', vertical: 'center' } } },
    ...Array(colCount - 1).fill(cell('', { fill: HEADER_FILL }))]);
  // Row 4: Blank spacer
  push(Array(colCount).fill(cell('')));

  // ── Column header row ──
  push(colKeys.map(col => cell(col.label, { bold: true, fill: TOTAL_FILL })));

  // ── Data rows ──
  const grandTotals = {};
  numCols.forEach(c => { grandTotals[c.key] = 0; });

  groups.forEach(group => {
    // Only export persisted Sub Ledger children (no ghost/dynamic rows)
    const allChildren = group.children.filter(c => c.ledger_type === 'Sub Ledger' && c.account_code && c.account_code !== '—');
    const children = columnState.showZeroBalance
      ? allChildren
      : allChildren.filter(c => Math.abs(c.closing_balance || c.current_balance || 0) !== 0);
    if (children.length === 0 && !group._isControlAccount) return;

    // Use computeGroupTotals (leaf-only) to match screen-state exactly
    const groupTotals = computeGroupTotals(children);

    // Group summary row — light gray #F3F4F6, bold, Col1=Code Col2=Name (2-space indent)
    const rootGroupFill = 'FFF3F4F6';
    push(colKeys.map(col => {
      if (col.key === 'account_code') return cell(group.account_code || '', { bold: true, fill: rootGroupFill });
      if (col.key === 'account_name') return cell(`  ${group.account_name}`, { bold: true, fill: rootGroupFill });
      return numCell(groupTotals[col.key] ?? 0, rootGroupFill, true);
    }));

    // Sub Ledger child rows — Col1=actual account_code, Col2=4-space indent name
    children.forEach(acc => {
      push(colKeys.map(col => {
        if (col.key === 'account_code') return cell(acc.account_code, { fill: null });
        if (col.key === 'account_name') return cell(`    ${acc.account_name}`, { fill: null });
        const isNum = ['opening_balance','closing_balance','debit','credit'].includes(col.key);
        return isNum ? numCell(acc[col.key] ?? 0) : cell(String(acc[col.key] ?? ''));
      }));
    });

    // Accumulate grand totals from leaf-only group totals
    numCols.forEach(k => { grandTotals[k.key] = (grandTotals[k.key] || 0) + (groupTotals[k.key] || 0); });
  });

  // ── Grand total footer ──
  push(Array(colCount).fill(cell(''))); // spacer
  push(colKeys.map((col, i) => {
    if (col.key === 'account_code') return cell('GRAND TOTAL', { bold: true, fill: TOTAL_FILL, borderTop: true });
    if (col.key === 'account_name') return cell('', { fill: TOTAL_FILL, borderTop: true });
    return numCell(grandTotals[col.key] ?? 0, TOTAL_FILL, true, true);
  }));

  // ── Column widths ──
  ws['!cols'] = colKeys.map(col => {
    if (col.key === 'account_name') return { wch: 38 };
    if (col.key === 'account_code') return { wch: 10 };
    return { wch: 18 };
  });

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: R.current - 1, c: colCount - 1 } });
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
}

// ── Build worksheet for flat table reports ────────────────────────────────────
function buildFlatSheet(wb, sheetName, { headers, rows, footer, companyName, reportTitle, fromDate, toDate }) {
  const ws = {};
  const colCount = headers.length;
  let r = 0;
  const addr = (row, col) => XLSX.utils.encode_cell({ r: row, c: col });

  const push = (rowCells) => {
    rowCells.forEach((c, ci) => { if (c) ws[addr(r, ci)] = c; });
    r++;
  };

  // Corporate header block — same 4-row structure as financial sheets
  push([{ v: companyName || '', t: 's', s: { font: { name: 'Calibri', sz: 16, bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: HEADER_FILL } }, alignment: { horizontal: 'left', vertical: 'center' } } },
    ...Array(colCount - 1).fill(cell('', { fill: HEADER_FILL }))]);
  push([{ v: reportTitle || '', t: 's', s: { font: { name: 'Calibri', sz: 12, bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: HEADER_FILL } }, alignment: { horizontal: 'left', vertical: 'center' } } },
    ...Array(colCount - 1).fill(cell('', { fill: HEADER_FILL }))]);
  push([{ v: fromDate && toDate ? `Period: ${fromDate}  →  ${toDate}` : '', t: 's', s: { font: { name: 'Calibri', sz: 10, italic: true, color: { rgb: 'FFCBD5E1' } }, fill: { patternType: 'solid', fgColor: { rgb: HEADER_FILL } }, alignment: { horizontal: 'left', vertical: 'center' } } },
    ...Array(colCount - 1).fill(cell('', { fill: HEADER_FILL }))]);
  push(Array(colCount).fill(cell('')));

  // Column headers
  push(headers.map(h => cell(h, { bold: true, fill: TOTAL_FILL })));

  // Data rows
  rows.forEach(row => {
    push(row.map((val, j) => {
      const isNumericCol = j >= row.length - 2;
      const raw = typeof val === 'string' ? val.replace(/^NPR\s*/,'').replace(/,/g,'') : val;
      const n = Number(raw);
      if (isNumericCol && !isNaN(n) && String(raw).trim() !== '') return numCell(n);
      return cell(typeof val === 'object' ? String(val?.props?.children || val) : (val ?? ''));
    }));
  });

  // Footer
  if (footer) {
    push(footer.map((val, j) => {
      const isNumericCol = j >= footer.length - 2;
      const raw = typeof val === 'string' ? val.replace(/^NPR\s*/,'').replace(/,/g,'') : val;
      const n = Number(raw);
      if (isNumericCol && !isNaN(n) && String(raw).trim() !== '') return numCell(n, TOTAL_FILL, true);
      return cell(typeof val === 'string' ? val : (val ?? ''), { bold: true, fill: TOTAL_FILL });
    }));
  }

  ws['!cols'] = headers.map((_, i) => (i === 0 || i === 1 ? { wch: 28 } : { wch: 18 }));
  ws['!ref']  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: colCount - 1 } });
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Export hierarchical FinancialReportTable data as .xlsx
 */
export function exportFinancialXLSX({ groups, columns, columnState, companyName, reportTitle, fromDate, toDate, filename }) {
  const wb = XLSX.utils.book_new();
  buildFinancialSheet(wb, reportTitle || 'Report', { groups, columns, columnState, companyName, reportTitle, fromDate, toDate });
  XLSX.writeFile(wb, filename || 'report.xlsx');
}

/**
 * Export flat table report data as .xlsx
 */
export function exportFlatXLSX({ headers, rows, footer, companyName, reportTitle, fromDate, toDate, filename }) {
  const wb = XLSX.utils.book_new();
  buildFlatSheet(wb, reportTitle || 'Report', { headers, rows, footer, companyName, reportTitle, fromDate, toDate });
  XLSX.writeFile(wb, filename || 'report.xlsx');
}