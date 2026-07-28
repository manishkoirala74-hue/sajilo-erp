/**
 * FinancialReportTable
 * Full recursive multi-level hierarchy: System Group → Group → Sub-Group → Ledger
 * Proper depth-based indentation and expand/collapse at every level.
 * All account codes displayed clearly at every level.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, FileSpreadsheet, Folder, FolderOpen, FileText, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildVisibleColumns, fmtNPR } from '@/lib/reports/reportColumnUtils';
import { exportFinancialXLSX } from '@/lib/reports/reportExcelExport';

const TYPE_BADGE = {
  Asset:     'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  Liability: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
  Equity:    'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
  Revenue:   'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  COGS:      'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',
  OPEX:      'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400',
  Expense:   'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400',
};

function TypeBadge({ type }) {
  const cls = TYPE_BADGE[type] || 'bg-slate-100 dark:bg-slate-500/20 text-muted-foreground';
  return <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', cls)}>{type || '—'}</span>;
}

// ── Build full recursive tree from flat account list ──────────────────────────
function buildTree(accounts) {
  const byId = {};
  accounts.forEach(a => { byId[a.id] = { ...a, _children: [] }; });

  const roots = [];
  accounts.forEach(a => {
    if (a.parent_account_id && byId[a.parent_account_id]) {
      byId[a.parent_account_id]._children.push(byId[a.id]);
    } else {
      roots.push(byId[a.id]);
    }
  });

  // Sort each level by account_code
  const sortNodes = (nodes) => {
    nodes.sort((a, b) => (a.account_code || '').localeCompare(b.account_code || '', undefined, { numeric: true }));
    nodes.forEach(n => sortNodes(n._children));
  };
  sortNodes(roots);

  return roots;
}

// ── Collect all group node IDs recursively ────────────────────────────────────
function collectGroupIds(nodes, ids = []) {
  nodes.forEach(n => {
    if (n.ledger_type === 'Group Ledger') {
      ids.push(n.id);
      collectGroupIds(n._children, ids);
    }
  });
  return ids;
}

// ── Compute totals recursively from leaf (Sub Ledger) nodes only ──────────────
function computeSubtreeTotals(node, reportType) {
  if (node.ledger_type !== 'Group Ledger') {
    // Leaf node — return its own values
    return {
      opening_debit:  node.opening_debit  || 0,
      opening_credit: node.opening_credit || 0,
      current_debit:  node.current_debit  || 0,
      current_credit: node.current_credit || 0,
      closing_debit:  node.closing_debit  || 0,
      closing_credit: node.closing_credit || 0,
      closing_balance: node.closing_balance || 0,
      balance: node.balance || 0,
    };
  }
  // Group node — aggregate children recursively
  return node._children.reduce(
    (acc, child) => {
      const t = computeSubtreeTotals(child, reportType);
      return {
        opening_debit:  acc.opening_debit  + t.opening_debit,
        opening_credit: acc.opening_credit + t.opening_credit,
        current_debit:  acc.current_debit  + t.current_debit,
        current_credit: acc.current_credit + t.current_credit,
        closing_debit:  acc.closing_debit  + t.closing_debit,
        closing_credit: acc.closing_credit + t.closing_credit,
        closing_balance: (acc.closing_balance || 0) + (t.closing_balance || 0),
        balance: (acc.balance || 0) + (t.balance || 0),
      };
    },
    { opening_debit: 0, opening_credit: 0, current_debit: 0, current_credit: 0, closing_debit: 0, closing_credit: 0, closing_balance: 0, balance: 0 }
  );
}

// ── Ledger (leaf) row ─────────────────────────────────────────────────────────
function LedgerRow({ account, columns, depth }) {
  const indent = depth * 20 + 8;
  return (
    <tr className="hover:bg-muted/50 transition-colors print:hover:bg-transparent">
      {columns.map(col => {
        if (col.key === 'account_code') return (
          <td key={col.key} className="cell-density py-1.5 min-w-[220px] max-w-[75vw] sm:max-w-[400px] whitespace-normal sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] print:text-[9px]"
            style={{ paddingLeft: `${indent}px`, paddingRight: '8px' }}>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-mono">{account.account_code || '—'}</span>
              <span className="text-sm font-normal text-muted-foreground print:text-[10px]" style={{ wordBreak: 'break-word' }}>
                {account.account_name}
              </span>
            </div>
          </td>
        );
        if (col.key === 'account_type') return (
          <td key={col.key} className="cell-density print:hidden">
            <TypeBadge type={account.account_type} />
          </td>
        );
        const raw = account[col.key];
        const isNumeric = col.key.endsWith('_debit') || col.key.endsWith('_credit') || ['opening_balance','closing_balance','debit','credit','balance'].includes(col.key);
        const formatted = isNumeric ? fmtNPR(raw) : (raw ?? '—');
        return (
          <td key={col.key} className={cn('px-2 py-1.5 text-sm print:text-[10px]', col.align === 'right' && 'text-right tabular-nums font-mono')}>
            {formatted === '—' ? <span className="text-muted-foreground/30">—</span> : formatted}
          </td>
        );
      })}
    </tr>
  );
}

// ── Group row (recursive, all levels) ────────────────────────────────────────
function GroupRow({ node, columns, depth, expandedGroups, onToggle, showZeroBalance, partnerRows, onGroupExpand, reportType }) {
  const indent = depth * 20 + 8;
  const isExpanded = expandedGroups.has(node.id);
  const children = node._children || [];
  const hasChildren = children.length > 0;
  const isControlAccount = node.is_control_account;

  // Totals computed from this subtree's leaves (or natively for balance sheet)
  const totals = computeSubtreeTotals(node, reportType);

  const displayTotals = totals;

  // Determine depth-based styling
  const fontClass = depth === 0
    ? 'text-sm font-bold uppercase tracking-wider text-foreground'
    : 'text-sm font-semibold text-foreground';

  const handleToggle = useCallback((e) => {
    e.stopPropagation();
    onToggle(node.id);
    if (!expandedGroups.has(node.id) && onGroupExpand) {
      onGroupExpand(node);
    }
  }, [node, expandedGroups, onToggle, onGroupExpand]);

  return (
    <>
      <tr
        className="cursor-pointer select-none border-b border-border/50 bg-card hover:bg-muted/30 print-group-row"
        onClick={handleToggle}
      >
        {columns.map(col => {
          if (col.key === 'account_code') return (
            <td key={col.key} className="cell-density py-3 min-w-[220px] max-w-[75vw] sm:max-w-[400px] whitespace-normal sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] print:text-[9px]"
              style={{ paddingLeft: `${indent}px`, paddingRight: '8px' }}>
              <div className="flex items-center gap-1.5">
                {hasChildren || isControlAccount
                  ? isExpanded
                    ? <ChevronDown className="w-4 h-4 text-primary shrink-0 report-no-print" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 report-no-print" />
                  : <span className="w-4 shrink-0" />
                }
                {node.is_system_account && <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground font-mono">{node.account_code || '—'}</span>
                  <span className={cn('print:text-[10px]', fontClass)} style={{ wordBreak: 'break-word' }}>
                    {node.account_name}
                  </span>
                </div>
              </div>
            </td>
          );
          if (col.key === 'account_type') return (
            <td key={col.key} className="cell-density print:hidden">
              <TypeBadge type={node.account_type} />
            </td>
          );
          const val = displayTotals[col.key];
          return (
            <td key={col.key} className={cn('px-2 py-3 text-sm tabular-nums font-mono print:text-[10px]', fontClass, col.align === 'right' && 'text-right')}>
              {val !== undefined ? fmtNPR(val) : '—'}
            </td>
          );
        })}
      </tr>

      {/* Render children when expanded */}
      {isExpanded && (
        <>
          {children.map(child =>
            child.ledger_type === 'Group Ledger'
              ? (
                <GroupRow
                  key={child.id}
                  node={child}
                  columns={columns}
                  depth={depth + 1}
                  expandedGroups={expandedGroups}
                  onToggle={onToggle}
                  showZeroBalance={showZeroBalance}
                  partnerRows={partnerRows}
                  onGroupExpand={onGroupExpand}
                  reportType={reportType}
                />
              )
              : (!showZeroBalance && !(child.closing_balance || child.current_balance || child.closing_debit || child.closing_credit || child.opening_debit || child.opening_credit || child.current_debit || child.current_credit) ? null : (
                <LedgerRow
                  key={child.id}
                  account={child}
                  columns={columns}
                  depth={depth + 1}
                />
              ))
          )}
        </>
      )}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function FinancialReportTable({
  accounts,
  columnState, filename, companyName, reportTitle, fromDate, toDate, partnerRows, onGroupExpand
}) {
  const reportType = columnState?.reportType;
  const columns = useMemo(() => {
    const cols = buildVisibleColumns(columnState);
    return cols.filter(c => c.key !== 'account_name' && c.key !== 'account_type');
  }, [columnState]);
  
  const accCodeCol = columns.find(c => c.key === 'account_code');
  if (accCodeCol) accCodeCol.label = 'Account Details';

  // Build full recursive tree from flat account list
  const tree = useMemo(() => buildTree(accounts || []), [accounts]);

  // Collect all group IDs for expand-all
  const allGroupIds = useMemo(() => collectGroupIds(tree), [tree]);

  const [expandedGroups, setExpandedGroups] = useState(new Set());

  // Sync expand-all toggle
  useEffect(() => {
    if (columnState.expandAll) {
      setExpandedGroups(new Set(allGroupIds));
      if (onGroupExpand) {
        // Fire lazy-load for all groups simultaneously
        const walk = (nodes) => nodes.forEach(n => {
          if (n.ledger_type === 'Group Ledger') { onGroupExpand(n); walk(n._children); }
        });
        walk(tree);
      }
    } else {
      setExpandedGroups(new Set());
    }
   
  }, [columnState.expandAll, allGroupIds.length]);

  const toggleGroup = useCallback((id) => {
    setExpandedGroups(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  // Grand totals from all root-level nodes
  const grandTotals = useMemo(() => {
    return tree.reduce(
      (acc, root) => {
        const t = computeSubtreeTotals(root, reportType);
        return {
          opening_debit:  acc.opening_debit  + t.opening_debit,
          opening_credit: acc.opening_credit + t.opening_credit,
          current_debit:  acc.current_debit  + t.current_debit,
          current_credit: acc.current_credit + t.current_credit,
          closing_debit:  acc.closing_debit  + t.closing_debit,
          closing_credit: acc.closing_credit + t.closing_credit,
          closing_balance: (acc.closing_balance || 0) + (t.closing_balance || 0),
          balance: (acc.balance || 0) + (t.balance || 0),
        };
      },
      { opening_debit: 0, opening_credit: 0, current_debit: 0, current_credit: 0, closing_debit: 0, closing_credit: 0, closing_balance: 0, balance: 0 }
    );
  }, [tree, reportType]);

  // Count leaf ledgers
  const countLeaves = (nodes) => nodes.reduce((s, n) => {
    if (n.ledger_type !== 'Group Ledger') return s + 1;
    return s + countLeaves(n._children);
  }, 0);
  const totalLeaves = useMemo(() => countLeaves(tree), [tree]);

  const handleExportXLSX = useCallback(() => {
    // Build flat groups for export (legacy format — top-level groups with leaf children)
    const exportGroups = tree.map(root => ({
      ...root,
      children: root._children?.filter(c => c.ledger_type !== 'Group Ledger') || [],
    }));
    try {
      exportFinancialXLSX({
        groups: exportGroups,
        columns: buildVisibleColumns(columnState),
        columnState,
        companyName: companyName || '',
        reportTitle: reportTitle || 'Financial Report',
        fromDate,
        toDate,
        filename: filename || 'financial_report.xlsx',
      });
    } catch (err) {
      console.error('[XLSX Export Error]', err);
      alert('Export failed: ' + err.message);
    }
  }, [tree, columnState, filename, companyName, reportTitle, fromDate, toDate]);

  if (!accounts || accounts.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">No accounts found for the selected filters.</div>;
  }

  return (
    <div className="space-y-2">
      {/* Export Button */}
      <div className="report-no-print flex justify-end">
        <button
          onClick={handleExportXLSX}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-emerald-300 dark:border-emerald-500/30 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 transition-colors"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Export Excel (.xlsx)
        </button>
      </div>

      <div className="border border-border rounded-xl overflow-hidden print:border-0 print:rounded-none">
        <div className="table-scroll-container">
          <table className="table-fluid-grid text-sm border-collapse print:text-[10px]">
            <colgroup>
              {columns.map(col => {
                const widths = {
                  account_code:    '130px',
                  account_name:    '30%',
                  account_type:    '100px',
                  opening_debit:   '10%',
                  opening_credit:  '10%',
                  current_debit:   '10%',
                  current_credit:  '10%',
                  closing_debit:   '10%',
                  closing_credit:  '10%',
                };
                return <col key={col.key} style={{ width: widths[col.key] || '10%' }} />;
              })}
            </colgroup>

            <thead className="cell-density bg-muted border-b-2 border-border sticky top-0 z-10">
              <tr>
                {columns.map(col => {
                  if (col.key === 'opening_debit') return <th key="opening_grp" colSpan={2} className="cell-density text-right text-[11px] font-bold text-foreground uppercase tracking-wider print:text-[9px] border-b border-border">Opening Balance</th>;
                  if (col.key === 'current_debit') return <th key="current_grp" colSpan={2} className="cell-density text-right text-[11px] font-bold text-foreground uppercase tracking-wider print:text-[9px] border-b border-border border-l">Current Period</th>;
                  if (col.key === 'closing_debit') return <th key="closing_grp" colSpan={2} className="cell-density text-right text-[11px] font-bold text-foreground uppercase tracking-wider print:text-[9px] border-b border-border border-l">Closing Balance</th>;
                  if (col.key.endsWith('_credit')) return null;
                  
                  return <th key={col.key} rowSpan={2} className={cn(
                      'px-3 py-2.5 text-[11px] font-bold text-foreground uppercase tracking-wider whitespace-nowrap print:text-[9px]',
                      col.align === 'right' ? 'text-right' : 'text-left',
                      col.key === 'account_code' && 'sticky left-0 bg-card z-20 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'
                    )}>{col.label}</th>;
                })}
              </tr>
              <tr>
                {columns.map(col => {
                  if (col.key.endsWith('_debit') || col.key.endsWith('_credit')) {
                    return <th key={col.key} className={cn(
                      'px-3 py-2 text-[11px] font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap print:text-[9px]',
                      'text-right',
                      col.key.endsWith('_debit') && 'border-l border-border'
                    )}>{col.label}</th>;
                  }
                  return null;
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-border/30">
              {tree.map(root =>
                root.ledger_type === 'Group Ledger'
                  ? (
                    <GroupRow
                      key={root.id}
                      node={root}
                      columns={columns}
                      depth={0}
                      expandedGroups={expandedGroups}
                      onToggle={toggleGroup}
                      showZeroBalance={columnState.showZeroBalance}
                      partnerRows={partnerRows}
                      onGroupExpand={onGroupExpand}
                      reportType={reportType}
                    />
                  )
                  : (
                    <LedgerRow
                      key={root.id}
                      account={root}
                      columns={columns}
                      depth={0}
                    />
                  )
              )}
            </tbody>

            <tfoot className="bg-secondary border-t-2 border-border print:bg-slate-200">
              <tr>
                {columns.map(col => {
                  if (col.key === 'account_code') return (
                    <td key={col.key} className="cell-density font-bold text-xs text-foreground uppercase tracking-wider sticky left-0 bg-secondary z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] print:text-[9px] print:text-foreground">
                      GRAND TOTAL
                    </td>
                  );
                  return (
                    <td key={col.key} className="cell-density text-right font-bold text-sm tabular-nums font-mono text-foreground print:text-[10px] print:text-foreground">
                      {fmtNPR(grandTotals[col.key])}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="report-no-print px-4 py-1.5 border-t border-border text-xs text-muted-foreground bg-muted/10">
          {totalLeaves} ledger account{totalLeaves !== 1 ? 's' : ''} · {allGroupIds.length} group{allGroupIds.length !== 1 ? 's' : ''} ·{' '}
          <span className="text-primary font-medium">{expandedGroups.size} expanded</span>
        </div>
      </div>
    </div>
  );
}