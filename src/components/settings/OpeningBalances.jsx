import { useState, useEffect, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, RefreshCw, ChevronDown, ChevronRight, Search, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const TYPE_META = {
  Asset:    { dot: 'bg-blue-500',    badge: 'bg-blue-100 text-blue-700' },
  Liability:{ dot: 'bg-red-500',     badge: 'bg-red-100 text-red-700' },
  Equity:   { dot: 'bg-purple-500',  badge: 'bg-purple-100 text-purple-700' },
  Revenue:  { dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  COGS:     { dot: 'bg-amber-500',   badge: 'bg-amber-100 text-amber-700' },
  OPEX:     { dot: 'bg-orange-500',  badge: 'bg-orange-100 text-orange-700' },
};
const getMeta = (t) => TYPE_META[t] || { dot: 'bg-slate-400', badge: 'bg-slate-100 text-slate-600' };

const TABS = [
  { id: 'accounts',  label: 'Accounts'  },
  { id: 'customers', label: 'Customers' },
  { id: 'suppliers', label: 'Suppliers' },
];

// ── Accounts Tab ──────────────────────────────────────────────────────────────
function AccountsTab({ openingDate }) {
  const [accounts, setAccounts]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [search, setSearch]               = useState('');
  const [expandedTypes, setExpandedTypes] = useState(new Set());
  const [edits, setEdits]                 = useState({});
  const [saved, setSaved]                 = useState(false);
  const [currentUser, setCurrentUser]     = useState(null);

  useEffect(() => {
    fetchAll();
    sajilo.auth.me().then(u => setCurrentUser(u)).catch(() => {});
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const data = await sajilo.entities.ChartOfAccount.list('account_code', 500);
    setAccounts(data);
    setLoading(false);
    setEdits({});
  };

  const subLedgers = useMemo(() => {
    const groupMap = {};
    accounts.forEach(a => { if (a.ledger_type === 'Group Ledger') groupMap[a.id] = a.account_name; });
    return accounts
      .filter(a => a.ledger_type === 'Sub Ledger' || !a.ledger_type)
      .map(a => ({ ...a, account_group: a.parent_account_id ? (groupMap[a.parent_account_id] || '—') : '—' }));
  }, [accounts]);

  const tree = useMemo(() => {
    const map = {};
    const lc = search.toLowerCase();
    subLedgers.forEach(a => {
      if (search && !a.account_code?.toLowerCase().includes(lc) && !a.account_name?.toLowerCase().includes(lc)) return;
      const type = a.account_type || 'Other';
      if (!map[type]) map[type] = [];
      map[type].push(a);
    });
    return map;
  }, [subLedgers, search]);

  const allTypes = Object.keys(tree).sort();
  useEffect(() => { if (search) setExpandedTypes(new Set(allTypes)); }, [search]);

  const toggleType = (t) => setExpandedTypes(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n; });

  const getEditById = (id) => {
    const acc = accounts.find(a => a.id === id);
    return edits[id] || {
      opening_balance: acc?.opening_balance ?? acc?.current_balance ?? 0,
      balance_type: acc?.normal_balance || 'Debit',
      opening_date: acc?.opening_date || openingDate,
    };
  };
  const getEdit = (acc) => getEditById(acc.id);
  const setEdit = (accId, field, val) => {
    setEdits(prev => ({ ...prev, [accId]: { ...getEditById(accId), [field]: val } }));
    setSaved(false);
  };

  const handleSave = async () => {
    const changedIds = Object.keys(edits);
    if (changedIds.length === 0) { toast.info('No changes to save'); return; }
    setSaving(true);
    try {
  const logs = [];
      for (const id of changedIds) {
        const acc = accounts.find(a => a.id === id);
        if (!acc) continue;
        const e = edits[id];
        const prevBalance = acc.opening_balance ?? acc.current_balance ?? 0;
        const newBalance  = Number(e.opening_balance ?? prevBalance);
        await sajilo.entities.ChartOfAccount.update(id, {
          current_balance: newBalance,
          normal_balance:  e.balance_type || acc.normal_balance,
        });
        if (prevBalance !== newBalance) {
          logs.push({
            account_id: id, account_code: acc.account_code, account_name: acc.account_name,
            account_group: acc.parent_account_name || '—', opening_date: e.opening_date || openingDate,
            previous_balance: prevBalance, new_balance: newBalance,
            balance_type: e.balance_type || acc.normal_balance || 'Debit',
            changed_by: currentUser?.email || 'system', change_reason: 'Opening balance set via Settings',
          });
        }
      }
      if (logs.length > 0) await sajilo.entities.OpeningBalanceLog.bulkCreate(logs);
      toast.success(`Saved opening balances for ${changedIds.length} account(s)`);
        } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    } setSaved(true); fetchAll();
  };

  const dirtyCount = Object.keys(edits).length;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-border rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-sm">Chart of Accounts — Opening Balances</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Set the opening balance for all sub-ledger accounts.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || dirtyCount === 0} className="gap-1.5">
              {saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Saving…</> : <><Save className="w-3.5 h-3.5" />Save {dirtyCount > 0 ? `(${dirtyCount})` : ''}</>}
            </Button>
          </div>
        </div>
        {saved && dirtyCount === 0 && (
          <div className="flex items-center gap-2 mt-2 text-xs text-emerald-600"><CheckCircle className="w-3.5 h-3.5" />All changes saved</div>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search account code or name…" className="pl-9" />
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[120px_1fr_160px_140px_140px_100px] bg-muted/30 border-b border-border px-4 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground">Account Code</span>
          <span className="text-xs font-semibold text-muted-foreground">Name of Ledger</span>
          <span className="text-xs font-semibold text-muted-foreground">Account Group</span>
          <span className="text-xs font-semibold text-muted-foreground">Opening Date</span>
          <span className="text-xs font-semibold text-muted-foreground text-right">Opening Balance</span>
          <span className="text-xs font-semibold text-muted-foreground text-center">Dr / Cr</span>
        </div>
        {loading ? (
          <div className="p-8 space-y-2">{Array(8).fill(0).map((_, i) => <div key={i} className="h-9 bg-muted rounded animate-pulse" />)}</div>
        ) : allTypes.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-10">No accounts found</p>
        ) : (
          <div className="divide-y divide-border">
            {allTypes.map(type => {
              const meta = getMeta(type);
              const rows = tree[type] || [];
              const isExpanded = expandedTypes.has(type);
              return (
                <div key={type}>
                  <button onClick={() => toggleType(type)} className="w-full flex items-center gap-3 px-4 py-2.5 bg-muted/20 hover:bg-muted/30 transition-colors text-left">
                    <span className={cn('w-2 h-2 rounded-full shrink-0', meta.dot)} />
                    <span className="font-bold text-sm flex-1">{type}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium mr-2', meta.badge)}>{rows.length} accounts</span>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {isExpanded && rows.map(acc => {
                    const e = getEdit(acc);
                    const isDirty = !!edits[acc.id];
                    return (
                      <div key={acc.id} className={cn('grid grid-cols-[120px_1fr_160px_140px_140px_100px] items-center px-4 py-2 border-b border-border/40 hover:bg-muted/10', isDirty && 'bg-amber-50/50')}>
                        <span className="font-mono text-xs text-muted-foreground pr-2">{acc.account_code}</span>
                        <div className="pr-2">
                          <span className="text-sm font-medium">{acc.account_name}</span>
                          {isDirty && <span className="ml-1.5 text-xs text-amber-600 font-medium">●</span>}
                        </div>
                        <span className="text-xs text-muted-foreground pr-2 truncate">{acc.account_group}</span>
                        <div className="pr-2">
                          <input type="date" value={e.opening_date || openingDate} onChange={ev => setEdit(acc.id, 'opening_date', ev.target.value)}
                            className="w-full h-7 border border-input rounded-md px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-transparent" />
                        </div>
                        <div className="pr-2">
                          <Input type="number" value={e.opening_balance ?? 0} onChange={ev => setEdit(acc.id, 'opening_balance', Number(ev.target.value))} className="h-7 text-xs text-right font-mono" />
                        </div>
                        <div className="flex justify-center">
                          <Select value={e.balance_type || 'Debit'} onValueChange={v => setEdit(acc.id, 'balance_type', v)}>
                            <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Debit">Dr</SelectItem>
                              <SelectItem value="Credit">Cr</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {dirtyCount > 0 && (
        <div className="sticky bottom-0 bg-white border-t border-amber-300 shadow-lg rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-amber-700">{dirtyCount} account{dirtyCount > 1 ? 's' : ''} modified — unsaved changes</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchAll}>Discard</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save All Changes'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Partners Tab (Customers / Suppliers) ──────────────────────────────────────
function PartnersTab({ mode, openingDate }) {
  const [partners, setPartners] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [search, setSearch]     = useState('');
  const [edits, setEdits]       = useState({});
  const [saved, setSaved]       = useState(false);

  const filterKey    = mode === 'customers' ? 'is_customer' : 'is_vendor';
  const controlLabel = mode === 'customers' ? 'Trade Accounts Receivable' : 'Trade Accounts Payable';
  const label        = mode === 'customers' ? 'Customer' : 'Supplier';

  useEffect(() => { fetchAll(); }, [mode]);

  const fetchAll = async () => {
    setLoading(true);
    const [partnerData, accountData] = await Promise.all([
      sajilo.entities.BusinessPartner.filter({ [filterKey]: true }),
      sajilo.entities.ChartOfAccount.list('account_code', 500),
    ]);
    setPartners(partnerData.filter(p => p.is_active !== false));
    setAccounts(accountData);
    setLoading(false);
    setEdits({});
  };

  const getEdit = (p) => edits[p.id] || {
    opening_balance:      p.opening_balance ?? 0,
    opening_balance_type: p.opening_balance_type || (mode === 'customers' ? 'Dr' : 'Cr'),
    opening_balance_date: p.opening_balance_date || openingDate,
  };

  const setEdit = (id, field, val) => {
    const p = partners.find(x => x.id === id);
    const current = edits[id] || getEdit(p);
    setEdits(prev => ({ ...prev, [id]: { ...current, [field]: val } }));
    setSaved(false);
  };

  const syncControlAccount = async (mergedPartners) => {
    let total = 0;
    for (const p of mergedPartners) {
      const amt = Number(p.opening_balance) || 0;
      if (mode === 'customers') {
        total += p.opening_balance_type === 'Dr' ? amt : -amt;
      } else {
        total += p.opening_balance_type === 'Cr' ? amt : -amt;
      }
    }
    const controlAccount = accounts.find(a =>
      (mode === 'customers'
        ? a.account_name?.toLowerCase().includes('receivable')
        : a.account_name?.toLowerCase().includes('payable'))
      && a.ledger_type === 'Sub Ledger'
    ) || accounts.find(a =>
      mode === 'customers'
        ? a.account_name?.toLowerCase().includes('receivable')
        : a.account_name?.toLowerCase().includes('payable')
    );
    if (controlAccount) {
      await sajilo.entities.ChartOfAccount.update(controlAccount.id, {
        current_balance: Math.abs(total),
        normal_balance: total >= 0
          ? (mode === 'customers' ? 'Debit' : 'Credit')
          : (mode === 'customers' ? 'Credit' : 'Debit'),
      });
      return controlAccount.account_name;
    }
    return null;
  };

  const handleSave = async () => {
    const changedIds = Object.keys(edits);
    if (changedIds.length === 0) { toast.info('No changes to save'); return; }
    setSaving(true);
    try {
  const mergedPartners = partners.map(p => ({ ...p, ...(edits[p.id] || {}) }));
      for (const id of changedIds) {
        const e = edits[id];
        await sajilo.entities.BusinessPartner.update(id, {
          opening_balance:      Number(e.opening_balance) || 0,
          opening_balance_type: e.opening_balance_type,
          opening_balance_date: e.opening_balance_date || openingDate,
        });
      }
      const syncedName = await syncControlAccount(mergedPartners);
      toast.success(syncedName
        ? `Saved ${changedIds.length} partner(s) & synced '${syncedName}'`
        : `Saved ${changedIds.length} partner(s) (control account not found in COA)`
      );
        } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    } setSaved(true); fetchAll();
  };

  const filtered = useMemo(() => {
    const lc = search.toLowerCase();
    if (!search) return partners;
    return partners.filter(p => p.name?.toLowerCase().includes(lc) || p.partner_code?.toLowerCase().includes(lc));
  }, [partners, search]);

  const dirtyCount = Object.keys(edits).length;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-border rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-semibold text-sm">{label} Opening Balances</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              On save, <strong>{controlLabel}</strong> in the Chart of Accounts is automatically recalculated.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || dirtyCount === 0} className="gap-1.5">
              {saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Saving…</> : <><Save className="w-3.5 h-3.5" />Save {dirtyCount > 0 ? `(${dirtyCount})` : ''}</>}
            </Button>
          </div>
        </div>
        {saved && dirtyCount === 0 && (
          <div className="flex items-center gap-2 mt-2 text-xs text-emerald-600"><CheckCircle className="w-3.5 h-3.5" />All changes saved</div>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()} name or code…`} className="pl-9" />
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[120px_1fr_120px_140px_140px_100px] bg-muted/30 border-b border-border px-4 py-2.5">
          <span className="text-xs font-semibold text-muted-foreground">Code</span>
          <span className="text-xs font-semibold text-muted-foreground">Name</span>
          <span className="text-xs font-semibold text-muted-foreground">Tax ID</span>
          <span className="text-xs font-semibold text-muted-foreground">Opening Date</span>
          <span className="text-xs font-semibold text-muted-foreground text-right">Opening Balance</span>
          <span className="text-xs font-semibold text-muted-foreground text-center">Dr / Cr</span>
        </div>
        {loading ? (
          <div className="p-8 space-y-2">{Array(6).fill(0).map((_, i) => <div key={i} className="h-9 bg-muted rounded animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-10">No {label.toLowerCase()}s found</p>
        ) : (
          <div className="divide-y divide-border/40">
            {filtered.map(p => {
              const e = getEdit(p);
              const isDirty = !!edits[p.id];
              return (
                <div key={p.id} className={cn('grid grid-cols-[120px_1fr_120px_140px_140px_100px] items-center px-4 py-2 hover:bg-muted/10 transition-colors', isDirty && 'bg-amber-50/50')}>
                  <span className="font-mono text-xs text-muted-foreground pr-2">{p.partner_code || '—'}</span>
                  <div className="pr-2">
                    <span className="text-sm font-medium">{p.name}</span>
                    {isDirty && <span className="ml-1.5 text-xs text-amber-600 font-medium">●</span>}
                  </div>
                  <span className="text-xs text-muted-foreground pr-2 truncate">{p.tax_id_number || '—'}</span>
                  <div className="pr-2">
                    <input type="date" value={e.opening_balance_date || openingDate} onChange={ev => setEdit(p.id, 'opening_balance_date', ev.target.value)}
                      className="w-full h-7 border border-input rounded-md px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-transparent" />
                  </div>
                  <div className="pr-2">
                    <Input type="number" value={e.opening_balance ?? 0} onChange={ev => setEdit(p.id, 'opening_balance', Number(ev.target.value))} className="h-7 text-xs text-right font-mono" />
                  </div>
                  <div className="flex justify-center">
                    <Select value={e.opening_balance_type || 'Dr'} onValueChange={v => setEdit(p.id, 'opening_balance_type', v)}>
                      <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dr">Dr</SelectItem>
                        <SelectItem value="Cr">Cr</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
        💡 On save, <strong>{controlLabel}</strong> in Chart of Accounts will be automatically updated to reflect the aggregate of all {label.toLowerCase()} opening balances.
      </div>

      {dirtyCount > 0 && (
        <div className="sticky bottom-0 bg-white border-t border-amber-300 shadow-lg rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-amber-700">{dirtyCount} {label.toLowerCase()}{dirtyCount > 1 ? 's' : ''} modified — unsaved changes</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchAll}>Discard</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save All Changes'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Root Component ─────────────────────────────────────────────────────────────
export default function OpeningBalances() {
  const [activeTab, setActiveTab] = useState('accounts');
  const openingDate = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="space-y-4">
      {/* Tab Bar */}
      <div className="flex gap-1 bg-muted/40 border border-border rounded-xl p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-6 py-2 text-sm font-semibold rounded-lg transition-all',
              activeTab === tab.id
                ? 'bg-white text-primary shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/50'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'accounts'  && <AccountsTab openingDate={openingDate} />}
      {activeTab === 'customers' && <PartnersTab mode="customers" openingDate={openingDate} />}
      {activeTab === 'suppliers' && <PartnersTab mode="suppliers" openingDate={openingDate} />}
    </div>
  );
}