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
function computeSubtreeTotals(node) {
  if (node.ledger_type !== 'Group Ledger') {
    // Leaf node — return its own values
    return {
      opening_debit:  node.opening_debit  || 0,
      opening_credit: node.opening_credit || 0,
      current_debit:  node.current_debit  || 0,
      current_credit: node.current_credit || 0,
      closing_debit:  node.closing_debit  || 0,
      closing_credit: node.closing_credit || 0,
    };
  }
  // Group node — aggregate children recursively
  return node._children.reduce(
    (acc, child) => {
      const t = computeSubtreeTotals(child);
      return {
        opening_debit:  acc.opening_debit  + t.opening_debit,
        opening_credit: acc.opening_credit + t.opening_credit,
        current_debit:  acc.current_debit  + t.current_debit,
        current_credit: acc.current_credit + t.current_credit,
        closing_debit:  acc.closing_debit  + t.closing_debit,
        closing_credit: acc.closing_credit + t.closing_credit,
      };
    },
    { opening_debit: 0, opening_credit: 0, current_debit: 0, current_credit: 0, closing_debit: 0, closing_credit: 0 }
  );
}

// ── Ledger (leaf) row ─────────────────────────────────────────────────────────
function LedgerRow({ account, columns, depth }) {
  const indent = depth * 20 + 8;
  return (
    <tr className="hover:bg-muted/50 transition-colors print:hover:bg-transparent">
      {columns.map(col => {
        if (col.key === 'account_code') return (
          <td key={col.key} className="py-1.5 font-mono text-xs text-muted-foreground whitespace-nowrap print:text-[9px]"
            style={{ paddingLeft: `${indent}px`, paddingRight: '8px' }}>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground/30 text-xs select-none shrink-0">└</span>
              <FileText className="w-3 h-3 text-muted-foreground/50 shrink-0" />
              <span>{account.account_code || '—'}</span>
            </div>
          </td>
        );
        if (col.key === 'account_name') return (
          <td key={col.key} className="px-2 py-1.5 text-sm text-foreground print:text-[10px]"
            style={{ wordBreak: 'break-word' }}>
            {account.account_name}
          </td>
        );
        if (col.key === 'account_type') return (
          <td key={col.key} className="px-2 py-1.5 print:hidden">
            <TypeBadge type={account.account_type} />
          </td>
        );
        const raw = account[col.key];
        const isNumeric = col.key.endsWith('_debit') || col.key.endsWith('_credit') || ['opening_balance','closing_balance','debit','credit'].includes(col.key);
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
function GroupRow({ node, columns, depth, expandedGroups, onToggle, showZeroBalance, partnerRows, onGroupExpand }) {
  const indent = depth * 20 + 8;
  const isExpanded = expandedGroups.has(node.id);
  const children = node._children || [];
  const hasChildren = children.length > 0;

  // Totals computed from this subtree's leaves
  const totals = computeSubtreeTotals(node);

  const displayTotals = totals;

  // Determine depth-based styling
  const bgClass = depth === 0
    ? 'bg-slate-200/80 hover:bg-slate-200'
    : depth === 1
    ? 'bg-slate-100 dark:bg-slate-500/20/80 hover:bg-slate-100 dark:bg-slate-500/20'
    : 'bg-muted/50/80 hover:bg-muted/50';

  const fontClass = depth === 0
    ? 'font-bold text-foreground'
    : depth === 1
    ? 'font-semibold text-foreground'
    : 'font-medium text-muted-foreground';

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
        className={cn('cursor-pointer select-none border-t border-border/60 print-group-row', bgClass)}
        onClick={handleToggle}
      >
        {columns.map(col => {
          if (col.key === 'account_code') return (
            <td key={col.key} className="py-2 font-mono text-xs font-bold text-muted-foreground whitespace-nowrap print:text-[9px]"
              style={{ paddingLeft: `${indent}px`, paddingRight: '8px' }}>
              <div className="flex items-center gap-1.5">
                {hasChildren || isControlAccount
                  ? isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0 report-no-print" />
                    : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 report-no-print" />
                  : <span className="w-3.5 shrink-0" />
                }
                {isExpanded
                  ? <FolderOpen className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                  : <Folder className="w-3.5 h-3.5 text-primary/50 shrink-0" />
                }
                {node.is_system_account && <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
                <span>{node.account_code || '—'}</span>
              </div>
            </td>
          );
          if (col.key === 'account_name') return (
            <td key={col.key} className={cn('px-2 py-2 print:text-[10px]', fontClass)} style={{ wordBreak: 'break-word' }}>
              {node.account_name}
              {hasChildren && (
                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground report-no-print">
                  ({children.length})
                </span>
              )}
            </td>
          );
          if (col.key === 'account_type') return (
            <td key={col.key} className="px-2 py-2 print:hidden">
              <TypeBadge type={node.account_type} />
            </td>
          );
          const val = displayTotals[col.key];
          return (
            <td key={col.key} className={cn('px-2 py-2 text-sm tabular-nums font-mono print:text-[10px]', fontClass, col.align === 'right' && 'text-right')}>
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
  accounts, columnState, filename, companyName, reportTitle, fromDate, toDate, partnerRows, onGroupExpand
}) {
  const columns = buildVisibleColumns(columnState);

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
        const t = computeSubtreeTotals(root);
        return {
          opening_debit:  acc.opening_debit  + t.opening_debit,
          opening_credit: acc.opening_credit + t.opening_credit,
          current_debit:  acc.current_debit  + t.current_debit,
          current_credit: acc.current_credit + t.current_credit,
          closing_debit:  acc.closing_debit  + t.closing_debit,
          closing_credit: acc.closing_credit + t.closing_credit,
        };
      },
      { opening_debit: 0, opening_credit: 0, current_debit: 0, current_credit: 0, closing_debit: 0, closing_credit: 0 }
    );
  }, [tree]);

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
        columns,
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
  }, [tree, columns, columnState, filename, companyName, reportTitle, fromDate, toDate]);

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
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse print:text-[10px]" style={{ tableLayout: 'fixed' }}>
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

            <thead className="bg-slate-800 border-b-2 border-slate-600 sticky top-0 z-10">
              <tr>
                {columns.map(col => {
                  if (col.key === 'opening_debit') return <th key="opening_grp" colSpan={2} className="px-3 py-2 text-center text-[11px] font-bold text-slate-100 uppercase tracking-wider print:text-[9px] border-b border-slate-600">Opening Balance</th>;
                  if (col.key === 'current_debit') return <th key="current_grp" colSpan={2} className="px-3 py-2 text-center text-[11px] font-bold text-slate-100 uppercase tracking-wider print:text-[9px] border-b border-slate-600 border-l border-slate-700">Current Period</th>;
                  if (col.key === 'closing_debit') return <th key="closing_grp" colSpan={2} className="px-3 py-2 text-center text-[11px] font-bold text-slate-100 uppercase tracking-wider print:text-[9px] border-b border-slate-600 border-l border-slate-700">Closing Balance</th>;
                  if (col.key.endsWith('_credit')) return null;
                  
                  return <th key={col.key} rowSpan={2} className={cn(
                      'px-3 py-2.5 text-[11px] font-bold text-slate-100 uppercase tracking-wider whitespace-nowrap print:text-[9px]',
                      col.align === 'right' ? 'text-right' : 'text-left',
                      col.key === 'account_type' && 'print:hidden'
                    )}>{col.label}</th>;
                })}
              </tr>
              <tr>
                {columns.map(col => {
                  if (col.key.endsWith('_debit') || col.key.endsWith('_credit')) {
                    return <th key={col.key} className={cn(
                      'px-3 py-2 text-[11px] font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap print:text-[9px]',
                      col.align === 'right' ? 'text-right' : 'text-left',
                      col.key.endsWith('_debit') && 'border-l border-slate-700'
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

            <tfoot className="bg-slate-700 border-t-2 border-slate-500 print:bg-slate-200">
              <tr>
                {columns.map(col => {
                  if (col.key === 'account_code') return (
                    <td key={col.key} className="px-3 py-2.5 font-bold text-xs text-white uppercase tracking-wider print:text-[9px] print:text-foreground">
                      GRAND TOTAL
                    </td>
                  );
                  if (col.key === 'account_name' || col.key === 'account_type') return (
                    <td key={col.key} className={cn('px-3 py-2.5', col.key === 'account_type' && 'print:hidden')} />
                  );
                  return (
                    <td key={col.key} className="px-3 py-2.5 text-right font-bold text-sm tabular-nums font-mono text-white print:text-[10px] print:text-foreground">
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