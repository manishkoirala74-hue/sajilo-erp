/**
 * reportExcelExport.js
 * Formatted .xlsx export engine using ExcelJS.
 * Enforces: group header tints + bold, sub-group indentation + bold,
 * leaf indentation regular, numeric currency formatting right-aligned.
 */

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
  let processedRows = 0;
  for (const dataRow of rows) {
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

    processedRows++;
    if (processedRows % 100 === 0) {
      if (typeof window !== 'undefined' && window.onXlsxProgress) {
        window.onXlsxProgress(processedRows, rows.length);
      }
      await new Promise(resolve => setTimeout(resolve, 0)); // Yield to main thread to prevent tab crash
    }
  }

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
  try {
    const ExcelJS = await import('exceljs');
    const wb = new (ExcelJS.default || ExcelJS).Workbook();
    await buildFinancialSheet(wb, reportTitle || 'Report', { groups, columns, columnState, companyName, reportTitle, fromDate, toDate });
    await downloadWorkbook(wb, filename || 'report.xlsx');
  } finally {
    if (typeof window !== 'undefined' && window.onXlsxProgress) {
      window.onXlsxProgress(null);
    }
  }
}

/**
 * Export flat table report data as .xlsx
 * Note: Now async.
 */
export async function exportFlatXLSX({ headers, rows, footer, companyName, reportTitle, fromDate, toDate, filename }) {
  try {
    const ExcelJS = await import('exceljs');
    const wb = new (ExcelJS.default || ExcelJS).Workbook();
    await buildFlatSheet(wb, reportTitle || 'Report', { headers, rows, footer, companyName, reportTitle, fromDate, toDate });
    await downloadWorkbook(wb, filename || 'report.xlsx');
  } finally {
    if (typeof window !== 'undefined' && window.onXlsxProgress) {
      window.onXlsxProgress(null);
    }
  }
}

/**
 * Export full multi-sheet audit workbook for Bank Reconciliation Statement.
 * Contains: 
 *   Sheet 1: BRS Summary Schedule
 *   Sheet 2: Outstanding Cheques
 *   Sheet 3: Deposits in Transit
 *   Sheet 4: Cleared Transactions
 */
