import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Pencil, Trash2, Search, Landmark, Banknote, Building, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import BankAccountFormModal from '@/components/treasury/BankAccountFormModal';
import BankAccountDetailDrawer from '@/components/treasury/BankAccountDetailDrawer';
import { toast } from 'sonner';

const GROUP_ORDER = ['Cash', 'Bank'];

const typeStyle = {
  Cash: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',
  Bank: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
};

const categoryStyle = {
  Current: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  Savings: 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400',
  Overdraft: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
  'Fixed Deposit': 'bg-yellow-50 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  'Cash in Hand': 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
};

function formatNPR(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function BankAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [glBalances, setGlBalances] = useState({}); // { gl_account_id -> current_balance }
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [detailAccount, setDetailAccount] = useState(null);

  useEffect(() => { fetchAccounts(); }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    const [data, coaAccs] = await Promise.all([
      sajilo.entities.BankAccount.list('-created_date', 500),
      sajilo.entities.ChartOfAccount.list('account_code', 500),
    ]);
    setAccounts(data);
    // Build a map of gl_account_id -> current_balance from COA
    const map = {};
    coaAccs.forEach(a => { map[a.id] = a.current_balance ?? 0; });
    setGlBalances(map);
    setLoading(false);
  };

  // Get the live COA balance for an account; fall back to stored current_balance
  const getLiveBalance = (acc) => {
    if (acc.gl_account_id && glBalances[acc.gl_account_id] !== undefined) {
      return glBalances[acc.gl_account_id];
    }
    return acc.current_balance || 0;
  };

  const handleSave = async (formData) => {
    if (editing) {
      await sajilo.entities.BankAccount.update(editing.id, formData);
      toast.success('Account updated');
    } else {
      await sajilo.entities.BankAccount.create(formData);
      toast.success('Account created');
    }
    setModalOpen(false);
    setEditing(null);
    fetchAccounts();
  };

  const handleDelete = async (acc) => {
    if (!confirm(`Delete "${acc.account_name}"? This cannot be undone.`)) return;
    await sajilo.entities.BankAccount.delete(acc.id);
    toast.success('Account deleted');
    fetchAccounts();
  };

  const filtered = accounts.filter(a =>
    !search ||
    a.account_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.bank_name?.toLowerCase().includes(search.toLowerCase()) ||
    a.account_number?.includes(search) ||
    a.branch_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Group by type
  const grouped = GROUP_ORDER.map(type => ({
    type,
    items: filtered.filter(a => a.account_type === type),
  }));

  const toggleGroup = (type) => setCollapsed(prev => ({ ...prev, [type]: !prev[type] }));

  const totalCash = accounts.filter(a => a.account_type === 'Cash' && a.is_active !== false).reduce((s, a) => s + getLiveBalance(a), 0);
  const totalBank = accounts.filter(a => a.account_type === 'Bank' && a.is_active !== false).reduce((s, a) => s + getLiveBalance(a), 0);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cash &amp; Bank</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage cash accounts and bank account ledgers</p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" /> New Account
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Banknote className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Cash Balance</p>
            <p className="text-lg font-bold text-foreground">NPR {formatNPR(totalCash)}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shrink-0">
            <Landmark className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Total Bank Balance</p>
            <p className="text-lg font-bold text-foreground">NPR {formatNPR(totalBank)}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Building className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Combined Balance</p>
            <p className="text-lg font-bold text-foreground">NPR {formatNPR(totalCash + totalBank)}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, bank, account no…" className="pl-9" />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
      </div>

      {/* Grouped Tables */}
      {loading ? (
        <div className="space-y-3">{Array(3).fill(0).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />
        ))}</div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ type, items }) => {
            const isCollapsed = collapsed[type];
            const groupTotal = items.filter(a => a.is_active !== false).reduce((s, a) => s + getLiveBalance(a), 0);
            return (
              <div key={type} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(type)}
                  className="w-full flex items-center justify-between px-5 py-3 bg-muted/30 hover:bg-muted/50 transition-colors border-b border-border"
                >
                  <div className="flex items-center gap-2">
                    {type === 'Cash' ? <Banknote className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Landmark className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                    <span className="font-semibold text-sm text-foreground">{type === 'Cash' ? 'Cash Accounts' : 'Bank Accounts'}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{items.length}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-foreground hidden sm:block">NPR {formatNPR(groupTotal)}</span>
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    {items.length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground text-sm">
                        No {type.toLowerCase()} accounts found.{' '}
                        <button onClick={() => { setEditing(null); setModalOpen(true); }} className="text-primary hover:underline">Add one</button>.
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="border-b border-border bg-muted/10">
                          <tr>
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-muted-foreground">Account Name</th>
                            {type === 'Bank' && <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Bank / Branch</th>}
                            {type === 'Bank' && <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Account No.</th>}
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Ledger Group</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">GL Account</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Current Bal.</th>
                            <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                            <th className="px-4 py-2.5" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {items.map(acc => (
                            <tr key={acc.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-5 py-3">
                                <button className="text-left hover:underline" onClick={() => setDetailAccount(acc)}>
                                  <p className="font-medium text-primary">{acc.account_name}</p>
                                  {acc.account_holder_name && <p className="text-xs text-muted-foreground">{acc.account_holder_name}</p>}
                                </button>
                              </td>
                              {type === 'Bank' && (
                                <td className="px-4 py-3">
                                  <p className="text-foreground">{acc.bank_name || '—'}</p>
                                  {acc.branch_name && <p className="text-xs text-muted-foreground">{acc.branch_name}</p>}
                                </td>
                              )}
                              {type === 'Bank' && (
                                <td className="px-4 py-3 font-mono text-sm text-foreground">{acc.account_number || '—'}</td>
                              )}
                              <td className="px-4 py-3">
                                <div>
                                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', categoryStyle[acc.account_category] || 'bg-muted text-muted-foreground')}>
                                    {acc.account_category || '—'}
                                  </span>
                                  {acc.ledger_group_name && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{acc.ledger_group_name}</p>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{acc.gl_account_name || '—'}</td>
                              <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-foreground">{formatNPR(getLiveBalance(acc))}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', acc.is_active !== false ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
                                  {acc.is_active !== false ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1 justify-end">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(acc); setModalOpen(true); }}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(acc)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t border-border bg-muted/10">
                          <tr>
                            <td colSpan={type === 'Bank' ? 5 : 3} className="px-5 py-2 text-xs font-semibold text-muted-foreground">Total</td>
                            <td className="px-4 py-2 text-right font-bold text-sm text-foreground font-mono">
                              {formatNPR(items.reduce((s, a) => s + getLiveBalance(a), 0))}
                            </td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <BankAccountFormModal
          account={editing}
          onSave={handleSave}
          onClose={() => { setModalOpen(false); setEditing(null); }}
        />
      )}

      {detailAccount && (
        <BankAccountDetailDrawer
          account={detailAccount}
          onClose={() => setDetailAccount(null)}
          onEdit={() => { setEditing(detailAccount); setDetailAccount(null); setModalOpen(true); }}
        />
      )}
    </div>
  );
}