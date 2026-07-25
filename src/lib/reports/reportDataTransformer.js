/**
 * Universal Data Transformer for PDF and Excel Exports
 * Converts flat database rows into a standardized hierarchical `reportNodes` array with `row_type` semantics.
 */

import { adToBS, formatBS } from '../nepaliDate.js';

// Native Intl Formatter for localized South Asian numbering system (NPR)
const nprFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/**
 * Coerce null/undefined text fields to empty strings to protect WebAssembly engines like Yoga.
 */
function coerceNulls(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  for (const key in obj) {
    if (obj[key] === null || obj[key] === undefined) {
      obj[key] = '';
    } else if (typeof obj[key] === 'object') {
      coerceNulls(obj[key]);
    }
  }
  return obj;
}

/**
 * Formats a numeric value based on its formatType.
 * If formatType is 'currency' and value is exactly 0, returns '-'.
 */
function formatValue(val, formatType) {
  if (formatType === 'currency') {
    const num = Number(val) || 0;
    if (Math.abs(num) < 0.001) return '-';
    // Format negative numbers with parentheses
    if (num < 0) return `(${nprFormatter.format(Math.abs(num))})`;
    return nprFormatter.format(num);
  }
  return val;
}

/**
 * Recursive bottom-up pruning to eliminate Empty Parents.
 * Returns true if the node should be kept, false if it should be pruned.
 */
function pruneTree(node) {
  // If it's a leaf node (account)
  if (!node.children || node.children.length === 0) {
    if (node.row_type === 'account' || node.row_type === 'transaction') {
      // Keep if it has non-zero balances
      return Math.abs(node.balances?.current || 0) > 0.001 || Math.abs(node.balances?.comparative || 0) > 0.001;
    }
    // Empty headers should be pruned
    if (node.row_type === 'header' || node.row_type === 'kpi_primary' || node.row_type === 'kpi_secondary') {
      return Math.abs(node.balances?.current || 0) > 0.001 || Math.abs(node.balances?.comparative || 0) > 0.001;
    }
    return false;
  }

  // Post-order traversal: filter children first
  node.children = node.children.filter(pruneTree);

  // After filtering children, if children are empty and balance is 0, prune this parent
  if (node.children.length === 0) {
     return Math.abs(node.balances?.current || 0) > 0.001 || Math.abs(node.balances?.comparative || 0) > 0.001;
  }

  return true; // Keep parent if it has valid children
}

/**
 * Transforms flat Profit & Loss data into a semantic hierarchy.
 */