export async function exportBankReconciliationXLSX({
  companyName,
  bankAccount,
  statementDate,
  statementBalance,
  bookBalance,
  totalUnclearedCheques,
  totalUnclearedDeposits,
  bankCharges = 0,
  bankInterest = 0,
  adjustments = 0,
  adjustedBankBalance,
  adjustedBookBalance,
  differenceAmount,
  isReconciled,
  unclearedCheques = [],
  unclearedDeposits = [],
  clearedItems = [],
  filename
}) {
  try {
    const ExcelJS = await import('exceljs');
    const wb = new (ExcelJS.default || ExcelJS).Workbook();

    // ── Sheet 1: BRS Summary Walk ──
    const ws1 = wb.addWorksheet('BRS Summary');
    ws1.columns = [{ width: 42 }, { width: 30 }, { width: 22 }];

    let r = 1;
    // Header block
    let row = ws1.getRow(r++);
    row.getCell(1).value = companyName || 'Company';
    row.getCell(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.TEXT_WHITE } };
    for (let c = 1; c <= 3; c++) styleCell(row.getCell(c), { fill: COLORS.HEADER_FILL });

    row = ws1.getRow(r++);
    row.getCell(1).value = `BANK RECONCILIATION STATEMENT — ${bankAccount?.account_name || 'Bank Account'}`;
    row.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.TEXT_WHITE } };
    for (let c = 1; c <= 3; c++) styleCell(row.getCell(c), { fill: COLORS.HEADER_FILL });

    row = ws1.getRow(r++);
    row.getCell(1).value = `A/C No: ${bankAccount?.account_number || '—'}   |   Cutoff Date: ${statementDate}`;
    row.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.TEXT_LIGHT } };
    for (let c = 1; c <= 3; c++) styleCell(row.getCell(c), { fill: COLORS.HEADER_FILL });

    r++; // spacer

    // Column Headers
    row = ws1.getRow(r++);
    ['Particulars', 'Audit Note / References', 'Amount (NPR)'].forEach((h, i) => {
      const cell = row.getCell(i + 1);
      cell.value = h;
      styleCell(cell, { bold: true, fill: COLORS.TOTAL_FILL });
    });

    const addBrsRow = (label, note, val, opts = {}) => {
      const rw = ws1.getRow(r++);
      rw.getCell(1).value = label;
      rw.getCell(2).value = note || '';
      if (val !== null && val !== undefined && val !== '') {
        rw.getCell(3).value = Number(val);
        styleCell(rw.getCell(3), { numFmt: '#,##0.00', bold: opts.bold, fill: opts.fill, color: opts.textColor });
      }
      styleCell(rw.getCell(1), { bold: opts.bold, fill: opts.fill, color: opts.textColor });
      styleCell(rw.getCell(2), { bold: opts.bold, fill: opts.fill });
    };

    addBrsRow('Balance as per Bank Statement', 'Bank Statement Ending Balance', statementBalance);
    addBrsRow('Add: Deposits in Transit', `${unclearedDeposits.length} Uncleared Receipts`, totalUnclearedDeposits);
    addBrsRow('Less: Outstanding Cheques', `${unclearedCheques.length} Uncleared Payments`, -totalUnclearedCheques);
    addBrsRow('Adjusted Bank Balance', 'Theoretical Bank Position', adjustedBankBalance, { bold: true, fill: COLORS.SUBGROUP_FILL });

    r++; // spacer

    addBrsRow('Balance as per ERP General Ledger', 'Book Balance as of Cutoff', bookBalance);
    addBrsRow('Add: Bank Interest Received', 'Statement Credit', bankInterest);
    addBrsRow('Less: Bank Charges & Service Fees', 'Statement Debit', -bankCharges);
    addBrsRow('Add/Less: Adjustments & Book Errors', 'Reconciling Memos', adjustments);
    addBrsRow('Adjusted Book Balance', 'Verified Cash Position', adjustedBookBalance, { bold: true, fill: COLORS.SUBGROUP_FILL });

    r++; // spacer

    const diffOpts = {
      bold: true,
      fill: isReconciled ? 'E8FDF3' : 'FDE8E8',
      textColor: isReconciled ? '166534' : 'B91C1C'
    };
    addBrsRow('RECONCILIATION VARIANCE (DIFFERENCE)', isReconciled ? 'PERFECTLY RECONCILED' : 'DISCREPANCY DETECTED', differenceAmount, diffOpts);

    // ── Sheet 2: Outstanding Cheques ──
    const ws2 = wb.addWorksheet('Uncleared Cheques');
    ws2.columns = [{ width: 18 }, { width: 22 }, { width: 14 }, { width: 36 }, { width: 18 }];
    let r2 = 1;
    let headRow2 = ws2.getRow(r2++);
    ['Voucher No', 'Cheque / Ref No', 'Issue Date', 'Particulars / Beneficiary', 'Amount (NPR)'].forEach((h, i) => {
      const cell = headRow2.getCell(i + 1);
      cell.value = h;
      styleCell(cell, { bold: true, fill: COLORS.TOTAL_FILL });
    });
    unclearedCheques.forEach(c => {
      const rw = ws2.getRow(r2++);
      rw.getCell(1).value = c.voucher_no || '';
      rw.getCell(2).value = c.cheque_no || c.reference_no || '';
      rw.getCell(3).value = c.transaction_date || '';
      rw.getCell(4).value = c.narration || '';
      rw.getCell(5).value = Number(c.amount || 0);
      styleCell(rw.getCell(5), { numFmt: '#,##0.00' });
    });
    const totalRow2 = ws2.getRow(r2++);
    totalRow2.getCell(1).value = 'Total Outstanding Cheques';
    totalRow2.getCell(5).value = Number(totalUnclearedCheques);
    styleCell(totalRow2.getCell(1), { bold: true, fill: COLORS.TOTAL_FILL });
    styleCell(totalRow2.getCell(5), { bold: true, fill: COLORS.TOTAL_FILL, numFmt: '#,##0.00' });

    // ── Sheet 3: Deposits in Transit ──
    const ws3 = wb.addWorksheet('Uncleared Deposits');
    ws3.columns = [{ width: 18 }, { width: 22 }, { width: 14 }, { width: 36 }, { width: 18 }];
    let r3 = 1;
    let headRow3 = ws3.getRow(r3++);
    ['Voucher No', 'Slip / Ref No', 'Receipt Date', 'Particulars / Depositor', 'Amount (NPR)'].forEach((h, i) => {
      const cell = headRow3.getCell(i + 1);
      cell.value = h;
      styleCell(cell, { bold: true, fill: COLORS.TOTAL_FILL });
    });
    unclearedDeposits.forEach(d => {
      const rw = ws3.getRow(r3++);
      rw.getCell(1).value = d.voucher_no || '';
      rw.getCell(2).value = d.slip_no || d.reference_no || '';
      rw.getCell(3).value = d.transaction_date || '';
      rw.getCell(4).value = d.narration || '';
      rw.getCell(5).value = Number(d.amount || 0);
      styleCell(rw.getCell(5), { numFmt: '#,##0.00' });
    });
    const totalRow3 = ws3.getRow(r3++);
    totalRow3.getCell(1).value = 'Total Deposits in Transit';
    totalRow3.getCell(5).value = Number(totalUnclearedDeposits);
    styleCell(totalRow3.getCell(1), { bold: true, fill: COLORS.TOTAL_FILL });
    styleCell(totalRow3.getCell(5), { bold: true, fill: COLORS.TOTAL_FILL, numFmt: '#,##0.00' });

    // ── Sheet 4: Cleared Transactions ──
    if (clearedItems.length > 0) {
      const ws4 = wb.addWorksheet('Cleared Items');
      ws4.columns = [{ width: 18 }, { width: 20 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }];
      let r4 = 1;
      let headRow4 = ws4.getRow(r4++);
      ['Voucher No', 'Ref No', 'Date', 'Cleared Date', 'Type', 'Amount (NPR)'].forEach((h, i) => {
        const cell = headRow4.getCell(i + 1);
        cell.value = h;
        styleCell(cell, { bold: true, fill: COLORS.TOTAL_FILL });
      });
      clearedItems.forEach(item => {
        const rw = ws4.getRow(r4++);
        rw.getCell(1).value = item.voucher_no || '';
        rw.getCell(2).value = item.reference_no || item.cheque_no || item.slip_no || '';
        rw.getCell(3).value = item.transaction_date || '';
        rw.getCell(4).value = item.cleared_date || '';
        rw.getCell(5).value = item.line_type || '';
        rw.getCell(6).value = Number(item.amount || 0);
        styleCell(rw.getCell(6), { numFmt: '#,##0.00' });
      });
    }

    const safeFilename = filename || `BRS_${(bankAccount?.account_name || 'Bank').replace(/\s+/g, '_')}_${statementDate}.xlsx`;
    await downloadWorkbook(wb, safeFilename);
  } finally {
    if (typeof window !== 'undefined' && window.onXlsxProgress) {
      window.onXlsxProgress(null);
    }
  }
}

