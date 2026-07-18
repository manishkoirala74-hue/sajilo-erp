import test from 'node:test';
import assert from 'node:assert';
import { transformReportData, formatValue } from '../src/lib/reports/reportDataTransformer.js';

test('formatValue: Native Intl formatting and Zero balance standard', (t) => {
  // Positive value
  assert.strictEqual(formatValue(150000, 'currency'), '1,50,000.00');
  
  // Negative value (parentheses)
  assert.strictEqual(formatValue(-150000, 'currency'), '(1,50,000.00)');
  
  // South Asian Numbering (Lakh/Crore)
  assert.strictEqual(formatValue(15000000, 'currency'), '1,50,00,000.00'); // 1 crore 50 lakhs
  
  // Zero balance rendering to en-dash
  assert.strictEqual(formatValue(0, 'currency'), '-');
  assert.strictEqual(formatValue(0.0001, 'currency'), '-'); // tolerance testing
});

test('transformReportData: Coerce null strings', (t) => {
  const rawData = [
    { account_name: null, closing_balance: 100 }
  ];
  
  const result = transformReportData('trial_balance', rawData, {}, false);
  const node = result.reportNodes.find(n => n.row_type === 'account');
  
  // Nulls should be coerced to empty string
  assert.strictEqual(node.data.account_name, '');
});

test('transformReportData: Recursive bottom-up pruning of empty parents', (t) => {
  const rawData = [
    // Zero-balance leaf under Selling Expenses
    { parent_account_id: null, account_name: 'Ad Spend', statement_group: 'Operating Expenses', statement_subgroup: 'Selling Expenses', rollup_current: 0, rollup_comparative: 0 },
    // Valid leaf under Admin Expenses
    { parent_account_id: null, account_name: 'Office Supplies', statement_group: 'Operating Expenses', statement_subgroup: 'Administrative Expenses', rollup_current: 500, rollup_comparative: 0 },
  ];

  const result = transformReportData('profit_loss', rawData, {}, true); // skipZeroRows = true

  // 'Operating Expenses' header should exist
  const opexHeader = result.reportNodes.find(n => n.name === 'Operating Expenses');
  assert.ok(opexHeader);
  
  // Selling Expenses should be PRUNED because it has 0 balance and its children are 0
  const sellingHeader = opexHeader.children.find(n => n.name === 'Selling & Distribution Expenses');
  assert.strictEqual(sellingHeader, undefined, 'Empty parent was not pruned');
  
  // Admin Expenses should exist because it has a valid child
  const adminHeader = opexHeader.children.find(n => n.name === 'Administrative Expenses');
  assert.ok(adminHeader);
  assert.strictEqual(adminHeader.children.length, 1);
});

test('transformReportData: Primary KPI Calculation Math (P&L)', (t) => {
  const rawData = [
    // Revenue
    { parent_account_id: null, account_name: 'Sales', statement_group: 'Revenue', statement_subgroup: 'Sales Revenue', rollup_current: 10000, rollup_comparative: 5000 },
    // COGS
    { parent_account_id: null, account_name: 'Cost of Sales', statement_group: 'Cost of Goods Sold', statement_subgroup: 'Direct Costs', rollup_current: 4000, rollup_comparative: 2000 }
  ];

  const result = transformReportData('profit_loss', rawData, {}, true);
  
  const grossProfitNode = result.reportNodes.find(n => n.name === 'GROSS PROFIT');
  assert.ok(grossProfitNode);
  
  // GP = 10000 - 4000 = 6000
  assert.strictEqual(grossProfitNode.balances.current, 6000);
  assert.strictEqual(grossProfitNode.balances.comparative, 3000);
});