function transformProfitLoss(rawData, skipZeroRows) {
  const sections = {
    revenue: { name: 'Gross Operating Revenue', children: [], cur: 0, comp: 0 },
    sales_returns: { name: 'Less: Sales Returns', children: [], cur: 0, comp: 0 },
    cogs: { name: 'Cost of Goods Sold', children: [], cur: 0, comp: 0 },
    opex_admin: { name: 'Administrative Expenses', children: [], cur: 0, comp: 0 },
    opex_selling: { name: 'Selling & Distribution Expenses', children: [], cur: 0, comp: 0 },
    non_op_income: { name: 'Non-Operating Income', children: [], cur: 0, comp: 0 },
    finance_cost: { name: 'Finance Costs', children: [], cur: 0, comp: 0 },
    tax: { name: 'Corporate Taxes', children: [], cur: 0, comp: 0 }
  };

  // 1. Group by statement_group / subgroup
  rawData.forEach(a => {
    // Convert strings to numbers for accurate math
    const currentBal = Number(a.current_balance) || 0;
    const compBal = Number(a.comparative_balance) || 0;

    const node = {
      name: a.account_name,
      row_type: 'account',
      balances: {
        current: currentBal,
        comparative: compBal
      },
      data: {
        account_name: a.account_name,
        current_period: currentBal,
        comparative_period: compBal
      }
    };

    switch (a.statement_group) {
      case 'Revenue':
        if (a.statement_subgroup === 'Sales Returns' || a.statement_subgroup === 'Sales Discounts') {
          sections.sales_returns.children.push(node);
        } else {
          sections.revenue.children.push(node);
        }
        break;
      case 'Cost of Goods Sold':
        sections.cogs.children.push(node);
        break;
      case 'Operating Expenses':
        if (a.statement_subgroup === 'Selling Expenses') {
          sections.opex_selling.children.push(node);
        } else {
          sections.opex_admin.children.push(node);
        }
        break;
      case 'Non-Operating Income':
        sections.non_op_income.children.push(node);
        break;
      case 'Finance Costs':
        sections.finance_cost.children.push(node);
        break;
      case 'Taxes':
        sections.tax.children.push(node);
        break;
    }
  });

  // Calculate section sums
  Object.values(sections).forEach(s => {
    s.cur = s.children.reduce((sum, child) => sum + child.balances.current, 0);
    s.comp = s.children.reduce((sum, child) => sum + child.balances.comparative, 0);
  });

  // KPIs
  const net_sales_cur = sections.revenue.cur + sections.sales_returns.cur;
  const net_sales_comp = sections.revenue.comp + sections.sales_returns.comp;
  
  const cogs_total_cur = sections.cogs.cur;
  const cogs_total_comp = sections.cogs.comp;

  const gross_profit_cur = net_sales_cur - cogs_total_cur;
  const gross_profit_comp = net_sales_comp - cogs_total_comp;

  const total_opex_cur = sections.opex_admin.cur + sections.opex_selling.cur;
  const total_opex_comp = sections.opex_admin.comp + sections.opex_selling.comp;

  const op_profit_cur = gross_profit_cur - total_opex_cur;
  const op_profit_comp = gross_profit_comp - total_opex_comp;

  const pbt_cur = op_profit_cur + sections.non_op_income.cur - sections.finance_cost.cur;
  const pbt_comp = op_profit_comp + sections.non_op_income.comp - sections.finance_cost.comp;

  const net_profit_cur = pbt_cur - sections.tax.cur;
  const net_profit_comp = pbt_comp - sections.tax.comp;

  // Build the hierarchical reportNodes
  let reportNodes = [
    {
      name: sections.revenue.name,
      row_type: 'header',
      balances: { current: sections.revenue.cur, comparative: sections.revenue.comp },
      data: { account_name: sections.revenue.name },
      children: sections.revenue.children
    },
    {
      name: sections.sales_returns.name,
      row_type: 'header',
      balances: { current: sections.sales_returns.cur, comparative: sections.sales_returns.comp },
      data: { account_name: sections.sales_returns.name },
      children: sections.sales_returns.children
    },
    {
      name: 'NET SALES',
      row_type: 'kpi_secondary',
      balances: { current: net_sales_cur, comparative: net_sales_comp },
      data: { account_name: 'NET SALES', current_period: net_sales_cur, comparative_period: net_sales_comp }
    },
    {
      name: sections.cogs.name,
      row_type: 'header',
      balances: { current: sections.cogs.cur, comparative: sections.cogs.comp },
      data: { account_name: sections.cogs.name },
      children: sections.cogs.children
    },
    {
      name: 'GROSS PROFIT',
      row_type: 'kpi_primary',
      balances: { current: gross_profit_cur, comparative: gross_profit_comp },
      data: { account_name: 'GROSS PROFIT', current_period: gross_profit_cur, comparative_period: gross_profit_comp }
    },
    {
      name: 'Operating Expenses',
      row_type: 'header',
      balances: { current: total_opex_cur, comparative: total_opex_comp },
      data: { account_name: 'Operating Expenses' },
      children: [
        {
          name: sections.opex_admin.name,
          row_type: 'header',
          balances: { current: sections.opex_admin.cur, comparative: sections.opex_admin.comp },
          data: { account_name: sections.opex_admin.name },
          children: sections.opex_admin.children
        },
        {
          name: sections.opex_selling.name,
          row_type: 'header',
          balances: { current: sections.opex_selling.cur, comparative: sections.opex_selling.comp },
          data: { account_name: sections.opex_selling.name },
          children: sections.opex_selling.children
        }
      ]
    },
    {
      name: 'OPERATING PROFIT (EBIT)',
      row_type: 'kpi_primary',
      balances: { current: op_profit_cur, comparative: op_profit_comp },
      data: { account_name: 'OPERATING PROFIT (EBIT)', current_period: op_profit_cur, comparative_period: op_profit_comp }
    },
    {
      name: sections.non_op_income.name,
      row_type: 'header',
      balances: { current: sections.non_op_income.cur, comparative: sections.non_op_income.comp },
      data: { account_name: sections.non_op_income.name },
      children: sections.non_op_income.children
    },
    {
      name: sections.finance_cost.name,
      row_type: 'header',
      balances: { current: sections.finance_cost.cur, comparative: sections.finance_cost.comp },
      data: { account_name: sections.finance_cost.name },
      children: sections.finance_cost.children
    },
    {
      name: 'PROFIT BEFORE TAX',
      row_type: 'kpi_secondary',
      balances: { current: pbt_cur, comparative: pbt_comp },
      data: { account_name: 'PROFIT BEFORE TAX', current_period: pbt_cur, comparative_period: pbt_comp }
    },
    {
      name: sections.tax.name,
      row_type: 'header',
      balances: { current: sections.tax.cur, comparative: sections.tax.comp },
      data: { account_name: sections.tax.name },
      children: sections.tax.children
    },
    {
      name: 'NET INCOME FOR THE PERIOD',
      row_type: 'kpi_primary',
      balances: { current: net_profit_cur, comparative: net_profit_comp },
      data: { account_name: 'NET INCOME FOR THE PERIOD', current_period: net_profit_cur, comparative_period: net_profit_comp }
    }
  ];

  if (skipZeroRows) {
    reportNodes = reportNodes.filter(pruneTree);
  }

  const columnDefinitions = [
    { key: 'account_name', title: 'Account Particulars', width: '60%', align: 'left', formatType: 'text' },
    { key: 'current_period', title: 'Current Period', width: '20%', align: 'right', formatType: 'currency' },
    { key: 'comparative_period', title: 'Comparative Period', width: '20%', align: 'right', formatType: 'currency' }
  ];

  return { reportNodes: coerceNulls(reportNodes), columnDefinitions };
}

