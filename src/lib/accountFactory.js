import { sajilo, supabase } from '@/api/sajiloClient';

export const ACCOUNT_METADATA = {
  'Asset': { statement_type: 'balance_sheet', statement_group: 'Assets', normal_balance: 'Debit' },
  'Liability': { statement_type: 'balance_sheet', statement_group: 'Liabilities', normal_balance: 'Credit' },
  'Equity': { statement_type: 'balance_sheet', statement_group: 'Equity', normal_balance: 'Credit' },
  'Revenue': { statement_type: 'income_statement', statement_group: 'Revenue', normal_balance: 'Credit' },
  'Income': { statement_type: 'income_statement', statement_group: 'Revenue', normal_balance: 'Credit' },
  'Expense': { statement_type: 'income_statement', statement_group: 'Operating Expenses', normal_balance: 'Debit' },
  'Expenses': { statement_type: 'income_statement', statement_group: 'Operating Expenses', normal_balance: 'Debit' },
  'COGS': { statement_type: 'income_statement', statement_group: 'Cost of Goods Sold', normal_balance: 'Debit' },
  'OPEX': { statement_type: 'income_statement', statement_group: 'Operating Expenses', normal_balance: 'Debit' },
  'Other Income': { statement_type: 'income_statement', statement_group: 'Non-Operating Income', normal_balance: 'Credit' },
  'Other Expense': { statement_type: 'income_statement', statement_group: 'Operating Expenses', normal_balance: 'Debit' }
};

/**
 * Generates an automated sub-ledger for partners, taxes, and bank accounts.
 * Validates metadata rigorously and fetches a unique sequential code via an RPC lock.
 */
export async function createSubLedger({ name, parentGroupId, parentGroupName, accountType, accountSubtype = '', openingBalance = 0, description = '' }) {
  const metadata = ACCOUNT_METADATA[accountType];
  if (!metadata) {
    throw new Error(`Invalid accountType '${accountType}'. No strict metadata mapping found.`);
  }

  // Use the concurrent-safe RPC to grab the next code sequentially
  const { data: nextCode, error } = await supabase.rpc('get_next_account_code', {
    p_parent_id: parentGroupId
  });

  if (error) {
    throw new Error(`Failed to generate sequential account code: ${error.message}`);
  }

  // legacy financial_statement is explicitly stripped and handled by DB trigger
  const payload = {
    account_code: nextCode,
    account_name: name,
    account_type: accountType,
    account_subtype: accountSubtype,
    ledger_type: 'Sub Ledger',
    parent_account_id: parentGroupId,
    parent_account_name: parentGroupName,
    normal_balance: metadata.normal_balance,
    statement_type: metadata.statement_type,
    statement_group: metadata.statement_group,
    is_active: true,
    is_system_account: false,
    current_balance: openingBalance,
    description: description
  };

  const newAccount = await sajilo.entities.ChartOfAccount.create(payload);
  return newAccount;
}
