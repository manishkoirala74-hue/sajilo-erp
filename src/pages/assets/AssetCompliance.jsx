import { useState, useEffect, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import {
  Plus, AlertTriangle, RefreshCw, History, CheckCircle2,
  ChevronDown, Search, FileText, Clock, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import StatusBadge from '@/components/shared/StatusBadge';
import DocumentUploader from '@/components/shared/DocumentUploader';
import { cn } from '@/lib/utils';

const DEFAULT_EVENT_TYPES = ['Insurance', 'Government Tax', 'Preventative Maintenance', 'Safety Inspection', 'License Renewal'];

const emptyForm = {
  asset_id: '', asset_name: '', event_type: '', event_name: '',
  frequency_months: 12, last_completed_date: '', next_due_date: '',
  reminder_lead_days: 30, assigned_user: '', status: 'Safe',
  completion_notes: '', document_urls: []
};

const computeStatus = (nextDue) => {
  if (!nextDue) return 'Safe';
  const diffDays = Math.ceil((new Date(nextDue) - new Date()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Overdue';
  if (diffDays <= 30) return 'Upcoming';
  return 'Safe';
};

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Asset picker dropdown ────────────────────────────────────────────────────
function AssetPicker({ assets, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = assets.find(a => a.id === value);
  const filtered = assets.filter(a =>
    a.asset_name.toLowerCase().includes(search.toLowerCase()) ||
    (a.asset_code || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setSearch(''); }}
        className={cn(
          'flex items-center justify-between w-full h-9 px-3 text-sm border rounded-md bg-white hover:bg-muted/30 transition-colors',
          !selected && 'text-muted-foreground',
          open && 'border-primary ring-1 ring-primary'
        )}
      >
        <span className="truncate">
          {selected ? `${selected.asset_code ? selected.asset_code + ' — ' : ''}${selected.asset_name}` : 'Select asset…'}
        </span>
        <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground ml-2" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full bg-white border border-border rounded-lg shadow-lg">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                autoFocus
                className="w-full text-sm pl-7 pr-2 py-1.5 border rounded outline-none"
                placeholder="Search assets…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground px-3 py-3 text-center">No assets found</p>
            ) : filtered.map(a => (
              <button
                key={a.id}
                type="button"
                className="w-full text-left text-sm px-3 py-2 hover:bg-muted/50 flex items-center gap-2"
                onClick={() => { onChange(a); setOpen(false); setSearch(''); }}
              >
                {a.asset_code && <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{a.asset_code}</span>}
                <span>{a.asset_name}</span>
                {a.category && <Badge variant="outline" className="ml-auto text-xs">{a.category}</Badge>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Compliance form (shared between Add & Renew) ─────────────────────────────
function ComplianceForm({ form, f, fixedAssets, eventTypes, isEdit, isRenew }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="col-span-2">
        <Label>Fixed Asset *</Label>
        {isEdit && !isRenew ? (
          <Input value={form.asset_name} disabled className="bg-muted/30" />
        ) : (
          <AssetPicker
            assets={fixedAssets}
            value={form.asset_id}
            onChange={a => { f('asset_id', a.id); f('asset_name', a.asset_name); }}
          />
        )}
      </div>
      <div>
        <Label>Event Type</Label>
        <Select value={form.event_type} onValueChange={v => f('event_type', v)}>
          <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
          <SelectContent>{eventTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Event Name *</Label>
        <Input value={form.event_name} onChange={e => f('event_name', e.target.value)} />
      </div>
      <div>
        <Label>Frequency (months)</Label>
        <Input type="number" value={form.frequency_months} onChange={e => f('frequency_months', parseInt(e.target.value) || 12)} />
      </div>
      <div>
        <Label>Lead Reminder Days</Label>
        <Input type="number" value={form.reminder_lead_days} onChange={e => f('reminder_lead_days', parseInt(e.target.value) || 30)} />
      </div>
      <div>
        <Label>Last Completed Date</Label>
        <Input type="date" value={form.last_completed_date} onChange={e => f('last_completed_date', e.target.value)} />
      </div>
      <div>
        <Label>Next Due Date</Label>
        <Input type="date" value={form.next_due_date} onChange={e => f('next_due_date', e.target.value)} />
      </div>
      <div>
        <Label>Assigned User</Label>
        <Input value={form.assigned_user} onChange={e => f('assigned_user', e.target.value)} placeholder="Email or name…" />
      </div>
      <div className="col-span-2">
        <Label>Notes / Completion Notes</Label>
        <Input value={form.completion_notes} onChange={e => f('completion_notes', e.target.value)} />
      </div>
      <div className="col-span-2 border-t border-border pt-4">
        <DocumentUploader
          label="Compliance Documents (certificates, receipts, etc.)"
          urls={form.document_urls || []}
          onChange={urls => f('document_urls', urls)}
        />
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function AssetCompliance() {
  const [items, setItems] = useState([]);
  const [fixedAssets, setFixedAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventTypes, setEventTypes] = useState(DEFAULT_EVENT_TYPES);

  // Add / Edit modal
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  // Renew modal
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewForm, setRenewForm] = useState(emptyForm);
  const [renewTarget, setRenewTarget] = useState(null);
  const [posting, setPosting] = useState(false);

  // History drawer
  const [historyAsset, setHistoryAsset] = useState(null); // { asset_id, asset_name }
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [data, settingsData, assets] = await Promise.all([
      sajilo.entities.AssetComplianceSchedule.list('-next_due_date', 500),
      sajilo.entities.CompanySettings.list(),
      sajilo.entities.FixedAsset.filter({ status: 'Active' }, 'asset_name', 500),
    ]);
    setItems(data);
    setFixedAssets(assets);
    if (settingsData[0]?.compliance_event_types?.length) setEventTypes(settingsData[0].compliance_event_types);
    setLoading(false);
  };

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const rf = (k, v) => setRenewForm(prev => ({ ...prev, [k]: v }));

  // ── Save (Add/Edit) ──────────────────────────────────────────────────────
  const save = async () => {
    if (!form.asset_name || !form.event_name) return toast.error('Asset and event name are required');
    setSaving(true);
    try {
  const payload = { ...form, status: computeStatus(form.next_due_date) };
      if (editing) {
        await sajilo.entities.AssetComplianceSchedule.update(editing, payload);
        toast.success('Compliance record updated');
      } else {
        await sajilo.entities.AssetComplianceSchedule.create(payload);
        toast.success('Compliance schedule created');
      }
      setOpen(false); setEditing(null); setForm(emptyForm);
      fetchData();     } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  // ── Open Renew modal ─────────────────────────────────────────────────────
  const openRenew = (item) => {
    setRenewTarget(item);
    setRenewForm({
      asset_id: item.asset_id || '',
      asset_name: item.asset_name,
      event_type: item.event_type || '',
      event_name: item.event_name || '',
      frequency_months: item.frequency_months || 12,
      last_completed_date: new Date().toISOString().split('T')[0],
      next_due_date: (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + (item.frequency_months || 12));
        return d.toISOString().split('T')[0];
      })(),
      reminder_lead_days: item.reminder_lead_days || 30,
      assigned_user: item.assigned_user || '',
      status: 'Safe',
      completion_notes: '',
      document_urls: [],
    });
    setRenewOpen(true);
  };

  // ── Post Renewal ─────────────────────────────────────────────────────────
  const postRenewal = async () => {
    if (!renewForm.last_completed_date || !renewForm.next_due_date) {
      return toast.error('Completion date and next due date are required');
    }
    setPosting(true);
    const payload = {
      ...renewForm,
      status: computeStatus(renewForm.next_due_date),
    };
    await sajilo.entities.AssetComplianceSchedule.update(renewTarget.id, payload);
    toast.success('Renewal posted — compliance record updated');
    setRenewOpen(false); setRenewTarget(null); setRenewForm(emptyForm);
    fetchData(); setPosting(false);
  };

  // ── Open History ─────────────────────────────────────────────────────────
  const openHistory = async (item) => {
    setHistoryAsset(item);
    setHistoryLoading(true);
    const all = await sajilo.entities.AssetComplianceSchedule.filter(
      { asset_name: item.asset_name }, '-next_due_date', 200
    );
    setHistoryItems(all);
    setHistoryLoading(false);
  };

  // ── Filtered items ───────────────────────────────────────────────────────
  const filtered = useMemo(() => items.filter(i => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (i.asset_name || '').toLowerCase().includes(q) ||
        (i.event_name || '').toLowerCase().includes(q) ||
        (i.event_type || '').toLowerCase().includes(q)
      );
    }
    return true;
  }), [items, search, filterStatus]);

  const overdue  = items.filter(i => i.status === 'Overdue').length;
  const upcoming = items.filter(i => i.status === 'Upcoming').length;

  const statusColor = {
    Safe: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    Upcoming: 'text-amber-700 bg-amber-50 border-amber-200',
    Overdue: 'text-red-700 bg-red-50 border-red-200',
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Asset Compliance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Maintenance, insurance &amp; regulatory schedules</p>
        </div>
        <Button onClick={() => { setForm(emptyForm); setEditing(null); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" /> Add Schedule
        </Button>
      </div>

      {/* Alert banners */}
      {(overdue > 0 || upcoming > 0) && (
        <div className="flex gap-3 mb-4">
          {overdue > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4" />
              {overdue} overdue item{overdue > 1 ? 's' : ''}
            </div>
          )}
          {upcoming > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4" />
              {upcoming} upcoming within 30 days
            </div>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search assets, events…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Safe">Safe</SelectItem>
            <SelectItem value="Upcoming">Upcoming</SelectItem>
            <SelectItem value="Overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Asset</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Event</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Type</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Frequency</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Last Done</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Next Due</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Assigned To</th>
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Status</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 9 }).map((_, j) => (
                  <td key={j} className="px-4 py-3"><div className="h-4 bg-muted animate-pulse rounded" /></td>
                ))}</tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">No compliance records found.</td></tr>
            ) : filtered.map(item => {
              const daysUntil = item.next_due_date
                ? Math.ceil((new Date(item.next_due_date) - new Date()) / (1000 * 60 * 60 * 24))
                : null;
              return (
                <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5">
                    <button
                      className="font-medium text-primary hover:underline text-left"
                      onClick={() => openHistory(item)}
                    >
                      {item.asset_name}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 font-medium">{item.event_name}</td>
                  <td className="px-4 py-2.5">
                    {item.event_type && <Badge variant="outline" className="text-xs">{item.event_type}</Badge>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{item.frequency_months}m</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmt(item.last_completed_date)}</td>
                  <td className="px-4 py-2.5">
                    <div className="text-xs">{fmt(item.next_due_date)}</div>
                    {daysUntil !== null && (
                      <div className={cn('text-xs mt-0.5', daysUntil < 0 ? 'text-red-600' : daysUntil <= 30 ? 'text-amber-600' : 'text-muted-foreground')}>
                        {daysUntil < 0 ? `${Math.abs(daysUntil)}d overdue` : `in ${daysUntil}d`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.assigned_user || '—'}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', statusColor[item.status] || statusColor.Safe)}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="text-xs h-7 px-2"
                        onClick={() => { setForm(item); setEditing(item.id); setOpen(true); }}>
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" className="text-xs h-7 px-2 gap-1"
                        onClick={() => openRenew(item)}>
                        <RefreshCw className="w-3 h-3" /> Renew
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs h-7 px-2 gap-1 text-muted-foreground"
                        onClick={() => openHistory(item)}>
                        <History className="w-3 h-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && (
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
            {filtered.length} record{filtered.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Add / Edit Schedule Dialog ───────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Compliance Schedule' : 'New Compliance Schedule'}</DialogTitle>
          </DialogHeader>
          <ComplianceForm form={form} f={f} fixedAssets={fixedAssets} eventTypes={eventTypes} isEdit={!!editing} isRenew={false} />
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{editing ? 'Update' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Renew Event Dialog ──────────────────────────────────────────── */}
      <Dialog open={renewOpen} onOpenChange={v => { if (!v) { setRenewOpen(false); setRenewTarget(null); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              <DialogTitle>Renew Compliance Event</DialogTitle>
            </div>
            {renewTarget && (
              <p className="text-sm text-muted-foreground mt-1">
                <strong>{renewTarget.asset_name}</strong> — {renewTarget.event_name}
              </p>
            )}
          </DialogHeader>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-800 mb-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Fill in the renewal details below, then click <strong>Post Renewal</strong> to update the compliance record.
          </div>
          <ComplianceForm form={renewForm} f={rf} fixedAssets={fixedAssets} eventTypes={eventTypes} isEdit={true} isRenew={true} />
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => { setRenewOpen(false); setRenewTarget(null); }}>Cancel</Button>
            <Button onClick={postRenewal} disabled={posting} className="gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              {posting ? 'Posting…' : 'Post Renewal'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Compliance History Sheet ─────────────────────────────────────── */}
      <Sheet open={!!historyAsset} onOpenChange={v => { if (!v) setHistoryAsset(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              <SheetTitle>Compliance History</SheetTitle>
            </div>
            {historyAsset && (
              <p className="text-sm text-muted-foreground font-medium">{historyAsset.asset_name}</p>
            )}
          </SheetHeader>

          {historyLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : historyItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No history found for this asset.</div>
          ) : (
            <div className="space-y-3">
              {historyItems.map((item, idx) => (
                <div key={item.id} className={cn(
                  'border rounded-xl p-4 space-y-2',
                  idx === 0 ? 'border-primary/30 bg-primary/5' : 'border-border bg-card'
                )}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{item.event_name}</span>
                        {idx === 0 && <Badge className="text-xs bg-primary/10 text-primary border-primary/20">Latest</Badge>}
                      </div>
                      {item.event_type && <span className="text-xs text-muted-foreground">{item.event_type}</span>}
                    </div>
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', statusColor[item.status] || statusColor.Safe)}>
                      {item.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>Last done: <strong className="text-foreground">{fmt(item.last_completed_date)}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>Next due: <strong className="text-foreground">{fmt(item.next_due_date)}</strong></span>
                    </div>
                    {item.assigned_user && (
                      <div className="text-muted-foreground col-span-2">Assigned: <strong className="text-foreground">{item.assigned_user}</strong></div>
                    )}
                    {item.frequency_months && (
                      <div className="text-muted-foreground">Frequency: <strong className="text-foreground">{item.frequency_months} months</strong></div>
                    )}
                  </div>

                  {item.completion_notes && (
                    <div className="bg-muted/40 rounded px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Notes: </span>{item.completion_notes}
                    </div>
                  )}

                  {item.document_urls?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Documents ({item.document_urls.length})
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {item.document_urls.map((url, di) => {
                          const name = url.split('/').pop().split('?')[0];
                          return (
                            <a key={di} href={url} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline bg-primary/5 border border-primary/20 px-2 py-1 rounded">
                              <FileText className="w-3 h-3" />
                              {decodeURIComponent(name).substring(0, 30)}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}