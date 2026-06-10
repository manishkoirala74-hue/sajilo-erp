import { useState, useEffect, useMemo } from 'react';
import { useDateFormat } from '@/lib/DateFormatContext';
import { sajilo } from '@/api/sajiloClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Eye, RefreshCw, BookOpen, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import DateInput from '@/components/shared/DateInput';
import { cn } from '@/lib/utils';
import JournalEntryModal from '@/components/accounting/JournalEntryModal';
import JournalDetailDrawer from '@/components/accounting/JournalDetailDrawer';

const MODULE_COLORS = {
  Manufacturing: 'bg-orange-100 text-orange-700',
  Payroll: 'bg-purple-100 text-purple-700',
  Assets: 'bg-blue-100 text-blue-700',
  General: 'bg-slate-100 text-slate-600',
  Sales: 'bg-emerald-100 text-emerald-700',
  Purchase: 'bg-amber-100 text-amber-700',
  Stock: 'bg-cyan-100 text-cyan-700',
};

const STATUS_ICON = {
  Posted: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
  Draft: <Clock className="w-3.5 h-3.5 text-amber-500" />,
  Reversed: <AlertCircle className="w-3.5 h-3.5 text-red-500" />,
};

const STATUS_COLORS = {
  Posted: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  Draft: 'text-amber-700 bg-amber-50 border-amber-200',
  Reversed: 'text-red-700 bg-red-50 border-red-200',
};

export default function GeneralLedger() {
  const { formatDate } = useDateFormat();
  const [journals, setJournals] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState(null);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      sajilo.entities.GeneralLedgerJournal.list('-entry_date', 200),
      sajilo.entities.ChartOfAccount.list('account_code', 500),
    ]).then(([j, a]) => { setJournals(j); setAccounts(a); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => journals.filter(j => {
    const matchSearch = !search || j.description?.toLowerCase().includes(search.toLowerCase()) || j.source_document_type?.toLowerCase().includes(search.toLowerCase());
    const matchModule = filterModule === 'all' || j.reference_module === filterModule;
    const matchStatus = filterStatus === 'all' || j.status === filterStatus;
    const matchFrom = !dateFrom || j.entry_date >= dateFrom;
    const matchTo = !dateTo || j.entry_date <= dateTo;
    return matchSearch && matchModule && matchStatus && matchFrom && matchTo;
  }), [journals, search, filterModule, filterStatus, dateFrom, dateTo]);

  const totalPostedDr = useMemo(() => filtered.filter(j => j.status === 'Posted').reduce((s, j) => s + (j.total_debit || 0), 0), [filtered]);
  const totalPostedCr = useMemo(() => filtered.filter(j => j.status === 'Posted').reduce((s, j) => s + (j.total_credit || 0), 0), [filtered]);

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Entries', val: filtered.length, color: 'text-foreground' },
          { label: 'Posted', val: filtered.filter(j => j.status === 'Posted').length, color: 'text-emerald-700' },
          { label: 'Total Posted Dr', val: `NPR ${totalPostedDr.toLocaleString()}`, color: 'text-blue-700' },
          { label: 'Total Posted Cr', val: `NPR ${totalPostedCr.toLocaleString()}`, color: 'text-emerald-700' },
        ].map(item => (
          <div key={item.label} className="bg-white border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className={cn('text-xl font-bold mt-1', item.color)}>{item.val}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description…" className="pl-9" />
        </div>
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Modules" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            {['General', 'Sales', 'Purchase', 'Manufacturing', 'Payroll', 'Assets', 'Stock'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Posted">Posted</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Reversed">Reversed</SelectItem>
          </SelectContent>
        </Select>
        <DateInput value={dateFrom} onChange={setDateFrom} className="w-52" />
        <DateInput value={dateTo} onChange={setDateTo} className="w-52" />
        <Button variant="outline" size="icon" onClick={fetchData}><RefreshCw className="w-4 h-4" /></Button>
        <Button onClick={() => setShowModal(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> New Journal Entry
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-muted/20">
          <BookOpen className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">General Ledger Journal</span>
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{filtered.length} entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-28">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Description</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-32">Module</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-40">Source Document</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground w-32">Total Dr</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground w-32">Total Cr</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground w-24">Balance</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-muted-foreground w-24">Status</th>
                <th className="px-4 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array(6).fill(0).map((_, i) => (
                  <tr key={i}>{Array(9).fill(0).map((__, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>)}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No journal entries found</td></tr>
              ) : filtered.map(j => {
                const balanced = Math.abs((j.total_debit || 0) - (j.total_credit || 0)) < 0.001;
                return (
                  <tr key={j.id} className="hover:bg-muted/20 cursor-pointer transition-colors" onClick={() => setSelectedJournal(j)}>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{formatDate(j.entry_date)}</td>
                    <td className="px-4 py-3 font-medium max-w-xs">
                      <p className="truncate">{j.description}</p>
                      {j.notes && <p className="text-xs text-muted-foreground truncate">{j.notes}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-medium', MODULE_COLORS[j.reference_module] || MODULE_COLORS.General)}>{j.reference_module}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{j.source_document_type || '—'}</td>
                    <td className="px-4 py-3 text-right font-mono text-blue-700 font-semibold">{(j.total_debit || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-700 font-semibold">{(j.total_credit || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      {balanced
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                        : <AlertCircle className="w-4 h-4 text-amber-500 mx-auto" />}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', STATUS_COLORS[j.status] || STATUS_COLORS.Draft)}>
                        {STATUS_ICON[j.status]}{j.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); setSelectedJournal(j); }}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <JournalEntryModal open={showModal} onClose={() => setShowModal(false)} accounts={accounts} onSaved={fetchData} />
      <JournalDetailDrawer journal={selectedJournal} open={!!selectedJournal} onClose={() => setSelectedJournal(null)} onRefresh={fetchData} />
    </div>
  );
}