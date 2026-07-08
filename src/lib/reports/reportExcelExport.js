/**
 * reportExcelExport.js
 * Formatted .xlsx export engine using ExcelJS.
 * Enforces: group header tints + bold, sub-group indentation + bold,
 * leaf indentation regular, numeric currency formatting right-aligned.
 */
import ExcelJS from 'exceljs';
import { computeGroupTotals } from '@/lib/reports/reportColumnUtils';

// ── Colour palette ─────────────────────────────────────────────────────────────
const COLORS = {
  GROUP_FILLS: {
    Asset:     'DBEDFF',  // blue tint
    Liability: 'FDE8E8',  // red tint
    Equity:    'F3E8FD',  // purple tint
    Revenue:   'E8FDF3',  // green tint
    COGS:      'FFF3E0',  // amber tint
    OPEX:      'FFF3E0',
    Expense:   'FFF3E0',
    Other:     'F5F5F5',
  },
  DEFAULT_FILL:   'F5F5F5',
  SUBGROUP_FILL:  'EFF2F7',
  TOTAL_FILL:     'E2E8F0',
  HEADER_FILL:    '334155',  // dark slate
  ROOT_GROUP:     'F3F4F6',
  TEXT_WHITE:     'FFFFFF',
  TEXT_LIGHT:     'CBD5E1',
  BORDER_GRAY:    '94A3B8'
};

// ── Helper: trigger download in browser ───────────────────────────────────────
async function downloadWorkbook(wb, filename) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'report.xlsx';
  a.click();
  window.URL.revokeObjectURL(url);
}

// ── Helper: Add a styled cell ────────────────────────────────────────────────
function styleCell(cell, { bold = false, italic = false, fill = null, numFmt = null, indent = 0, color = null, borderTop = false } = {}) {
  cell.font = { name: 'Calibri', size: 10, bold, italic, color: color ? { argb: color } : undefined };
  
  cell.alignment = {
    wrapText: true,
    vertical: 'middle',
    horizontal: numFmt ? 'right' : 'left',
    indent: indent || 0,
  };
  
  if (fill) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: fill }
    };
  }
  
  if (numFmt) {
    cell.numFmt = numFmt;
  }
  
  if (borderTop) {
    cell.border = { top: { style: 'medium', color: { argb: COLORS.BORDER_GRAY } } };
  }
}

// ── Build worksheet for hierarchical financial data ──────────────────────────
async function buildFinancialSheet(wb, sheetName, { groups, columns, columnState, companyName, reportTitle, fromDate, toDate }) {
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  const colKeys = columns.filter(c => c.key !== 'account_type');
  const numCols = colKeys.filter(c => c.align === 'right');
  const colCount = colKeys.length;

  // Set column widths
  ws.columns = colKeys.map(col => {
    if (col.key === 'account_name') return { width: 38 };
    if (col.key === 'account_code') return { width: 12 };
    return { width: 18 };
  });

  let r = 1;

  // ── Corporate header block ──
  // Row 1: Company name
  let row = ws.getRow(r++);
  row.getCell(1).value = companyName || 'Company';
  for (let i = 1; i <= colCount; i++) {
    styleCell(row.getCell(i), { fill: COLORS.HEADER_FILL });
  }
  row.getCell(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.TEXT_WHITE } };

  // Row 2: Report title
  row = ws.getRow(r++);
  row.getCell(1).value = reportTitle || 'Financial Report';
  for (let i = 1; i <= colCount; i++) {
    styleCell(row.getCell(i), { fill: COLORS.HEADER_FILL });
  }
  row.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.TEXT_WHITE } };

  // Row 3: Date range
  row = ws.getRow(r++);
  row.getCell(1).value = fromDate && toDate ? `Period: ${fromDate}  →  ${toDate}` : '';
  for (let i = 1; i <= colCount; i++) {
    styleCell(row.getCell(i), { fill: COLORS.HEADER_FILL });
  }
  row.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.TEXT_LIGHT } };

  // Row 4: Blank spacer
  r++;

  // ── Column header row ──
  row = ws.getRow(r++);
  colKeys.forEach((col, i) => {
    const cell = row.getCell(i + 1);
    cell.value = col.label;
    styleCell(cell, { bold: true, fill: COLORS.TOTAL_FILL });
  });

  // ── Data rows ──
  const grandTotals = {};
  numCols.forEach(c => { grandTotals[c.key] = 0; });

  groups.forEach(group => {
    const allChildren = group.children.filter(c => c.ledger_type === 'Sub Ledger' && c.account_code && c.account_code !== '—');
    const children = columnState.showZeroBalance
      ? allChildren
      : allChildren.filter(c => Math.abs(c.closing_balance || c.current_balance || 0) !== 0);
      
    if (children.length === 0 && !group._isControlAccount) return;

    const groupTotals = computeGroupTotals(children);

    // Group summary row
    row = ws.getRow(r++);
    colKeys.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      if (col.key === 'account_code') {
        cell.value = group.account_code || '';
        styleCell(cell, { bold: true, fill: COLORS.ROOT_GROUP });
      } else if (col.key === 'account_name') {
        cell.value = group.account_name;
        styleCell(cell, { bold: true, fill: COLORS.ROOT_GROUP, indent: 1 });
      } else {
        cell.value = Number(groupTotals[col.key] || 0);
        styleCell(cell, { bold: true, fill: COLORS.ROOT_GROUP, numFmt: '#,##0.00' });
      }
    });

    // Sub Ledger child rows
    children.forEach(acc => {
      row = ws.getRow(r++);
      colKeys.forEach((col, i) => {
        const cell = row.getCell(i + 1);
        const isNum = ['opening_balance','closing_balance','debit','credit'].includes(col.key);
        
        if (col.key === 'account_code') {
          cell.value = acc.account_code;
          styleCell(cell, {});
        } else if (col.key === 'account_name') {
          cell.value = acc.account_name;
          styleCell(cell, { indent: 2 });
        } else if (isNum) {
          cell.value = Number(acc[col.key] || 0);
          styleCell(cell, { numFmt: '#,##0.00' });
        } else {
          cell.value = String(acc[col.key] || '');
          styleCell(cell, {});
        }
      });
    });

    // Accumulate grand totals
    numCols.forEach(k => { grandTotals[k.key] = (grandTotals[k.key] || 0) + (groupTotals[k.key] || 0); });
  });

  // ── Grand total footer ──
  r++; // Spacer row
  row = ws.getRow(r++);
  colKeys.forEach((col, i) => {
    const cell = row.getCell(i + 1);
    if (col.key === 'account_code') {
      cell.value = 'GRAND TOTAL';
      styleCell(cell, { bold: true, fill: COLORS.TOTAL_FILL, borderTop: true });
    } else if (col.key === 'account_name') {
      cell.value = '';
      styleCell(cell, { fill: COLORS.TOTAL_FILL, borderTop: true });
    } else {
      cell.value = Number(grandTotals[col.key] || 0);
      styleCell(cell, { bold: true, fill: COLORS.TOTAL_FILL, borderTop: true, numFmt: '#,##0.00' });
    }
  });
}