/**
 * Export enterprise multi-step Income Statement as .xlsx with native row.outlineLevel grouping.
 * Enables native expand/collapse [-] / [+] in Microsoft Excel and double accounting underlines.
 */
export async function exportProfitLossXLSX({
  sections,
  totals,
  childrenMap = {},
  filters = {},
  companyName,
  reportTitle = 'Income Statement',
  fromDate,
  toDate,
  filename = 'Income_Statement.xlsx'
}) {
  try {
    const ExcelJS = await import('exceljs');
    const wb = new (ExcelJS.default || ExcelJS).Workbook();
    const ws = wb.addWorksheet('Income Statement');

    // Enable native Excel row outlining with collapse toggles positioned above/left
    ws.properties.outlineProperties = {
      summaryBelow: false,
      summaryRight: false,
    };

    ws.columns = [
      { key: 'particulars', width: 44 },
      { key: 'notes', width: 12 },
      { key: 'cur', width: 22 },
      { key: 'comp', width: 22 },
    ];

    let r = 1;

    // ── Corporate Header Block ──
    let row = ws.getRow(r++);
    row.getCell(1).value = companyName || 'Company';
    row.getCell(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.TEXT_WHITE } };
    for (let c = 1; c <= 4; c++) styleCell(row.getCell(c), { fill: COLORS.HEADER_FILL });

    row = ws.getRow(r++);
    row.getCell(1).value = reportTitle.toUpperCase();
    row.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.TEXT_WHITE } };
    for (let c = 1; c <= 4; c++) styleCell(row.getCell(c), { fill: COLORS.HEADER_FILL });

    row = ws.getRow(r++);
    row.getCell(1).value = fromDate && toDate ? `For the period: ${fromDate}  →  ${toDate} (in NPR)` : 'Amounts in NPR';
    row.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.TEXT_LIGHT } };
    for (let c = 1; c <= 4; c++) styleCell(row.getCell(c), { fill: COLORS.HEADER_FILL });

    r++; // Spacer row

    // Column Headers
    row = ws.getRow(r++);
    ['Financial Particulars', 'Notes', 'Current Period (NPR)', 'Comparative Period (NPR)'].forEach((h, i) => {
      const cell = row.getCell(i + 1);
      cell.value = h;
      styleCell(cell, { bold: true, fill: COLORS.TOTAL_FILL });
    });

    const numFormat = '#,##0.00;(#,##0.00);"―"';

    // Helper: Add section header row (outlineLevel 0)
    const addSectionHeader = (title) => {
      row = ws.getRow(r++);
      row.outlineLevel = 0;
      row.getCell(1).value = title;
      for (let c = 1; c <= 4; c++) {
        styleCell(row.getCell(c), { bold: true, fill: 'F1F5F9' });
      }
    };

    // Helper: Add sub-section label (outlineLevel 0 or 1)
    const addSubSectionLabel = (label, outlineLevel = 0) => {
      row = ws.getRow(r++);
      row.outlineLevel = outlineLevel;
      row.getCell(1).value = label;
      styleCell(row.getCell(1), { bold: true, italic: true, indent: outlineLevel });
    };

    // Helper: Recursive Account Node with outlineLevel
    const addAccountNode = (account, outlineLevel = 1, isDeduction = false) => {
      if (!filters.showZeroBalance && Math.abs(account.rollup_current || 0) < 0.01 && Math.abs(account.rollup_comparative || 0) < 0.01) {
        return;
      }
      const children = childrenMap[account.id] || [];
      const isGroup = account.ledger_type === 'Group Ledger' || children.length > 0;

      row = ws.getRow(r++);
      row.outlineLevel = outlineLevel;

      const particularsCell = row.getCell(1);
      particularsCell.value = account.account_name;
      styleCell(particularsCell, { bold: isGroup, indent: outlineLevel });

      const curVal = Number(account.rollup_current || 0);
      const compVal = Number(account.rollup_comparative || 0);

      const curCell = row.getCell(3);
      curCell.value = isDeduction && curVal > 0 ? -curVal : curVal;
      styleCell(curCell, { bold: isGroup, numFmt: numFormat });

      const compCell = row.getCell(4);
      compCell.value = isDeduction && compVal > 0 ? -compVal : compVal;
      styleCell(compCell, { bold: isGroup, numFmt: numFormat, color: '64748B' });

      // Recursively append child accounts
      if (children.length > 0) {
        children.forEach(child => addAccountNode(child, outlineLevel + 1, isDeduction));
      }
    };

    // Helper: Add Subtotal / Total Row
    const addTotalRow = (title, curAmount, compAmount, isFinal = false, fillColor = 'F8FAFC') => {
      row = ws.getRow(r++);
      row.outlineLevel = 0;

      const labelCell = row.getCell(1);
      labelCell.value = title;
      styleCell(labelCell, { bold: true, fill: fillColor, borderTop: true });

      const curCell = row.getCell(3);
      curCell.value = Number(curAmount || 0);
      styleCell(curCell, { bold: true, fill: fillColor, numFmt: numFormat, borderTop: true });

      const compCell = row.getCell(4);
      compCell.value = Number(compAmount || 0);
      styleCell(compCell, { bold: true, fill: fillColor, numFmt: numFormat, borderTop: true });

      if (isFinal) {
        // Double accounting underline for final Net Income
        labelCell.border = { top: { style: 'thin', color: { argb: '334155' } }, bottom: { style: 'double', color: { argb: '0F172A' } } };
        curCell.border = { top: { style: 'thin', color: { argb: '334155' } }, bottom: { style: 'double', color: { argb: '0F172A' } } };
        compCell.border = { top: { style: 'thin', color: { argb: '334155' } }, bottom: { style: 'double', color: { argb: '0F172A' } } };
        labelCell.font = { name: 'Calibri', size: 11, bold: true };
        curCell.font = { name: 'Calibri', size: 11, bold: true };
        compCell.font = { name: 'Calibri', size: 11, bold: true };
      }
    };

    // ── 1. Gross Operating Revenue ──
    addSectionHeader('1. Gross Operating Revenue');
    addSubSectionLabel('Sales Revenue', 1);
    (sections.revenue?.accounts || []).forEach(a => addAccountNode(a, 1, false));

    if ((sections.sales_returns?.accounts || []).length > 0) {
      addSubSectionLabel('Less: Sales Returns & Allowances', 1);
      sections.sales_returns.accounts.forEach(a => addAccountNode(a, 1, true));
    }
    addTotalRow('Net Sales Revenue', totals.net_sales_cur, totals.net_sales_comp, false, 'F1F5F9');

    // ── 2. Cost of Goods Sold ──
    addSectionHeader('2. Cost of Goods Sold (COGS)');
    addSubSectionLabel('Direct Cost Accounts', 1);
    if ((sections.cogs?.accounts || []).length > 0) {
      sections.cogs.accounts.forEach(a => addAccountNode(a, 1, true));
    }
    addTotalRow('Total Cost of Goods Sold', -(totals.cogs_total_cur || sections.cogs?.cur || 0), -(totals.cogs_total_comp || sections.cogs?.comp || 0), false, 'F1F5F9');
    addTotalRow('GROSS PROFIT', totals.gross_profit_cur, totals.gross_profit_comp, false, 'E0E7FF');

    // ── 3. Operating Expenses ──
    addSectionHeader('3. Operating Expenses');
    if ((sections.opex_selling?.accounts || []).length > 0) {
      addSubSectionLabel('Selling & Distribution Expenses', 1);
      sections.opex_selling.accounts.forEach(a => addAccountNode(a, 1, true));
    }
    if ((sections.opex_admin?.accounts || []).length > 0) {
      addSubSectionLabel('General & Administrative Expenses', 1);
      sections.opex_admin.accounts.forEach(a => addAccountNode(a, 1, true));
    }
    addTotalRow('Total Operating Expenses', -(totals.total_opex_cur || (sections.opex_admin?.cur + sections.opex_selling?.cur) || 0), -(totals.total_opex_comp || (sections.opex_admin?.comp + sections.opex_selling?.comp) || 0), false, 'F1F5F9');
    addTotalRow('OPERATING PROFIT (EBIT)', totals.op_profit_cur, totals.op_profit_comp, false, 'DCFCE7');

    // ── 4. Non-Operating Income & Finance Costs ──
    if ((sections.non_op_income?.accounts || []).length > 0 || (sections.finance_cost?.accounts || []).length > 0) {
      addSectionHeader('4. Non-Operating Income & Finance Costs');
      if ((sections.non_op_income?.accounts || []).length > 0) {
        addSubSectionLabel('Add: Other / Non-Operating Income', 1);
        sections.non_op_income.accounts.forEach(a => addAccountNode(a, 1, false));
      }
      if ((sections.finance_cost?.accounts || []).length > 0) {
        addSubSectionLabel('Less: Finance Costs', 1);
        sections.finance_cost.accounts.forEach(a => addAccountNode(a, 1, true));
      }
    }
    addTotalRow('NET PROFIT BEFORE TAX (PBT)', totals.pbt_cur, totals.pbt_comp, false, 'F8FAFC');

    // ── 5. Taxes & Net Income ──
    if ((sections.tax?.accounts || []).length > 0) {
      addSubSectionLabel('Less: Provision for Corporate Income Tax', 1);
      sections.tax.accounts.forEach(a => addAccountNode(a, 1, true));
    }
    addTotalRow('NET INCOME FOR THE PERIOD', totals.net_profit_cur, totals.net_profit_comp, true, 'F1F5F9');

    // ── 6. Unmapped / Suspense if any ──
    if ((sections.suspense?.accounts || []).length > 0) {
      addSectionHeader('⚠️ Unmapped / Suspense Accounts');
      sections.suspense.accounts.forEach(a => addAccountNode(a, 1, false));
    }

    await downloadWorkbook(wb, filename);
  } finally {
    if (typeof window !== 'undefined' && window.onXlsxProgress) {
      window.onXlsxProgress(null);
    }
  }
}

