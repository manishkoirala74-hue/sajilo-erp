import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Plus, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';

const empty = {
  contract_reference: '', customer_id: '', customer_name: '', service_name: '',
  description: '', start_date: new Date().toISOString().split('T')[0],
  expiry_date: '', billing_frequency: 'Monthly', billing_amount: 0,
  next_billing_date: '', status: 'Draft', billing_type: 'Bill in Arrears',
  assigned_sales_rep: '', notes: ''
};

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

export default function ServiceContracts() {
  const [contracts, setContracts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('All');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [conts, custs] = await Promise.all([
      sajilo.entities.ServiceContract.list('-created_date', 200),
      sajilo.entities.BusinessPartner.filter({ is_customer: true }, 'name', 200)
    ]);
    setContracts(conts);
    setCustomers(custs);
    setLoading(false);
  };

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const computeStatus = (expiry) => {
    if (!expiry) return 'Active';
    const today = new Date();
    const exp = new Date(expiry);
    const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'Expired';
    if (diffDays <= 30) return 'Expiring Soon';
    return 'Active';
  };

  const save = async () => {
    if (!form.customer_name || !form.service_name) return toast.error('Customer and service name required');
    setSaving(true);
    try {
  const ref = form.contract_reference || `SC-${new Date().getFullYear()}-${String(contracts.length + 1).padStart(3, '0')}`;
      const status = form.status === 'Draft' ? 'Draft' : computeStatus(form.expiry_date);
      const payload = { ...form, contract_reference: ref, status };
      if (editing) {
        await sajilo.entities.ServiceContract.update(editing, payload);
        toast.success('Contract updated');
      } else {
        await sajilo.entities.ServiceContract.create(payload);
        toast.success('Contract created');
      }
      setOpen(false);
      setEditing(null);
      setForm(empty);
      fetchData();
        } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  const activate = async (contract) => {
    const status = computeStatus(contract.expiry_date);
    await sajilo.entities.ServiceContract.update(contract.id, { status: status === 'Expired' ? 'Expired' : 'Active' });
    toast.success('Contract activated');
    fetchData();
  };

  const filtered = filter === 'All' ? contracts : contracts.filter(c => c.status === filter);

  const columns = [
    { key: 'contract_reference', label: 'Ref #' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'service_name', label: 'Service' },
    { key: 'billing_frequency', label: 'Billing' },
    { key: 'billing_amount', label: 'Amount', render: v => fmt(v) },
    { key: 'next_billing_date', label: 'Next Billing', render: v => v || '—' },
    { key: 'expiry_date', label: 'Expiry', render: v => v || '—' },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (_, row) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => { setForm(row); setEditing(row.id); setOpen(true); }}>Edit</Button>
        {row.status === 'Draft' && <Button size="sm" variant="outline" onClick={() => activate(row)}><RefreshCw className="w-3 h-3 mr-1" />Activate</Button>}
      </div>
    )}
  ];

  const expiring = contracts.filter(c => c.status === 'Expiring Soon').length;

  return (
    <div>
      <PageHeader title="Service Contracts" subtitle="Recurring service agreements and billing schedules"
        action={() => { setForm(empty); setEditing(null); setOpen(true); }} actionLabel="New Contract" actionIcon={Plus} />

      {expiring > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded-lg text-sm mb-4">
          <AlertTriangle className="w-4 h-4" />
          {expiring} contract{expiring > 1 ? 's' : ''} expiring within 30 days
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {['All', 'Draft', 'Active', 'Expiring Soon', 'Expired', 'Suspended', 'Cancelled'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === s ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {s}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} searchKey="customer_name" loading={loading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Contract' : 'New Service Contract'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Customer *</Label>
              <Select value={form.customer_id} onValueChange={v => {
                const c = customers.find(c => c.id === v);
                setForm(prev => ({ ...prev, customer_id: v, customer_name: c?.name || '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="Select customer..." /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Service Name *</Label><Input value={form.service_name} onChange={e => f('service_name', e.target.value)} /></div>
            <div className="col-span-2"><Label>Description</Label><Input value={form.description} onChange={e => f('description', e.target.value)} /></div>
            <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => f('start_date', e.target.value)} /></div>
            <div><Label>Expiry Date</Label><Input type="date" value={form.expiry_date} onChange={e => f('expiry_date', e.target.value)} /></div>
            <div><Label>Billing Frequency</Label>
              <Select value={form.billing_frequency} onValueChange={v => f('billing_frequency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['Monthly','Quarterly','Half-Yearly','Annually'].map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Billing Amount (NPR)</Label><Input type="number" value={form.billing_amount} onChange={e => f('billing_amount', parseFloat(e.target.value) || 0)} /></div>
            <div><Label>Billing Type</Label>
              <Select value={form.billing_type} onValueChange={v => f('billing_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Bill in Arrears">Bill in Arrears</SelectItem><SelectItem value="Bill in Advance">Bill in Advance</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Next Billing Date</Label><Input type="date" value={form.next_billing_date} onChange={e => f('next_billing_date', e.target.value)} /></div>
            <div><Label>Assigned Sales Rep</Label><Input value={form.assigned_sales_rep} onChange={e => f('assigned_sales_rep', e.target.value)} /></div>
            <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={e => f('notes', e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{editing ? 'Update' : 'Create'} Contract</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}