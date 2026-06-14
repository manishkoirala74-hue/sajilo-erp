import { sajilo } from '@/api/sajiloClient';

const DEFAULT_COA = [
  // ── ASSETS (Debit) ──
  { code: '1000', name: 'Assets', type: 'Asset', subtype: '', ledger_type: 'Group Ledger', balance: 'Debit' },
  
  { code: '1100', name: 'Current Assets', type: 'Asset', subtype: 'Current Asset', ledger_type: 'Group Ledger', balance: 'Debit', parent: '1000' },
  { code: '1110', name: 'Cash in Hand', type: 'Asset', subtype: 'Current Asset', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '1100' },
  { code: '1120', name: 'Bank Accounts', type: 'Asset', subtype: 'Current Asset', ledger_type: 'Group Ledger', balance: 'Debit', parent: '1100' },
  { code: '1130', name: 'Trade Receivables (Customers)', type: 'Asset', subtype: 'Current Asset', ledger_type: 'Group Ledger', balance: 'Debit', parent: '1100' },
  { code: '1140', name: 'Inventory', type: 'Asset', subtype: 'Current Asset', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '1100' },
  
  { code: '1200', name: 'Fixed Assets', type: 'Asset', subtype: 'Fixed Asset', ledger_type: 'Group Ledger', balance: 'Debit', parent: '1000' },
  { code: '1210', name: 'Machinery & Equipment', type: 'Asset', subtype: 'Fixed Asset', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '1200' },
  { code: '1220', name: 'Office Equipment', type: 'Asset', subtype: 'Fixed Asset', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '1200' },
  { code: '1230', name: 'Vehicles', type: 'Asset', subtype: 'Fixed Asset', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '1200' },

  { code: '1300', name: 'Accumulated Depreciation', type: 'Asset', subtype: 'Fixed Asset', ledger_type: 'Group Ledger', balance: 'Credit', parent: '1000' },
  { code: '1310', name: 'Acc. Dep - Machinery', type: 'Asset', subtype: 'Fixed Asset', ledger_type: 'Sub Ledger', balance: 'Credit', parent: '1300' },
  { code: '1320', name: 'Acc. Dep - Office Eq', type: 'Asset', subtype: 'Fixed Asset', ledger_type: 'Sub Ledger', balance: 'Credit', parent: '1300' },
  { code: '1330', name: 'Acc. Dep - Vehicles', type: 'Asset', subtype: 'Fixed Asset', ledger_type: 'Sub Ledger', balance: 'Credit', parent: '1300' },

  // ── LIABILITIES (Credit) ──
  { code: '2000', name: 'Liabilities', type: 'Liability', subtype: '', ledger_type: 'Group Ledger', balance: 'Credit' },
  
  { code: '2100', name: 'Current Liabilities', type: 'Liability', subtype: 'Current Liability', ledger_type: 'Group Ledger', balance: 'Credit', parent: '2000' },
  { code: '2110', name: 'Trade Payables (Suppliers)', type: 'Liability', subtype: 'Current Liability', ledger_type: 'Group Ledger', balance: 'Credit', parent: '2100' },
  { code: '2120', name: 'VAT Payable', type: 'Liability', subtype: 'Current Liability', ledger_type: 'Sub Ledger', balance: 'Credit', parent: '2100' },
  { code: '2130', name: 'TDS Payable', type: 'Liability', subtype: 'Current Liability', ledger_type: 'Sub Ledger', balance: 'Credit', parent: '2100' },
  
  { code: '2200', name: 'Non-Current Liabilities', type: 'Liability', subtype: 'Long Term Liability', ledger_type: 'Group Ledger', balance: 'Credit', parent: '2000' },
  { code: '2210', name: 'Bank Loans', type: 'Liability', subtype: 'Long Term Liability', ledger_type: 'Sub Ledger', balance: 'Credit', parent: '2200' },

  // ── EQUITY (Credit) ──
  { code: '3000', name: 'Equity', type: 'Equity', subtype: '', ledger_type: 'Group Ledger', balance: 'Credit' },
  { code: '3100', name: 'Owner\'s Capital', type: 'Equity', subtype: 'Equity', ledger_type: 'Sub Ledger', balance: 'Credit', parent: '3000' },
  { code: '3200', name: 'Retained Earnings', type: 'Equity', subtype: 'Equity', ledger_type: 'Sub Ledger', balance: 'Credit', parent: '3000' },
  { code: '3300', name: 'Current Year Earnings', type: 'Equity', subtype: 'Equity', ledger_type: 'Sub Ledger', balance: 'Credit', parent: '3000' },

  // ── REVENUE (Credit) ──
  { code: '4000', name: 'Revenue', type: 'Revenue', subtype: '', ledger_type: 'Group Ledger', balance: 'Credit' },
  { code: '4100', name: 'Sales Revenue', type: 'Revenue', subtype: 'Operating Revenue', ledger_type: 'Sub Ledger', balance: 'Credit', parent: '4000' },
  { code: '4200', name: 'Service Income', type: 'Revenue', subtype: 'Operating Revenue', ledger_type: 'Sub Ledger', balance: 'Credit', parent: '4000' },
  { code: '4300', name: 'Other Income', type: 'Revenue', subtype: 'Non-Operating Revenue', ledger_type: 'Sub Ledger', balance: 'Credit', parent: '4000' },

  // ── COGS (Debit) ──
  { code: '5000', name: 'Cost of Goods Sold (COGS)', type: 'Expense', subtype: 'Direct Expense', ledger_type: 'Group Ledger', balance: 'Debit' },
  { code: '5100', name: 'Cost of Sales', type: 'Expense', subtype: 'Direct Expense', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '5000' },
  { code: '5200', name: 'Direct Labor', type: 'Expense', subtype: 'Direct Expense', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '5000' },
  { code: '5300', name: 'Manufacturing Overhead', type: 'Expense', subtype: 'Direct Expense', ledger_type: 'Group Ledger', balance: 'Debit', parent: '5000' },
  { code: '5310', name: 'Factory Rent', type: 'Expense', subtype: 'Direct Expense', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '5300' },
  { code: '5320', name: 'Factory Utilities', type: 'Expense', subtype: 'Direct Expense', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '5300' },

  // ── OPEX (Debit) ──
  { code: '6000', name: 'Operating Expenses (OPEX)', type: 'Expense', subtype: 'Indirect Expense', ledger_type: 'Group Ledger', balance: 'Debit' },
  { code: '6100', name: 'Salaries & Wages', type: 'Expense', subtype: 'Indirect Expense', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '6000' },
  { code: '6200', name: 'Office Rent', type: 'Expense', subtype: 'Indirect Expense', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '6000' },
  { code: '6300', name: 'Utilities & Communication', type: 'Expense', subtype: 'Indirect Expense', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '6000' },
  { code: '6400', name: 'Marketing & Advertising', type: 'Expense', subtype: 'Indirect Expense', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '6000' },
  { code: '6500', name: 'Depreciation Expense', type: 'Expense', subtype: 'Indirect Expense', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '6000' },
  { code: '6600', name: 'Bank Charges', type: 'Expense', subtype: 'Indirect Expense', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '6000' },
  { code: '6700', name: 'Miscellaneous Expense', type: 'Expense', subtype: 'Indirect Expense', ledger_type: 'Sub Ledger', balance: 'Debit', parent: '6000' },
];

