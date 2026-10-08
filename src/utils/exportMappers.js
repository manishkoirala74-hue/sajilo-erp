import { ACCOUNTING_TOTAL_STYLE, NEGATIVE_TEXT_COLOR, POSITIVE_TEXT_COLOR } from '@/constants/pdfStyles';

/**
 * Creates the formatted 2D array for jspdf-autotable.
 */
export const mapProfitLossForExport = (reportData, context) => {
  const { filters, expanded, childrenMap, sections, totals, fmtAcct } = context;
  const pdfRows = [];

  const addNode = (account, level, isDeduction) => {
    if (!filters.showZeroBalance && Math.abs(account.rollup_current) < 0.01 && Math.abs(account.rollup_comparative) < 0.01) return;
    const children = childrenMap[account.id] || [];
    const isGroup = account.ledger_type === 'Group Ledger' || children.length > 0;
    
    const row = [account.account_name, '', fmtAcct(account.rollup_current, isDeduction), fmtAcct(account.rollup_comparative, isDeduction)];
    row.level = level;
    row.isGroup = isGroup;
    pdfRows.push(row);

    if (isGroup && (expanded[account.id] !== undefined ? expanded[account.id] : filters.expandAll)) {
      children.forEach(c => addNode(c, level + 1, isDeduction));
    }
  };
  
  const addSection = (title, sectionObj, isDeduction = false, isHeader = false) => {
    if (title) {
       const r = [
         { content: title, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [240, 244, 248] } },
         '', ''
       ];
       r.level = 0; r.isGroup = true;
       pdfRows.push(r);
    }
    sectionObj.accounts.forEach(a => addNode(a, isHeader ? 1 : 0, isDeduction));
  };

  const addTotal = (title, cur, comp) => {
    const curStyle = { ...ACCOUNTING_TOTAL_STYLE, textColor: cur < 0 ? NEGATIVE_TEXT_COLOR : POSITIVE_TEXT_COLOR };
    const compStyle = { ...ACCOUNTING_TOTAL_STYLE, textColor: comp < 0 ? NEGATIVE_TEXT_COLOR : POSITIVE_TEXT_COLOR };

    const r = [
      { content: title, colSpan: 2, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: fmtAcct(cur, cur < 0), styles: curStyle },
      { content: fmtAcct(comp, comp < 0), styles: compStyle }
    ];
    r.level = 0; r.isGroup = true;
    pdfRows.push(r);
  };

  const rTop = [
    { content: '1. Gross Operating Revenue', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [240, 244, 248] } },
    '', ''
  ];
  rTop.level = 0; rTop.isGroup = true;
  pdfRows.push(rTop);

  addSection('Sales Revenue', sections.revenue, false, true);
  if (sections.sales_returns.accounts.length > 0) {
    addSection('Less: Sales Returns & Allowances', sections.sales_returns, true, true);
  }
  addTotal('Net Sales Revenue', totals.net_sales_cur, totals.net_sales_comp);
  
  addSection(null, sections.cogs, false);
  addTotal('Gross Profit', totals.gross_profit_cur, totals.gross_profit_comp);
  
  const r3 = [
    { content: '3. Operating Expenses', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [240, 244, 248] } },
    '', ''
  ];
  r3.level = 0; r3.isGroup = true;
  pdfRows.push(r3);
  
  if (sections.opex_selling.accounts.length > 0) {
    addSection('Selling & Distribution Expenses', sections.opex_selling, true, true);
  }
  if (sections.opex_admin.accounts.length > 0) {
    addSection('General & Administrative Expenses', sections.opex_admin, true, true);
  }
  addTotal('Operating Profit (EBITDA)', totals.op_profit_cur, totals.op_profit_comp);
  
  const r4 = [
    { content: '4. Non-Operating Income / (Expense)', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [240, 244, 248] } },
    '', ''
  ];
  r4.level = 0; r4.isGroup = true;
  pdfRows.push(r4);
  
  addSection('Other Income', sections.non_op_income, false, true);
  addSection('Finance Costs', sections.finance_cost, true, true);
  addTotal('Profit Before Tax (PBT)', totals.pbt_cur, totals.pbt_comp);
  
  const r5 = [
    { content: '5. Taxes', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [240, 244, 248] } },
    '', ''
  ];
  r5.level = 0; r5.isGroup = true;
  pdfRows.push(r5);
  
  addSection(null, sections.tax, true);
  addTotal('Net Profit After Tax', totals.net_profit_cur, totals.net_profit_comp);

  if (sections.suspense.accounts.length > 0) {
    addSection('Unmapped / Suspense Accounts', sections.suspense, false, true);
  }
  
  return pdfRows;
};