// ── Build worksheet for flat table reports ───────────────────────────────────
async function buildFlatSheet(wb, sheetName, { headers, rows, footer, companyName, reportTitle, fromDate, toDate }) {
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  const colCount = headers.length;

  ws.columns = headers.map((_, i) => ({ width: i === 0 || i === 1 ? 28 : 18 }));
  
  let r = 1;

  // Corporate header block
  let row = ws.getRow(r++);
  row.getCell(1).value = companyName || '';
  for (let i = 1; i <= colCount; i++) styleCell(row.getCell(i), { fill: COLORS.HEADER_FILL });
  row.getCell(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.TEXT_WHITE } };

  row = ws.getRow(r++);
  row.getCell(1).value = reportTitle || '';
  for (let i = 1; i <= colCount; i++) styleCell(row.getCell(i), { fill: COLORS.HEADER_FILL });
  row.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.TEXT_WHITE } };

  row = ws.getRow(r++);
  row.getCell(1).value = fromDate && toDate ? `Period: ${fromDate}  →  ${toDate}` : '';
  for (let i = 1; i <= colCount; i++) styleCell(row.getCell(i), { fill: COLORS.HEADER_FILL });
  row.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.TEXT_LIGHT } };

  r++; // spacer

  // Column headers
  row = ws.getRow(r++);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    styleCell(cell, { bold: true, fill: COLORS.TOTAL_FILL });
  });

  // Data rows
  rows.forEach(dataRow => {
    row = ws.getRow(r++);
    dataRow.forEach((val, j) => {
      const isNumericCol = j >= dataRow.length - 2;
      const raw = typeof val === 'string' ? val.replace(/^NPR\s*/,'').replace(/,/g,'') : val;
      const n = Number(raw);
      
      const cell = row.getCell(j + 1);
      if (isNumericCol && !isNaN(n) && String(raw).trim() !== '') {
        cell.value = n;
        styleCell(cell, { numFmt: '#,##0.00' });
      } else {
        cell.value = typeof val === 'object' ? String(val?.props?.children || val) : (val ?? '');
        styleCell(cell, {});
      }
    });
  });

  // Footer
  if (footer) {
    row = ws.getRow(r++);
    footer.forEach((val, j) => {
      const isNumericCol = j >= footer.length - 2;
      const raw = typeof val === 'string' ? val.replace(/^NPR\s*/,'').replace(/,/g,'') : val;
      const n = Number(raw);
      
      const cell = row.getCell(j + 1);
      if (isNumericCol && !isNaN(n) && String(raw).trim() !== '') {
        cell.value = n;
        styleCell(cell, { bold: true, fill: COLORS.TOTAL_FILL, borderTop: true, numFmt: '#,##0.00' });
      } else {
        cell.value = typeof val === 'string' ? val : (val ?? '');
        styleCell(cell, { bold: true, fill: COLORS.TOTAL_FILL, borderTop: true });
      }
    });
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Export hierarchical FinancialReportTable data as .xlsx
 * Note: Now async because exceljs writes to buffer asynchronously.
 */
export async function exportFinancialXLSX({ groups, columns, columnState, companyName, reportTitle, fromDate, toDate, filename }) {
  const wb = new ExcelJS.Workbook();
  await buildFinancialSheet(wb, reportTitle || 'Report', { groups, columns, columnState, companyName, reportTitle, fromDate, toDate });
  await downloadWorkbook(wb, filename || 'report.xlsx');
}

/**
 * Export flat table report data as .xlsx
 * Note: Now async.
 */
export async function exportFlatXLSX({ headers, rows, footer, companyName, reportTitle, fromDate, toDate, filename }) {
  const wb = new ExcelJS.Workbook();
  await buildFlatSheet(wb, reportTitle || 'Report', { headers, rows, footer, companyName, reportTitle, fromDate, toDate });
  await downloadWorkbook(wb, filename || 'report.xlsx');
}