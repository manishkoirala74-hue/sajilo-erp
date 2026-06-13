import { useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Edit2, ToggleLeft, ToggleRight, Building2, User, Trash2, Camera, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import { toast } from 'sonner';
import { provisionPartnerLedgers, createPartnerLedger } from '@/lib/partnerLedgerService';
import PartnerBatchActions from '@/components/partners/PartnerBatchActions';

const emptyForm = {
  name: '', partner_type: 'Company', tax_id_number: '',
  is_customer: false, is_vendor: true, is_active: true,
  treat_as_customer: false, profile_picture_url: '',
  credit_limit_amount: 0, default_payment_term_days: 30,
  email: '', phone: '', address: '', city: '', country: 'Nepal', notes: ''
};

const formatBytes = (bytes) => {
  if (!bytes) return '';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function Suppliers() {
  

  const [partners, setPartners]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState(null);
  const [form, setForm]             = useState(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [settings, setSettings]     = useState(null);
  const [selected, setSelected]     = useState(new Set());
  const [search, setSearch]         = useState('');
  const [uploading, setUploading]   = useState(false);
  const [maxFileSize, setMaxFileSize] = useState(null);

  const enrichWithAccountCodes = async (partners, settingsData) => {
    const accounts = await sajilo.entities.ChartOfAccount.list('account_code', 2000);
    const byId = Object.fromEntries(accounts.map(a => [a.id, a]));
    const enriched = [];
    for (const p of partners) {
      if (p.payable_account_id) {
        const acc = byId[p.payable_account_id];
        if (acc && acc.ledger_type === 'Sub Ledger') {
          enriched.push({ ...p, payable_account_code: acc.account_code, payable_account_name: acc.account_name });
        } else if (acc && acc.ledger_type === 'Group Ledger' && settingsData?.gl_supplier_ledger_group_id) {
          try {
            const ledger = await createPartnerLedger({ partnerName: p.name, parentGroupId: settingsData.gl_supplier_ledger_group_id, accountType: 'Liability', normalBalance: 'Credit', accountSubtype: 'Current Liability' });
            await sajilo.entities.BusinessPartner.update(p.id, { payable_account_id: ledger.id, payable_account_name: ledger.account_name, payable_account_code: ledger.account_code });
            enriched.push({ ...p, payable_account_id: ledger.id, payable_account_code: ledger.account_code, payable_account_name: ledger.account_name });
          } catch { enriched.push(p); }
        } else { enriched.push(p); }
      } else if (p.receivable_account_id) {
        // Re-use AR ledger for AP if it exists
        await sajilo.entities.BusinessPartner.update(p.id, {
          payable_account_id: p.receivable_account_id,
          payable_account_name: p.receivable_account_name,
          payable_account_code: p.receivable_account_code
        });
        enriched.push({ ...p, payable_account_id: p.receivable_account_id, payable_account_code: p.receivable_account_code, payable_account_name: p.receivable_account_name });
      } else if (settingsData?.gl_supplier_ledger_group_id) {
        try {
          const ledger = await createPartnerLedger({ partnerName: p.name, parentGroupId: settingsData.gl_supplier_ledger_group_id, accountType: 'Liability', normalBalance: 'Credit', accountSubtype: 'Current Liability' });
          await sajilo.entities.BusinessPartner.update(p.id, { payable_account_id: ledger.id, payable_account_name: ledger.account_name, payable_account_code: ledger.account_code });
          enriched.push({ ...p, payable_account_id: ledger.id, payable_account_code: ledger.account_code, payable_account_name: ledger.account_name });
        } catch { enriched.push(p); }
      } else { enriched.push(p); }
    }
    return enriched;
  };

  useEffect(() => {
    Promise.all([
      sajilo.entities.BusinessPartner.filter({ is_vendor: true }, '-created_date'),
      sajilo.entities.CompanySettings.list(),
    ]).then(async ([data, sett]) => {
      const s = sett[0] || {};
      setSettings(s);
      const enriched = await enrichWithAccountCodes(data, s);
      setPartners(enriched);
      setLoading(false);
    });
    sajilo.auth.supabase.storage.getBucket('avatars').then(({ data }) => {
      if (data && data.file_size_limit) setMaxFileSize(data.file_size_limit);
    }).catch(() => {});
  }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openNew();
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);


  const fetchPartners = async () => {
    const data = await sajilo.entities.BusinessPartner.filter({ is_vendor: true }, '-created_date');
    const enriched = await enrichWithAccountCodes(data, settings);
    setPartners(enriched);
    setSelected(new Set());
  };

  const openNew  = () => { setForm(emptyForm); setEditing(null); setShowForm(true); };
  const openEdit = (p)  => { setForm({ ...emptyForm, ...p }); setEditing(p); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      let saveData = { ...form, is_vendor: true };
      if (!saveData.profile_picture_url) saveData.profile_picture_url = null;
      if (form.treat_as_customer) saveData.is_customer = true;
      if (!editing) {
        const ledgerUpdates = await provisionPartnerLedgers(saveData, settings || {});
        saveData = { ...saveData, ...ledgerUpdates };
        await sajilo.entities.BusinessPartner.create(saveData);
        toast.success('Supplier created — sub-ledger auto-generated');
      } else {
        const ledgerUpdates = await provisionPartnerLedgers(saveData, settings || {});
        saveData = { ...saveData, ...ledgerUpdates };
        await sajilo.entities.BusinessPartner.update(editing.id, saveData);

        // Synchronize ChartOfAccount names if the supplier name changed
        if (editing.name !== form.name) {
          if (editing.receivable_account_id) {
            await sajilo.entities.ChartOfAccount.update(editing.receivable_account_id, { account_name: form.name });
            await sajilo.entities.BusinessPartner.update(editing.id, { receivable_account_name: form.name });
          }
          if (editing.payable_account_id) {
            await sajilo.entities.ChartOfAccount.update(editing.payable_account_id, { account_name: form.name });
            await sajilo.entities.BusinessPartner.update(editing.id, { payable_account_name: form.name });
          }
        }

        toast.success('Supplier updated');
      }
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    }
    setSaving(false);
    setShowForm(false);
    fetchPartners();
  };

  const toggleActive = async (partner) => {
    await sajilo.entities.BusinessPartner.update(partner.id, { is_active: !partner.is_active });
    fetchPartners();
  };

  const handleDelete = async (partner) => {
    if (!window.confirm(`Delete "${partner.name}"? This will also remove their ledger accounts. This cannot be undone.`)) return;
    
    let blockedReason = null;
    const checks = [];

    if (partner.payable_account_id) {
      checks.push((async () => {
        const acc = await sajilo.entities.ChartOfAccount.filter({ id: partner.payable_account_id }, 'account_code', 1);
        if (!acc || acc.length === 0) return null;
        if (acc[0].current_balance !== 0) return 'a non-zero AP closing balance';
        return null;
      })());
    }

    if (partner.receivable_account_id) {
      checks.push((async () => {
        const acc = await sajilo.entities.ChartOfAccount.filter({ id: partner.receivable_account_id }, 'account_code', 1);
        if (!acc || acc.length === 0) return null;
        if (acc[0].current_balance !== 0) return 'a non-zero AR closing balance';
        return null;
      })());
    }

    const results = await Promise.all(checks);
    blockedReason = results.find(r => r !== null);

    if (blockedReason) {
      toast.error(`Cannot delete: Supplier "${partner.name}" has ${blockedReason}.`);
      return;
    }

    try {
      await sajilo.entities.BusinessPartner.delete(partner.id);
      
      const deletions = [];
      if (partner.payable_account_id) deletions.push(sajilo.entities.ChartOfAccount.delete(partner.payable_account_id));
      if (partner.receivable_account_id) deletions.push(sajilo.entities.ChartOfAccount.delete(partner.receivable_account_id));
      
      const delResults = await Promise.allSettled(deletions);
      const errors = delResults.filter(r => r.status === 'rejected').map(r => r.reason.message);

      if (errors.length > 0) {
        toast.warning(`Partner deleted, but could not delete ledger: ${errors.join(', ')}`);
      } else {
        toast.success(`"${partner.name}" and their ledgers deleted`);
      }
      fetchPartners();
    } catch(err) {
      toast.error('Delete failed: ' + err.message);
    }
  };

  // ── Selection helpers ──
  const toggleRow = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const filteredPartners = partners.filter(p =>
    !search || p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.tax_id_number?.toLowerCase().includes(search.toLowerCase()) ||
    p.email?.toLowerCase().includes(search.toLowerCase())
  );
  const allChecked = filteredPartners.length > 0 && filteredPartners.every(p => selected.has(p.id));
  const toggleAll = () => {
    if (allChecked) {
      setSelected(prev => { const n = new Set(prev); filteredPartners.forEach(p => n.delete(p.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); filteredPartners.forEach(p => n.add(p.id)); return n; });
    }
  };

  const selectedIds = [...selected];
  const selectedPartners = partners.filter(p => selected.has(p.id));

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Manage supplier accounts and trade payable ledgers"
        action={openNew}
        actionLabel="New Supplier"
        actionIcon={Plus}
      />

      {/* Search bar */}
      <div className="mb-4">
        <Input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, VAT/PAN, email…"
          className="max-w-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="table-fluid-grid text-sm">
          <thead className="cell-density bg-muted/30 border-b border-border">
            <tr>
              <th className="cell-density w-10">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Supplier</th>
              <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">VAT/PAN</th>
              <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">City</th>
              <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Dual Role</th>
              <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">AP Ledger</th>
              <th className="cell-density text-left  text-xs font-semibold text-muted-foreground">Status</th>
              <th className="cell-density text-left  text-xs font-semibold text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array(5).fill(0).map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} className="cell-density "><div className="h-6 bg-muted rounded animate-pulse" /></td>
                </tr>
              ))
            ) : filteredPartners.length === 0 ? (
              <tr><td colSpan={8} className="cell-density text-center py-12 text-muted-foreground text-sm">No suppliers found</td></tr>
            ) : filteredPartners.map(row => (
              <tr
                key={row.id}
                className={`hover:bg-muted/20 transition-colors cursor-pointer ${selected.has(row.id) ? 'bg-primary/5' : ''}`}
                onClick={() => openEdit(row)}
              >
                <td className="cell-density w-10" onClick={e => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(row.id)}
                    onCheckedChange={() => toggleRow(row.id)}
                    aria-label={`Select ${row.name}`}
                  />
                </td>
                <td className="cell-density " onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center overflow-hidden">
                      {row.profile_picture_url ? (
                        <img src={row.profile_picture_url} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        row.partner_type === 'Company' ? <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" /> : <User className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{row.email || row.phone || '—'}</p>
                    </div>
                  </div>
                </td>
                <td className="cell-density text-sm text-muted-foreground">{row.tax_id_number || '—'}</td>
                <td className="cell-density text-sm text-muted-foreground">{row.city || '—'}</td>
                <td className="cell-density ">
                  {row.treat_as_customer ? <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 font-medium">Also Customer</span> : null}
                </td>
                <td className="cell-density ">
                  {row.payable_account_name
                    ? <div><span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400">{row.payable_account_code || ''}</span>{row.payable_account_code && <span className="text-xs text-muted-foreground mx-1">—</span>}<span className="text-xs text-emerald-700 dark:text-emerald-400">{row.payable_account_name}</span></div>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="cell-density "><StatusBadge status={row.is_active ? 'Active' : 'Inactive'} /></td>
                <td className="cell-density " onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Edit2 className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => toggleActive(row)}>
                      {row.is_active ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:bg-red-500/10" onClick={() => handleDelete(row)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
          {filteredPartners.length} supplier{filteredPartners.length !== 1 ? 's' : ''}
          {selected.size > 0 && <span className="ml-2 text-primary font-medium">· {selected.size} selected</span>}
        </div>
      </div>

      {/* Batch Actions */}
      <PartnerBatchActions
        selectedIds={selectedIds}
        selectedPartners={selectedPartners}
        partnerType="Supplier"
        onClear={() => setSelected(new Set())}
        onRefresh={fetchPartners}
      />

      {/* Edit / Create Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Supplier' : 'New Supplier'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="col-span-2 flex flex-col items-center gap-4 mb-4">
              <div className="relative w-32 h-32 rounded-full overflow-hidden bg-muted flex items-center justify-center border-4 border-background shadow-md">
                {form.profile_picture_url ? (
                  <img src={form.profile_picture_url} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl font-bold text-muted-foreground">
                    {form.name ? form.name.charAt(0).toUpperCase() : (form.partner_type === 'Company' ? 'C' : 'U')}
                  </span>
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-background/50 flex items-center justify-center backdrop-blur-sm">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                )}
              </div>
              
              <div className="relative">
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (maxFileSize && file.size > maxFileSize) {
                      toast.error(`Please select an image smaller than ${formatBytes(maxFileSize)}`);
                      return;
                    }
                    setUploading(true);
                    try {
                      const fileExt = file.name.split('.').pop();
                      const fileName = `partner-${Date.now()}-${Math.random()}.${fileExt}`;
                      const { error } = await sajilo.auth.supabase.storage.from('avatars').upload(fileName, file);
                      if (error) throw error;
                      const { data } = sajilo.auth.supabase.storage.from('avatars').getPublicUrl(fileName);
                      setForm(prev => ({ ...prev, profile_picture_url: data.publicUrl }));
                    } catch(err) {
                      toast.error('Upload failed: ' + err.message);
                    } finally {
                      setUploading(false);
                    }
                  }}
                  disabled={uploading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button variant="outline" size="sm" disabled={uploading} type="button">
                  <Camera className="w-4 h-4 mr-2" />
                  Change Picture
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                JPG, GIF or PNG. {maxFileSize ? formatBytes(maxFileSize) : '200KB'} max.
              </p>
            </div>
            <div className="col-span-2">
              <Label>Full Name / Company Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Nepal Supplies Pvt Ltd" className="mt-1" />
            </div>
            <div>
              <Label>Partner Type</Label>
              <Select value={form.partner_type} onValueChange={v => setForm({ ...form, partner_type: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Company">Company</SelectItem>
                  <SelectItem value="Individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>VAT/PAN Number</Label>
              <Input value={form.tax_id_number} onChange={e => setForm({ ...form, tax_id_number: e.target.value })} placeholder="e.g. 608734567" className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contact@supplier.com" className="mt-1" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+977 9800000000" className="mt-1" />
            </div>
            <div>
              <Label>City</Label>
              <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Kathmandu" className="mt-1" />
            </div>
            <div>
              <Label>Country</Label>
              <Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street address" className="mt-1" />
            </div>
            <div>
              <Label>Credit Limit (NPR)</Label>
              <Input type="number" value={form.credit_limit_amount} onChange={e => setForm({ ...form, credit_limit_amount: Number(e.target.value) })} className="mt-1" />
            </div>
            <div>
              <Label>Payment Terms (days)</Label>
              <Input type="number" value={form.default_payment_term_days} onChange={e => setForm({ ...form, default_payment_term_days: Number(e.target.value) })} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional" className="mt-1" />
            </div>
            <div className="col-span-2 bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={!!form.treat_as_customer} onCheckedChange={v => setForm({ ...form, treat_as_customer: v, is_customer: v })} />
                <div>
                  <Label className="cursor-pointer">Treat as Customer</Label>
                  <p className="text-xs text-muted-foreground">Uses the same Supplier AP ledger for AR transactions and activates this partner in Sales/POS dropdowns.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
            {editing?.payable_account_name && (
              <div className="col-span-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                AP Ledger: <span className="font-mono font-semibold">{editing.payable_account_code && `${editing.payable_account_code} — `}{editing.payable_account_name}</span>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create Supplier'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}