/**
 * Transforms flat Trial Balance data into a semantic hierarchy grouped by account type.
 */
function transformTrialBalance(rawData, skipZeroRows) {
  let reportNodes = [];
  
  const sortOrder = { 'Asset': 1, 'Liability': 2, 'Equity': 3, 'Revenue': 4, 'Expense': 5 };
  const grouped = {};
  
  rawData.forEach(a => {
    const type = a.account_type || 'Unclassified';
    if (!grouped[type]) {
      grouped[type] = {
        name: type.toUpperCase(),
        row_type: 'header',
        balances: { current: 0 },
        data: { account_name: type.toUpperCase(), debit: null, credit: null },
        children: []
      };
    }
    
    grouped[type].children.push({
      name: a.account_name,
      row_type: 'account',
      balances: { current: (a.closing_debit || 0) + (a.closing_credit || 0) },
      data: {
        account_name: `${a.account_code ? a.account_code + ' - ' : ''}${a.account_name}`,
        debit: a.closing_debit || 0,
        credit: a.closing_credit || 0
      }
    });
    
    // Sum balances for pruning
    grouped[type].balances.current += (a.closing_debit || 0) + (a.closing_credit || 0);
  });
  
  Object.keys(grouped)
    .sort((a, b) => (sortOrder[a] || 99) - (sortOrder[b] || 99))
    .forEach(type => {
      // Sort children alphabetically
      grouped[type].children.sort((a, b) => a.name.localeCompare(b.name));
      reportNodes.push(grouped[type]);
    });

  // Calculate totals
  const totalDebit = rawData.reduce((sum, n) => sum + (n.closing_debit || 0), 0);
  const totalCredit = rawData.reduce((sum, n) => sum + (n.closing_credit || 0), 0);

  reportNodes.push({
    name: 'TOTAL',
    row_type: 'kpi_primary',
    balances: { current: totalDebit }, // Ensure it doesn't get pruned
    data: {
      account_name: 'TOTAL',
      debit: totalDebit,
      credit: totalCredit
    }
  });

  if (skipZeroRows) {
    reportNodes = reportNodes.filter(pruneTree);
  }

  const columnDefinitions = [
    { key: 'account_name', title: 'Account Particulars', width: '60%', align: 'left', formatType: 'text' },
    { key: 'debit', title: 'Debit', width: '20%', align: 'right', formatType: 'currency' },
    { key: 'credit', title: 'Credit', width: '20%', align: 'right', formatType: 'currency' }
  ];

  return { reportNodes: coerceNulls(reportNodes), columnDefinitions };
}

/**
 * Transforms Ledger Detail data.
 */
