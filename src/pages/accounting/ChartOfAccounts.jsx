import { useState, useEffect, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Edit2, Trash2, RefreshCw, ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Lock, LayoutList, Network } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import AccountFormModal from '@/components/accounting/AccountFormModal';

const TYPE_META = {
  Asset:               { badge: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500',    border: 'border-blue-200'   },
  Liability:           { badge: 'bg-red-100 text-red-700',      dot: 'bg-red-500',     border: 'border-red-200'    },
  Equity:              { badge: 'bg-purple-100 text-purple-700',dot: 'bg-purple-500',  border: 'border-purple-200' },
  Revenue:             { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  COGS:                { badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500',   border: 'border-amber-200'  },
  OPEX:                { badge: 'bg-orange-100 text-orange-700',dot: 'bg-orange-500',  border: 'border-orange-200' },
  'Cost of Goods Sold':{ badge: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500',   border: 'border-amber-200'  },
  'Other Income':      { badge: 'bg-teal-100 text-teal-700',    dot: 'bg-teal-500',    border: 'border-teal-200'   },
  'Other Expense':     { badge: 'bg-rose-100 text-rose-700',    dot: 'bg-rose-500',    border: 'border-rose-200'   },
  Expense:             { badge: 'bg-orange-100 text-orange-700',dot: 'bg-orange-500',  border: 'border-orange-200' },
};

const getMeta = (type) =>
  TYPE_META[type] || { badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400', border: 'border-slate-200' };

const fmt = (n) => (n || 0).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Sub Ledger Row (leaf) ─────────────────────────────────────────────────────
function SubLedgerRow({ acc, depth, onEdit, onDelete }) {
  const indent = depth * 20 + 16;
  return (
    <div
      className="flex items-center gap-3 py-2 pr-4 border-t border-border/30 hover:bg-slate-50 transition-colors group"
      style={{ paddingLeft: `${indent}px` }}
    >
      {/* connector line */}
      <span className="text-muted-foreground/30 text-xs select-none">└</span>
      <FileText className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
      <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{acc.account_code}</span>
      <span className="flex-1 text-sm text-foreground">{acc.account_name}</span>
      {acc.ifrs_reference && (
        <span className="hidden sm:inline text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 shrink-0">
          {acc.ifrs_reference}
        </span>
      )}
      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full shrink-0', acc.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400')}>
        {acc.is_active ? 'Active' : 'Inactive'}
      </span>
      <span className={cn('font-mono text-xs font-semibold w-28 text-right shrink-0', (acc.current_balance || 0) >= 0 ? 'text-emerald-700' : 'text-red-600')}>
        {fmt(acc.current_balance)}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Sub Ledgers are always editable — lock only applies to Groups */}
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(acc)}>
          <Edit2 className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={() => onDelete(acc)}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// ── Group Ledger Row (recursive) ──────────────────────────────────────────────
function GroupLedgerRow({ grp, children, depth, expanded, onToggle, onEdit, onDelete, onAddChild, expandedGroups, toggleGroup }) {
  const indent = depth * 20 + 8;
  const isExpanded = expanded;
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-2.5 pr-4 border-t border-border/40 cursor-pointer transition-colors group',
          depth === 0 ? 'bg-slate-50/80 hover:bg-slate-100/80' : 'bg-white hover:bg-slate-50'
        )}
        style={{ paddingLeft: `${indent}px` }}
        onClick={e => { e.stopPropagation(); onToggle(); }}
      >
        {/* Chevron */}
        <span className="w-4 h-4 shrink-0 flex items-center justify-center">
          {hasChildren
            ? isExpanded
              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            : <span className="w-3.5" />
          }
        </span>
        {/* Folder icon */}
        {isExpanded
          ? <FolderOpen className="w-4 h-4 text-primary/70 shrink-0" />
          : <Folder className="w-4 h-4 text-primary/60 shrink-0" />
        }
        <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{grp.account_code}</span>
        <span className={cn('font-semibold text-sm flex-1', depth === 0 ? 'text-foreground' : 'text-slate-700')}>
          {grp.account_name}
        </span>
        {grp.is_system_account && <Lock className="w-3 h-3 text-slate-400 shrink-0" title="System account — locked" />}
        {hasChildren && (
          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium shrink-0">
            {children.length}
          </span>
        )}
        <span className={cn('font-mono text-xs font-bold w-28 text-right shrink-0', (grp.current_balance || 0) >= 0 ? 'text-emerald-700' : 'text-red-600')}>
          {fmt(grp.current_balance)}
        </span>
        <div
          className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={e => e.stopPropagation()}
        >
          {/* Always allow adding children under any group */}
          <Button variant="ghost" size="icon" className="h-6 w-6" title="Add ledger under this group" onClick={() => onAddChild(grp)}>
            <Plus className="w-3 h-3" />
          </Button>
          {!grp.is_system_account && (
            <>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onEdit(grp)}>
                <Edit2 className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={() => onDelete(grp)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Children when expanded */}
      {isExpanded && hasChildren && (
        <div>
          {children.map(child =>
            child.ledger_type === 'Group Ledger'
              ? (
                <GroupLedgerRow
                  key={child.id}
                  grp={child}
                  children={child._children || []}
                  depth={depth + 1}
                  expanded={expandedGroups.has(child.id)}
                  onToggle={() => toggleGroup(child.id)}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onAddChild={onAddChild}
                  expandedGroups={expandedGroups}
                  toggleGroup={toggleGroup}
                />
              )
              : (
                <SubLedgerRow
                  key={child.id}
                  acc={child}
                  depth={depth + 1}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              )
          )}
        </div>
      )}
      {isExpanded && !hasChildren && (
        <p
          className="text-xs italic text-muted-foreground/60 py-1.5"
          style={{ paddingLeft: `${indent + 36}px` }}
        >
          No accounts — click + to add
        </p>
      )}
    </div>
  );
}

// ── Type Section (Level 0) ────────────────────────────────────────────────────
function TypeSection({ type, typeData, meta, isExpanded, onToggle, expandedGroups, toggleGroup, onEdit, onDelete, onAddChild, typeBalance, totalInType }) {
  return (
    <div>
      {/* Type header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left bg-white hover:bg-muted/20 transition-colors border-b border-border"
      >
        <span className={cn('w-2 h-2 rounded-full shrink-0', meta.dot)} />
        <span className="font-bold text-sm text-foreground flex-1">{type}</span>
        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', meta.badge, meta.border)}>
          {totalInType} accounts
        </span>
        <span className={cn('font-mono text-xs font-bold w-28 text-right shrink-0', typeBalance >= 0 ? 'text-emerald-700' : 'text-red-600')}>
          {fmt(typeBalance)}
        </span>
        {isExpanded
          ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        }
      </button>

      {/* Groups */}
      {isExpanded && (
        <div className="bg-white">
          {(typeData?.rootGroups || []).map(grp => (
            <GroupLedgerRow
              key={grp.id}
              grp={grp}
              children={grp._children || []}
              depth={0}
              expanded={expandedGroups.has(grp.id)}
              onToggle={() => toggleGroup(grp.id)}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              expandedGroups={expandedGroups}
              toggleGroup={toggleGroup}
            />
          ))}
          {(typeData?.ungrouped || []).map(sub => (
            <SubLedgerRow key={sub.id} acc={sub} depth={0} onEdit={onEdit} onDelete={onDelete} />
          ))}
          {(!typeData?.rootGroups?.length && !typeData?.ungrouped?.length) && (
            <p className="text-xs italic text-muted-foreground/60 px-8 py-2">No accounts in this category</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ChartOfAccounts() {
  const [accounts,       setAccounts]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState('');
  const [showModal,      setShowModal]      = useState(false);
  const [editAccount,    setEditAccount]    = useState(null);
  const [defaultParent,  setDefaultParent]  = useState(null);
  const [expandedTypes,  setExpandedTypes]  = useState(new Set());
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  const fetchAccounts = () => {
    setLoading(true);
    sajilo.entities.ChartOfAccount.list('account_code', 500).then(data => {
      setAccounts(data);
      setLoading(false);
    });
  };

  useEffect(() => { fetchAccounts(); }, []);

  const handleDelete = async (acc) => {
    // Only lock Group Ledgers marked as system — Sub Ledgers are freely deletable (subject to balance/GL checks)
    if (acc.is_system_account && acc.ledger_type === 'Group Ledger') {
      toast.error('System IFRS groups cannot be deleted');
      return;
    }

    // Check for non-zero balance
    if ((acc.current_balance || 0) !== 0) {
      toast.error(`Cannot delete "${acc.account_name}" — it has a non-zero balance (${fmt(acc.current_balance)} NPR).`);
      return;
    }

    // For groups: check that none of the descendants have balance or transactions
    if (acc.ledger_type === 'Group Ledger') {
      const descendants = accounts.filter(a => {
        // walk up parent chain to check if this account is an ancestor
        let cur = a;
        while (cur?.parent_account_id) {
          if (cur.parent_account_id === acc.id) return true;
          cur = accounts.find(x => x.id === cur.parent_account_id);
        }
        return false;
      });
      const withBalance = descendants.find(d => (d.current_balance || 0) !== 0);
      if (withBalance) {
        toast.error(`Cannot delete group "${acc.account_name}" — it contains ledger "${withBalance.account_name}" with a non-zero balance.`);
        return;
      }
    }

    if (!confirm(`Delete "${acc.account_name}"? This cannot be undone.`)) return;
    await sajilo.entities.ChartOfAccount.delete(acc.id);
    toast.success('Account deleted');
    fetchAccounts();
  };

  const handleEdit = (acc) => { setEditAccount(acc); setDefaultParent(null); setShowModal(true); };
  const handleAddChild = (grp) => { setEditAccount(null); setDefaultParent(grp); setShowModal(true); };

  const toggleType = (type) => setExpandedTypes(prev => { const n = new Set(prev); n.has(type) ? n.delete(type) : n.add(type); return n; });
  const toggleGroup = (id) => setExpandedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const { tree, allTypes, summary } = useMemo(() => {
    const lower = search.toLowerCase();
    const matches = (a) => !search || a.account_code?.toLowerCase().includes(lower) || a.account_name?.toLowerCase().includes(lower);

    // Index all accounts by id
    const byId = {};
    accounts.forEach(a => { byId[a.id] = { ...a, _children: [] }; });

    // Build parent-child links
    accounts.forEach(a => {
      if (a.parent_account_id && byId[a.parent_account_id]) {
        byId[a.parent_account_id]._children.push(byId[a.id]);
      }
    });

    // Group by account_type — root = no parent OR parent not in byId
    const typeMap = {};
    const sumMap  = {};

    accounts.forEach(a => {
      const type = a.account_type || 'Other';
      if (!typeMap[type]) typeMap[type] = { rootGroups: [], ungrouped: [] };
      if (!sumMap[type])  sumMap[type]  = { count: 0, balance: 0 };
      sumMap[type].count++;
      sumMap[type].balance += (a.current_balance || 0);
    });

    accounts.forEach(a => {
      const type = a.account_type || 'Other';
      const hasParent = a.parent_account_id && byId[a.parent_account_id];
      if (!hasParent) {
        if (a.ledger_type === 'Group Ledger') {
          typeMap[type].rootGroups.push(byId[a.id]);
        } else {
          if (matches(a)) typeMap[type].ungrouped.push(byId[a.id]);
        }
      }
    });

    // Filter search — if searching, show only matching paths
    if (search) {
      Object.keys(typeMap).forEach(type => {
        // For groups, keep if any descendant matches OR group itself matches
        const filterGroup = (node) => {
          node._children = node._children.filter(c => {
            if (c.ledger_type === 'Group Ledger') { filterGroup(c); return matches(c) || c._children.length > 0; }
            return matches(c);
          });
        };
        typeMap[type].rootGroups = typeMap[type].rootGroups.filter(g => {
          filterGroup(g);
          return matches(g.account_type !== undefined ? g : g) || g._children.length > 0;
        });
      });
    }

    const allTypes = Object.keys(typeMap).sort();
    return { tree: typeMap, allTypes, summary: sumMap };
  }, [accounts, search]);

  const allGroupIds = useMemo(() => {
    const ids = [];
    const walk = (nodes) => nodes.forEach(n => { if (n.ledger_type === 'Group Ledger') { ids.push(n.id); walk(n._children || []); } });
    Object.values(tree).forEach(t => walk(t.rootGroups || []));
    return ids;
  }, [tree]);

  const allExpanded = expandedTypes.size === allTypes.length && expandedGroups.size === allGroupIds.length;

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedTypes(new Set());
      setExpandedGroups(new Set());
    } else {
      setExpandedTypes(new Set(allTypes));
      setExpandedGroups(new Set(allGroupIds));
    }
  };

  // Auto-expand on search
  useEffect(() => {
    if (search) {
      setExpandedTypes(new Set(allTypes));
      setExpandedGroups(new Set(allGroupIds));
    }
  }, [search, allTypes.join(','), allGroupIds.join(',')]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search account code or name…" className="pl-9" />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleExpandAll}
          className="gap-1.5"
          title={allExpanded ? 'Collapse all' : 'Expand all'}
        >
          {allExpanded ? <LayoutList className="w-4 h-4" /> : <Network className="w-4 h-4" />}
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </Button>
        <Button variant="outline" size="icon" onClick={fetchAccounts}><RefreshCw className="w-4 h-4" /></Button>
        <Button onClick={() => { setEditAccount(null); setDefaultParent(null); setShowModal(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Add Account
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><Folder className="w-3.5 h-3.5 text-primary/60" /> Group Ledger</span>
        <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5 text-muted-foreground/60" /> Sub Ledger</span>
        <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5 text-slate-400" /> System / Locked</span>
      </div>

      {/* Tree */}
      <div className="border border-border rounded-xl overflow-hidden bg-white">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto_auto] items-center px-4 py-2 bg-slate-100 border-b border-border text-[11px] font-bold uppercase tracking-wider text-slate-500 gap-2">
          <span>Account Code — Name</span>
          <span className="w-28 text-right">Balance (NPR)</span>
          <span className="w-20" />
        </div>

        {loading ? (
          <div className="p-6 space-y-2">
            {Array(8).fill(0).map((_, i) => <div key={i} className="h-9 bg-muted rounded animate-pulse" />)}
          </div>
        ) : allTypes.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm">No accounts found.</div>
        ) : (
          <div className="divide-y divide-border">
            {allTypes.map(type => (
              <TypeSection
                key={type}
                type={type}
                typeData={tree[type]}
                meta={getMeta(type)}
                isExpanded={expandedTypes.has(type)}
                onToggle={() => toggleType(type)}
                expandedGroups={expandedGroups}
                toggleGroup={toggleGroup}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onAddChild={handleAddChild}
                typeBalance={summary[type]?.balance || 0}
                totalInType={summary[type]?.count || 0}
              />
            ))}
          </div>
        )}
      </div>

      <AccountFormModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditAccount(null); setDefaultParent(null); }}
        account={editAccount}
        parentAccounts={accounts}
        defaultParent={defaultParent}
        onSaved={fetchAccounts}
      />
    </div>
  );
}