/**
 * Export Audit & Compliance Log as .xlsx with chain-of-custody stamp.
 * Stamped with the exporting user's identity and exact UTC timestamp.
 */
export async function exportAuditLogXLSX({
  title = 'System Audit Log',
  headers = [],
  rows = [],
  currentUser = null,
  companyName = 'Company',
  fromDate,
  toDate,
  filename = 'audit_log.xlsx'
}) {
  try {
    const ExcelJS = await import('exceljs');
    const wb = new (ExcelJS.default || ExcelJS).Workbook();
    const ws = wb.addWorksheet('Audit Log');

    const colCount = Math.max(headers.length, 5);
    ws.columns = headers.map((_, i) => ({ width: i === 0 ? 22 : i === 1 ? 26 : 28 }));

    let r = 1;

    // Header Block
    let row = ws.getRow(r++);
    row.getCell(1).value = companyName;
    row.getCell(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.TEXT_WHITE } };
    for (let c = 1; c <= colCount; c++) styleCell(row.getCell(c), { fill: '0F172A' }); // Slate-900

    row = ws.getRow(r++);
    row.getCell(1).value = title.toUpperCase();
    row.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.TEXT_WHITE } };
    for (let c = 1; c <= colCount; c++) styleCell(row.getCell(c), { fill: '0F172A' });

    // Chain-of-Custody Metadata Block
    const nowUTC = new Date().toISOString();
    const nowLocal = new Date().toLocaleString();
    const userLabel = currentUser?.full_name || currentUser?.name || currentUser?.email || 'System Administrator';
    const userEmail = currentUser?.email ? ` (${currentUser.email})` : '';

    row = ws.getRow(r++);
    row.getCell(1).value = `CONFIDENTIAL AUDIT LOG — Official record for compliance, regulatory inspection, and internal controls.`;
    row.getCell(1).font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: '94A3B8' } };
    for (let c = 1; c <= colCount; c++) styleCell(row.getCell(c), { fill: '0F172A' });

    row = ws.getRow(r++);
    row.getCell(1).value = `Generated By: ${userLabel}${userEmail}   |   Timestamp (UTC): ${nowUTC}   |   Local: ${nowLocal}`;
    row.getCell(1).font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'CBD5E1' } };
    for (let c = 1; c <= colCount; c++) styleCell(row.getCell(c), { fill: '0F172A' });

    if (fromDate && toDate) {
      row = ws.getRow(r++);
      row.getCell(1).value = `Audit Period Filter: ${fromDate}  →  ${toDate}`;
      row.getCell(1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: '94A3B8' } };
      for (let c = 1; c <= colCount; c++) styleCell(row.getCell(c), { fill: '0F172A' });
    }

    r++; // Spacer row

    // Table Column Headers
    row = ws.getRow(r++);
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      cell.value = h;
      styleCell(cell, { bold: true, fill: COLORS.TOTAL_FILL });
    });

    // Data rows
    let processedRows = 0;
    for (const dataRow of rows) {
      row = ws.getRow(r++);
      dataRow.forEach((val, j) => {
        const cell = row.getCell(j + 1);
        cell.value = typeof val === 'object' ? String(val?.props?.children || val) : (val ?? '');
        styleCell(cell, {});
      });

      processedRows++;
      if (processedRows % 100 === 0) {
        if (typeof window !== 'undefined' && window.onXlsxProgress) {
          window.onXlsxProgress(processedRows, rows.length);
        }
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    await downloadWorkbook(wb, filename);
  } finally {
    if (typeof window !== 'undefined' && window.onXlsxProgress) {
      window.onXlsxProgress(null);
    }
  }
}