function transformLedgerDetail(rawData, parameters, skipZeroRows) {
  let reportNodes = [];
  
  if (parameters.openingBalance !== undefined) {
    reportNodes.push({
      name: 'Opening Balance',
      row_type: 'kpi_secondary',
      balances: { current: parameters.openingBalance },
      data: {
        transaction_date: '',
        voucher_number: '',
        description: 'Opening Balance',
        debit: parameters.openingBalance > 0 ? parameters.openingBalance : 0,
        credit: parameters.openingBalance < 0 ? Math.abs(parameters.openingBalance) : 0,
        balance: parameters.openingBalance
      }
    });
  }

  const deduplicateDescription = (desc) => {
    if (!desc) return '';
    return [...new Set(desc.split('\n').map(s => s.trim()).filter(Boolean))].join('\n');
  };

  rawData.forEach(tx => {
    reportNodes.push({
      name: tx.description,
      row_type: 'transaction',
      balances: { current: tx.running_balance || 0 }, // For pruning
      data: {
        transaction_date: tx.entry_date,
        bs_date: parameters.showBsDate && tx.entry_date ? formatBS(adToBS(tx.entry_date)) : '',
        voucher_number: tx.voucher_no ? tx.voucher_no.replace(/-/g, '-\u200B') : '',
        description: deduplicateDescription(tx.description),
        debit: tx.debit_amount,
        credit: tx.credit_amount,
        balance: tx.running_balance
      }
    });
  });

  const totalDebit = rawData.reduce((sum, tx) => sum + (Number(tx.debit_amount) || 0), 0);
  const totalCredit = rawData.reduce((sum, tx) => sum + (Number(tx.credit_amount) || 0), 0);
  const closingBalance = rawData.length > 0 ? rawData[rawData.length - 1].running_balance : (parameters.openingBalance || 0);

  reportNodes.push({
    name: 'TOTAL',
    row_type: 'kpi_primary',
    balances: { current: closingBalance },
    data: {
      transaction_date: '',
      bs_date: '',
      voucher_number: '',
      description: 'TOTAL',
      debit: totalDebit,
      credit: totalCredit,
      balance: closingBalance
    }
  });

  const columnDefinitions = parameters.showBsDate 
    ? [
        { key: 'transaction_date', title: 'Date (A.D)', width: '10%', align: 'left', formatType: 'text' },
        { key: 'bs_date', title: 'Date (B.S)', width: '10%', align: 'left', formatType: 'text' },
        { key: 'voucher_number', title: 'Voucher No', width: '17%', align: 'left', formatType: 'text' },
        { key: 'description', title: 'Description', width: '27%', align: 'left', formatType: 'text' },
        { key: 'debit', title: 'Debit', width: '12%', align: 'right', formatType: 'currency' },
        { key: 'credit', title: 'Credit', width: '12%', align: 'right', formatType: 'currency' },
        { key: 'balance', title: 'Balance', width: '12%', align: 'right', formatType: 'currency' }
      ]
    : [
        { key: 'transaction_date', title: 'Date', width: '12%', align: 'left', formatType: 'text' },
        { key: 'voucher_number', title: 'Voucher No', width: '20%', align: 'left', formatType: 'text' },
        { key: 'description', title: 'Description', width: '32%', align: 'left', formatType: 'text' },
        { key: 'debit', title: 'Debit', width: '12%', align: 'right', formatType: 'currency' },
        { key: 'credit', title: 'Credit', width: '12%', align: 'right', formatType: 'currency' },
        { key: 'balance', title: 'Balance', width: '12%', align: 'right', formatType: 'currency' }
      ];

  return { reportNodes: coerceNulls(reportNodes), columnDefinitions };
}

export function transformReportData(reportType, rawData, parameters = {}, skipZeroRows = true) {
  switch (reportType) {
    case 'profit_loss':
      return transformProfitLoss(rawData, skipZeroRows);
    case 'trial_balance':
      return transformTrialBalance(rawData, skipZeroRows);
    case 'ledger_detail':
      return transformLedgerDetail(rawData, parameters, false); // Never prune ledger details
    default:
      // Fallback for flat lists
      return {
        reportNodes: coerceNulls(rawData.map(row => ({ row_type: 'account', data: row }))),
        columnDefinitions: Object.keys(rawData[0] || {}).map(k => ({
          key: k, title: k, width: 'auto', align: 'left', formatType: 'text'
        }))
      };
  }
}

export { formatValue };
