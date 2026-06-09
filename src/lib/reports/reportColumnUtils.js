/**
 * Report Column Utilities
 * Controls dynamic column visibility across all financial report tables.
 */

export const DEFAULT_COLUMN_STATE = {
  showOpeningBalance: true,
  showClosingBalance: true,
  showTransactions: true,
  showZeroBalance: false,
  expandAll: false,
};

/**
 * Build an ordered list of visible column definitions for financial tables.
 * Each column: { key, label, align }
 */
export function buildVisibleColumns(columnState) {
  const cols = [
    { key: 'account_code',  label: 'Code',          align: 'left'  },
    { key: 'account_name',  label: 'Account Name',   align: 'left'  },
    { key: 'account_type',  label: 'Account Type',   align: 'left'  },
  ];

  if (columnState.showOpeningBalance) {
    cols.push({ key: 'opening_debit', label: 'Debit (NPR)', align: 'right' });
    cols.push({ key: 'opening_credit', label: 'Credit (NPR)', align: 'right' });
  }
  if (columnState.showTransactions) {
    cols.push({ key: 'current_debit',  label: 'Debit (NPR)',  align: 'right' });
    cols.push({ key: 'current_credit', label: 'Credit (NPR)', align: 'right' });
  }
  if (columnState.showClosingBalance) {
    cols.push({ key: 'closing_debit', label: 'Debit (NPR)', align: 'right' });
    cols.push({ key: 'closing_credit', label: 'Credit (NPR)', align: 'right' });
  }

  return cols;
}

/**
 * Formats a number as NPR currency string.
 */
export function fmtNPR(n) {
  const num = Number(n || 0);
  if (num === 0) return '—';
  return num.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Filters out zero-balance rows if showZeroBalance is false.
 */
export function filterZeroRows(rows, showZeroBalance) {
  if (showZeroBalance) return rows;
  return rows.filter(r => {
    // Check if there is any balance or activity
    return (
      Math.abs(r.opening_debit || 0) > 0 ||
      Math.abs(r.opening_credit || 0) > 0 ||
      Math.abs(r.current_debit || 0) > 0 ||
      Math.abs(r.current_credit || 0) > 0 ||
      Math.abs(r.closing_debit || 0) > 0 ||
      Math.abs(r.closing_credit || 0) > 0 ||
      Math.abs(r.closing_balance || r.current_balance || 0) > 0
    );
  });
}

/**
 * Groups flat account list into a leaf-only bottom-up hierarchy.
 *
 * CRITICAL AGGREGATION RULE: Only Sub Ledger rows (leaf nodes) carry balances.
 * Group Ledger rows are NEVER summed directly — their totals are always derived
 * by aggregating their Sub Ledger descendants. This prevents double-counting.
 *
 * Algorithm:
 *   1. Separate all accounts into groups (Group Ledger) and leaves (Sub Ledger).
 *   2. For each leaf, walk up parent_account_id chain to find its root group.
 *   3. Group rows display a computed aggregate of all their leaf descendants only.
 *   4. Orphaned leaves (no parent group in the list) are placed under a synthetic group.
 */
export function groupAccountsByParent(accounts) {
  const groupMap = {};   // id → group node
  const leaves   = [];   // sub-ledger (leaf) nodes only

  // Pass 1: index all Group Ledger nodes
  accounts.forEach(a => {
    if (a.ledger_type === 'Group Ledger' || a._isControlAccount) {
      groupMap[a.id] = { ...a, children: [] };
    }
  });

  // Pass 2: collect leaf nodes (Sub Ledger + unlabelled = leaf by convention)
  accounts.forEach(a => {
    if (a.ledger_type !== 'Group Ledger' && !a._isControlAccount) {
      leaves.push(a);
    }
  });

  // Pass 3: assign each leaf to its immediate parent group (skip intermediate groups)
  leaves.forEach(leaf => {
    // Walk up until we find a direct parent that is in our groupMap
    let parentId = leaf.parent_account_id;
    let resolvedGroup = null;

    // BFS-style walk up the hierarchy (max 5 levels to prevent infinite loop)
    for (let depth = 0; depth < 5 && parentId; depth++) {
      if (groupMap[parentId]) {
        resolvedGroup = parentId;
        break;
      }
      // Parent may itself be an intermediate group not directly indexed — try its parent
      const parentAccount = accounts.find(a => a.id === parentId);
      parentId = parentAccount?.parent_account_id;
    }

    if (resolvedGroup) {
      groupMap[resolvedGroup].children.push(leaf);
    } else {
      // Orphaned leaf — place under synthetic catch-all
      if (!groupMap['__UNGROUPED__']) {
        groupMap['__UNGROUPED__'] = {
          id: '__UNGROUPED__', account_code: '—', account_name: 'Other Accounts',
          account_type: 'Other', ledger_type: 'Group Ledger', children: [],
        };
      }
      groupMap['__UNGROUPED__'].children.push(leaf);
    }
  });

  // Return only groups that have leaf children OR are control accounts (lazy-loaded partners)
  return Object.values(groupMap).filter(g => g.children.length > 0 || g._isControlAccount);
}

/**
 * Computes summary totals for a group strictly from its LEAF children.
 * Never aggregates from Group Ledger rows — prevents double-counting.
 */

export function computeGroupTotals(children) {
  // Only aggregate leaf (Sub Ledger) nodes — skip any Group Ledger rows that may have
  // been accidentally included, which would cause double-counting.
  const leaves = children.filter(c => c.ledger_type !== 'Group Ledger');
  return leaves.reduce(
    (acc, c) => ({
      opening_debit:  acc.opening_debit  + (c.opening_debit  || 0),
      opening_credit: acc.opening_credit + (c.opening_credit || 0),
      current_debit:  acc.current_debit  + (c.current_debit  || 0),
      current_credit: acc.current_credit + (c.current_credit || 0),
      closing_debit:  acc.closing_debit  + (c.closing_debit  || 0),
      closing_credit: acc.closing_credit + (c.closing_credit || 0),
      // Fallback for legacy tables
      opening_balance: acc.opening_balance + (c.opening_balance || 0),
      debit:           acc.debit           + (c.debit           || 0),
      credit:          acc.credit          + (c.credit          || 0),
      closing_balance: acc.closing_balance + (c.closing_balance || c.current_balance || 0),
    }),
    { opening_debit: 0, opening_credit: 0, current_debit: 0, current_credit: 0, closing_debit: 0, closing_credit: 0, opening_balance: 0, debit: 0, credit: 0, closing_balance: 0 }
  );
}

/**
 * Export data as CSV and trigger download.
 */
export function downloadCSV(filename, headers, rows) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}