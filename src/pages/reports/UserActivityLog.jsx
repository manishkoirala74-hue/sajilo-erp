import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { RefreshCw, Search, History, ArrowUpDown, ArrowDown, ArrowUp, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'opening_balance', label: 'Opening Balance Changes' },
  { id: 'item_imports', label: 'Item Imports' },
  { id: 'item_deletions', label: 'Item Deletions' },
  { id: 'partner_imports', label: 'Customer & Vendor Imports' },
  { id: 'partner_deletions', label: 'Partner Deletions' },
  { id: 'voucher_actions', label: 'Voucher Deletions & Reversals' },
];

export default function UserActivityLog() {
  const [activeTab, setActiveTab] = useState('opening_balance');
  const [logs, setLogs] = useState([]);
  const [importLogs, setImportLogs] = useState([]);
  const [deletionLogs, setDeletionLogs] = useState([]);
  const [partnerImportLogs, setPartnerImportLogs] = useState([]);
  const [partnerDeleteLogs, setPartnerDeleteLogs] = useState([]);
  const [voucherActionLogs, setVoucherActionLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('created_date');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    fetchLogs();
  }, [activeTab]);

  const fetchLogs = async () => {
    setLoading(true);
    if (activeTab === 'opening_balance') {
      const data = await sajilo.entities.OpeningBalanceLog.list('-created_date', 500);
      setLogs(data);
    } else if (activeTab === 'item_imports') {
      const data = await sajilo.entities.ItemImportLog.list('-created_date', 200);
      setImportLogs(data);
    } else if (activeTab === 'item_deletions') {
      const data = await sajilo.entities.ItemDeleteLog.list('-created_date', 500);
      setDeletionLogs(data);
    } else if (activeTab === 'partner_imports') {
      const data = await sajilo.entities.PartnerImportLog.list('-created_date', 200);
      setPartnerImportLogs(data);
    } else if (activeTab === 'partner_deletions') {
      const data = await sajilo.entities.PartnerDeleteLog.list('-created_date', 500);
      setPartnerDeleteLogs(data);
    } else if (activeTab === 'voucher_actions') {
      const data = await sajilo.entities.FinancialVoucherDeleteLog.list('-created_date', 500);
      setVoucherActionLogs(data);
    }
    setLoading(false);
  };

  const filtered = logs.filter(l => {
    if (!search) return true;
    const lc = search.toLowerCase();
    return l.account_code?.toLowerCase().includes(lc) ||
      l.account_name?.toLowerCase().includes(lc) ||
      l.changed_by?.toLowerCase().includes(lc) ||
      l.account_group?.toLowerCase().includes(lc);
  });

  const handleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortField], bv = b[sortField];
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-primary" /> : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
  };

  const formatChange = (prev, next) => {
    const diff = next - prev;
    if (diff === 0) return null;
    const color = diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
    return <span className={cn('text-xs font-medium', color)}>{diff > 0 ? '+' : ''}{diff.toLocaleString()}</span>;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" /> User & Activity Log
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Track all changes made to opening balances and account configurations</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', loading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn('px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Item Imports Log */}
      {activeTab === 'item_imports' && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search file name, user…" className="pl-9" />
            </div>
            <span className="self-center text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
              {importLogs.filter(l => !search || l.file_name?.toLowerCase().includes(search.toLowerCase()) || l.imported_by?.toLowerCase().includes(search.toLowerCase())).length} record(s)
            </span>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="table-fluid-grid text-sm">
              <thead className="cell-density bg-muted/30 border-b border-border">
                <tr>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">File Name</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Imported By</th>
                  <th className="cell-density text-center  text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Total Rows</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Created</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Updated</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Skipped</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Failed</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Date / Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array(4).fill(0).map((_, i) => (
                    <tr key={i}><td colSpan={9} className="cell-density "><div className="h-6 bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : importLogs.filter(l => !search || l.file_name?.toLowerCase().includes(search.toLowerCase()) || l.imported_by?.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
                  <tr><td colSpan={9} className="cell-density text-center py-12 text-muted-foreground text-sm">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No item imports recorded yet
                  </td></tr>
                ) : importLogs
                    .filter(l => !search || l.file_name?.toLowerCase().includes(search.toLowerCase()) || l.imported_by?.toLowerCase().includes(search.toLowerCase()))
                    .map((log, i) => (
                  <tr key={log.id || i} className="hover:bg-muted/20 transition-colors">
                    <td className="cell-density text-xs font-mono text-primary max-w-[160px] truncate">{log.file_name}</td>
                    <td className="cell-density text-xs text-muted-foreground">{log.imported_by}</td>
                    <td className="cell-density text-center">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
                        log.status === 'Success' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                        : log.status === 'Partial' ? 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
                        : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400')}>
                        {log.status === 'Success' ? <CheckCircle2 className="w-3 h-3" /> : log.status === 'Partial' ? <AlertTriangle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {log.status}
                      </span>
                    </td>
                    <td className="cell-density text-right text-sm font-mono">{log.total_rows ?? 0}</td>
                    <td className="cell-density text-right text-sm font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{log.items_created ?? 0}</td>
                    <td className="cell-density text-right text-sm font-mono text-blue-600 dark:text-blue-400 font-semibold">{log.items_updated ?? 0}</td>
                    <td className="cell-density text-right text-sm font-mono text-yellow-600 dark:text-yellow-400">{log.items_skipped ?? 0}</td>
                    <td className="cell-density text-right text-sm font-mono text-red-600 dark:text-red-400">{log.items_failed ?? 0}</td>
                    <td className="cell-density text-xs text-muted-foreground">
                      {log.import_date ? new Date(log.import_date).toLocaleString() : log.created_date ? new Date(log.created_date).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
              {importLogs.length} import record(s) total
            </div>
          </div>
        </div>
      )}

      {/* Item Deletions Log */}
      {activeTab === 'item_deletions' && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search item name, code, user…" className="pl-9" />
            </div>
            <span className="self-center text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
              {deletionLogs.filter(l => !search || l.item_name?.toLowerCase().includes(search.toLowerCase()) || l.item_code?.toLowerCase().includes(search.toLowerCase()) || l.deleted_by?.toLowerCase().includes(search.toLowerCase())).length} record(s)
            </span>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="table-fluid-grid text-sm">
              <thead className="cell-density bg-muted/30 border-b border-border">
                <tr>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Item Code</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Item Name</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Category</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">HS Code</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Selling Price</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Qty on Hand</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Deleted By</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Date / Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array(4).fill(0).map((_, i) => (
                    <tr key={i}><td colSpan={9} className="cell-density "><div className="h-6 bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : deletionLogs.filter(l => !search || l.item_name?.toLowerCase().includes(search.toLowerCase()) || l.item_code?.toLowerCase().includes(search.toLowerCase()) || l.deleted_by?.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
                  <tr><td colSpan={9} className="cell-density text-center py-12 text-muted-foreground text-sm">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No item deletions recorded yet
                  </td></tr>
                ) : deletionLogs
                    .filter(l => !search || l.item_name?.toLowerCase().includes(search.toLowerCase()) || l.item_code?.toLowerCase().includes(search.toLowerCase()) || l.deleted_by?.toLowerCase().includes(search.toLowerCase()))
                    .map((log, i) => (
                  <tr key={log.id || i} className="hover:bg-muted/20 transition-colors">
                    <td className="cell-density font-mono text-xs text-primary">{log.item_code || '—'}</td>
                    <td className="cell-density font-medium text-sm">{log.item_name}</td>
                    <td className="cell-density text-xs text-muted-foreground">{log.item_type || '—'}</td>
                    <td className="cell-density text-xs text-muted-foreground">{log.category_name || '—'}</td>
                    <td className="cell-density font-mono text-xs text-muted-foreground">{log.hs_code || '—'}</td>
                    <td className="cell-density text-right text-sm font-mono">NPR {Number(log.selling_price || 0).toLocaleString()}</td>
                    <td className="cell-density text-right text-sm font-mono">{log.quantity_on_hand ?? 0}</td>
                    <td className="cell-density text-xs text-muted-foreground">{log.deleted_by || '—'}</td>
                    <td className="cell-density text-xs text-muted-foreground">
                      {log.created_date ? new Date(log.created_date).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
              {deletionLogs.length} deletion record(s) total
            </div>
          </div>
        </div>
      )}

      {/* Partner Imports Log */}
      {activeTab === 'partner_imports' && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search file name, user, type…" className="pl-9" />
            </div>
            <span className="self-center text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
              {partnerImportLogs.filter(l => !search || l.file_name?.toLowerCase().includes(search.toLowerCase()) || l.imported_by?.toLowerCase().includes(search.toLowerCase()) || l.import_type?.toLowerCase().includes(search.toLowerCase())).length} record(s)
            </span>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="table-fluid-grid text-sm">
              <thead className="cell-density bg-muted/30 border-b border-border">
                <tr>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">File Name</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Imported By</th>
                  <th className="cell-density text-center  text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Rows</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Created</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Updated</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Failed</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Ledgers</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Journals</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Date / Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array(4).fill(0).map((_, i) => (
                    <tr key={i}><td colSpan={11} className="cell-density "><div className="h-6 bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : partnerImportLogs.filter(l => !search || l.file_name?.toLowerCase().includes(search.toLowerCase()) || l.imported_by?.toLowerCase().includes(search.toLowerCase()) || l.import_type?.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
                  <tr><td colSpan={11} className="cell-density text-center py-12 text-muted-foreground text-sm">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No partner imports recorded yet
                  </td></tr>
                ) : partnerImportLogs
                    .filter(l => !search || l.file_name?.toLowerCase().includes(search.toLowerCase()) || l.imported_by?.toLowerCase().includes(search.toLowerCase()) || l.import_type?.toLowerCase().includes(search.toLowerCase()))
                    .map((log, i) => (
                  <tr key={log.id || i} className="hover:bg-muted/20 transition-colors">
                    <td className="cell-density text-xs font-mono text-primary max-w-[140px] truncate">{log.file_name}</td>
                    <td className="cell-density ">
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                        log.import_type === 'Customers' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400' : 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400')}>
                        {log.import_type}
                      </span>
                    </td>
                    <td className="cell-density text-xs text-muted-foreground">{log.imported_by}</td>
                    <td className="cell-density text-center">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
                        log.status === 'Success' ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                        : log.status === 'Partial' ? 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
                        : 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400')}>
                        {log.status === 'Success' ? <CheckCircle2 className="w-3 h-3" /> : log.status === 'Partial' ? <AlertTriangle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {log.status}
                      </span>
                    </td>
                    <td className="cell-density text-right text-sm font-mono">{log.total_rows ?? 0}</td>
                    <td className="cell-density text-right text-sm font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{log.created_count ?? 0}</td>
                    <td className="cell-density text-right text-sm font-mono text-blue-600 dark:text-blue-400 font-semibold">{log.updated_count ?? 0}</td>
                    <td className="cell-density text-right text-sm font-mono text-red-600 dark:text-red-400">{log.failed_count ?? 0}</td>
                    <td className="cell-density text-right text-sm font-mono text-purple-600 dark:text-purple-400">{log.ledgers_generated ?? 0}</td>
                    <td className="cell-density text-right text-sm font-mono text-indigo-600 dark:text-indigo-400">{log.journals_posted ?? 0}</td>
                    <td className="cell-density text-xs text-muted-foreground">
                      {log.import_date ? new Date(log.import_date).toLocaleString() : log.created_date ? new Date(log.created_date).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {partnerImportLogs.length > 0 && (
              <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
                {partnerImportLogs.length} import record(s) total
              </div>
            )}
          </div>
        </div>
      )}

      {/* Partner Deletions Log */}
      {activeTab === 'partner_deletions' && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search partner name, user, type…" className="pl-9" />
            </div>
            <span className="self-center text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
              {partnerDeleteLogs.filter(l => !search ||
                l.partner_name?.toLowerCase().includes(search.toLowerCase()) ||
                l.deleted_by?.toLowerCase().includes(search.toLowerCase()) ||
                l.partner_type?.toLowerCase().includes(search.toLowerCase())
              ).length} record(s)
            </span>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="table-fluid-grid text-sm">
              <thead className="cell-density bg-muted/30 border-b border-border">
                <tr>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Partner Name</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">VAT/PAN</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Action Type</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Deleted By</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Audit Payload</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Date / Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array(4).fill(0).map((_, i) => (
                    <tr key={i}><td colSpan={7} className="cell-density "><div className="h-6 bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : partnerDeleteLogs.filter(l => !search ||
                    l.partner_name?.toLowerCase().includes(search.toLowerCase()) ||
                    l.deleted_by?.toLowerCase().includes(search.toLowerCase()) ||
                    l.partner_type?.toLowerCase().includes(search.toLowerCase())
                  ).length === 0 ? (
                  <tr><td colSpan={7} className="cell-density text-center py-12 text-muted-foreground text-sm">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No partner deletions recorded yet
                  </td></tr>
                ) : partnerDeleteLogs
                    .filter(l => !search ||
                      l.partner_name?.toLowerCase().includes(search.toLowerCase()) ||
                      l.deleted_by?.toLowerCase().includes(search.toLowerCase()) ||
                      l.partner_type?.toLowerCase().includes(search.toLowerCase())
                    )
                    .map((log, i) => (
                  <tr key={log.id || i} className="hover:bg-muted/20 transition-colors">
                    <td className="cell-density font-medium text-sm">{log.partner_name}</td>
                    <td className="cell-density ">
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full',
                        log.partner_type === 'Customer' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400' : 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400')}>
                        {log.partner_type}
                      </span>
                    </td>
                    <td className="cell-density font-mono text-xs text-muted-foreground">{log.tax_id_number || '—'}</td>
                    <td className="cell-density ">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
                        log.action_type === 'Bulk Delete' ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400')}>
                        {log.action_type === 'Bulk Delete' ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                        {log.action_type}
                      </span>
                    </td>
                    <td className="cell-density text-xs text-muted-foreground">{log.deleted_by || '—'}</td>
                    <td className="cell-density text-xs text-muted-foreground max-w-xs truncate" title={log.log_payload}>{log.log_payload || '—'}</td>
                    <td className="cell-density text-xs text-muted-foreground">
                      {log.created_date ? new Date(log.created_date).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
              {partnerDeleteLogs.length} deletion record(s) total
            </div>
          </div>
        </div>
      )}

      {/* Voucher Deletions & Reversals Log */}
      {activeTab === 'voucher_actions' && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search voucher number, user…" className="pl-9" />
            </div>
            <span className="self-center text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
              {voucherActionLogs.filter(l => !search || l.voucher_number?.toLowerCase().includes(search.toLowerCase()) || l.performed_by?.toLowerCase().includes(search.toLowerCase())).length} record(s)
            </span>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="table-fluid-grid text-sm">
              <thead className="cell-density bg-muted/30 border-b border-border">
                <tr>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Voucher #</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Type</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Action</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Reversal #</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Amount</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Performed By</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Reason</th>
                  <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Date / Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array(4).fill(0).map((_, i) => (
                    <tr key={i}><td colSpan={8} className="cell-density "><div className="h-6 bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : voucherActionLogs.filter(l => !search || l.voucher_number?.toLowerCase().includes(search.toLowerCase()) || l.performed_by?.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
                  <tr><td colSpan={8} className="cell-density text-center py-12 text-muted-foreground text-sm">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No voucher deletions or reversals recorded yet
                  </td></tr>
                ) : voucherActionLogs
                    .filter(l => !search || l.voucher_number?.toLowerCase().includes(search.toLowerCase()) || l.performed_by?.toLowerCase().includes(search.toLowerCase()))
                    .map((log, i) => (
                  <tr key={log.id || i} className="hover:bg-muted/20 transition-colors">
                    <td className="cell-density font-mono text-xs text-primary">{log.voucher_number}</td>
                    <td className="cell-density text-xs text-muted-foreground">{log.voucher_type || '—'}</td>
                    <td className="cell-density ">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
                        log.action_type === 'Delete' ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400' : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400')}>
                        {log.action_type === 'Delete' ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                        {log.action_type}
                      </span>
                    </td>
                    <td className="cell-density font-mono text-xs text-muted-foreground">{log.reversal_voucher_number || '—'}</td>
                    <td className="cell-density text-right font-mono text-sm">NPR {Number(log.total_amount || 0).toLocaleString()}</td>
                    <td className="cell-density text-xs text-muted-foreground">{log.performed_by || '—'}</td>
                    <td className="cell-density text-xs text-muted-foreground max-w-xs truncate" title={log.reason}>{log.reason || '—'}</td>
                    <td className="cell-density text-xs text-muted-foreground">
                      {log.created_date ? new Date(log.created_date).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
              {voucherActionLogs.length} record(s) total
            </div>
          </div>
        </div>
      )}

      {/* Opening Balance Change Log */}
      {activeTab === 'opening_balance' && (
        <div className="space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search account code, name, user…" className="pl-9" />
            </div>
            <span className="self-center text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
              {sorted.length} record{sorted.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="table-fluid-grid text-sm">
              <thead className="cell-density bg-muted/30 border-b border-border">
                <tr>
                  <th className="cell-density text-left">
                    <button onClick={() => handleSort('account_code')} className="flex items-center text-xs font-semibold text-muted-foreground">
                      Account Code <SortIcon field="account_code" />
                    </button>
                  </th>
                  <th className="cell-density text-left">
                    <button onClick={() => handleSort('account_name')} className="flex items-center text-xs font-semibold text-muted-foreground">
                      Name of Ledger <SortIcon field="account_name" />
                    </button>
                  </th>
                  <th className="cell-density text-left">
                    <button onClick={() => handleSort('account_group')} className="flex items-center text-xs font-semibold text-muted-foreground">
                      Account Group <SortIcon field="account_group" />
                    </button>
                  </th>
                  <th className="cell-density text-left">
                    <button onClick={() => handleSort('opening_date')} className="flex items-center text-xs font-semibold text-muted-foreground">
                      Opening Date <SortIcon field="opening_date" />
                    </button>
                  </th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Previous Balance</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">New Balance</th>
                  <th className="cell-density text-right  text-xs font-semibold text-muted-foreground">Change</th>
                  <th className="cell-density text-center  text-xs font-semibold text-muted-foreground">Dr/Cr</th>
                  <th className="cell-density text-left">
                    <button onClick={() => handleSort('changed_by')} className="flex items-center text-xs font-semibold text-muted-foreground">
                      Changed By <SortIcon field="changed_by" />
                    </button>
                  </th>
                  <th className="cell-density text-left">
                    <button onClick={() => handleSort('created_date')} className="flex items-center text-xs font-semibold text-muted-foreground">
                      Date/Time <SortIcon field="created_date" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  Array(6).fill(0).map((_, i) => (
                    <tr key={i}><td colSpan={10} className="cell-density "><div className="h-6 bg-muted rounded animate-pulse" /></td></tr>
                  ))
                ) : sorted.length === 0 ? (
                  <tr><td colSpan={10} className="cell-density text-center py-12 text-muted-foreground text-sm">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    No opening balance changes recorded yet
                  </td></tr>
                ) : sorted.map((log, i) => (
                  <tr key={log.id || i} className="hover:bg-muted/20 transition-colors">
                    <td className="cell-density font-mono text-xs text-primary">{log.account_code}</td>
                    <td className="cell-density font-medium text-sm">{log.account_name}</td>
                    <td className="cell-density text-xs text-muted-foreground">{log.account_group || '—'}</td>
                    <td className="cell-density text-xs text-muted-foreground">{log.opening_date || '—'}</td>
                    <td className="cell-density text-right text-sm font-mono text-muted-foreground">
                      {Number(log.previous_balance || 0).toLocaleString()}
                    </td>
                    <td className="cell-density text-right text-sm font-mono font-semibold">
                      {Number(log.new_balance || 0).toLocaleString()}
                    </td>
                    <td className="cell-density text-right">
                      {formatChange(log.previous_balance || 0, log.new_balance || 0) || <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="cell-density text-center">
                      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold',
                        log.balance_type === 'Debit' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400' : 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                      )}>
                        {log.balance_type === 'Debit' ? 'Dr' : 'Cr'}
                      </span>
                    </td>
                    <td className="cell-density text-xs text-muted-foreground">{log.changed_by || '—'}</td>
                    <td className="cell-density text-xs text-muted-foreground">
                      {log.created_date ? new Date(log.created_date).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
              {sorted.length} records shown
            </div>
          </div>
        </div>
      )}
    </div>
  );
}