export async function seedDefaultChartOfAccounts() {
  const codeToId = {};
  const codeToName = {};

  // Group accounts by level to satisfy foreign key dependencies
  const level0 = DEFAULT_COA.filter(a => !a.parent);
  const level1 = DEFAULT_COA.filter(a => a.parent && level0.some(p => p.code === a.parent));
  const level2 = DEFAULT_COA.filter(a => a.parent && level1.some(p => p.code === a.parent));
  const level3 = DEFAULT_COA.filter(a => a.parent && level2.some(p => p.code === a.parent));

  const levels = [level0, level1, level2, level3].filter(l => l.length > 0);

  for (const level of levels) {
    const promises = level.map(async (acc) => {
      const payload = {
        account_code: acc.code,
        account_name: acc.name,
        account_type: acc.type,
        account_subtype: acc.subtype,
        ledger_type: acc.ledger_type,
        normal_balance: acc.balance,
        is_active: true,
        is_system_account: true,
        current_balance: 0,
        description: 'System Default Account',
      };

      if (acc.parent && codeToId[acc.parent]) {
        payload.parent_account_id = codeToId[acc.parent];
        payload.parent_account_name = codeToName[acc.parent];
      }

      const created = await sajilo.entities.ChartOfAccount.create(payload);
      return { code: acc.code, id: created.id, name: created.account_name };
    });

    const results = await Promise.all(promises);
    results.forEach(res => {
      codeToId[res.code] = res.id;
      codeToName[res.code] = res.name;
    });
  }
}
