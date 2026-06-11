import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Edit2, ToggleLeft, ToggleRight, Building2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import DataTable from '@/components/shared/DataTable';
import { toast } from 'sonner';

const emptyPartner = {
  name: '', partner_type: 'Company', tax_id_number: '',
  is_customer: false, is_vendor: true, is_active: true,
  credit_limit_amount: 0, default_payment_term_days: 30,
  email: '', phone: '', address: '', city: '', country: 'Nepal', notes: ''
};

export default function BusinessPartners() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyPartner);
  const [filter, setFilter] = useState('all');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchPartners(); }, []);

  const fetchPartners = async () => {
    setLoading(true);
    const data = await sajilo.entities.BusinessPartner.list('-created_date');
    setPartners(data);
    setLoading(false);
  };

  const openNew = () => { setForm(emptyPartner); setEditing(null); setShowForm(true); };
  const openEdit = (p) => { setForm(p); setEditing(p); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
  if (editing) {
        await sajilo.entities.BusinessPartner.update(editing.id, form);
        toast.success('Partner updated');
      } else {
        await sajilo.entities.BusinessPartner.create(form);
        toast.success('Partner created');
      }
        } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
    setShowForm(false);
    fetchPartners();
  };

  const toggleActive = async (partner) => {
    await sajilo.entities.BusinessPartner.update(partner.id, { is_active: !partner.is_active });
    fetchPartners();
  };

  const filtered = partners.filter(p => {
    if (filter === 'customer') return p.is_customer;
    if (filter === 'vendor') return p.is_vendor;
    return true;
  });

  const columns = [
    {
      key: 'name', label: 'Partner',
      render: (val, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            {row.partner_type === 'Company'
              ? <Building2 className="w-4 h-4 text-primary" />
              : <User className="w-4 h-4 text-primary" />
            }
          </div>
          <div>
            <p className="font-medium text-foreground">{val}</p>
            <p className="text-xs text-muted-foreground">{row.email || row.phone || '—'}</p>
          </div>
        </div>
      )
    },
    { key: 'tax_id_number', label: 'VAT/PAN' },
    {
      key: 'is_customer', label: 'Role',
      render: (_, row) => (
        <div className="flex gap-1.5">
          {row.is_customer && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 font-medium">Customer</span>}
          {row.is_vendor && <span className="px-2 py-0.5 rounded-full text-xs bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 font-medium">Vendor</span>}
        </div>
      )
    },
    { key: 'city', label: 'City' },
    {
      key: 'credit_limit_amount', label: 'Credit Limit',
      render: (val) => val ? `NPR ${Number(val).toLocaleString()}` : '—'
    },
    {
      key: 'is_active', label: 'Status',
      render: (val) => <StatusBadge status={val ? 'Active' : 'Inactive'} />
    },
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => toggleActive(row)}>
            {row.is_active ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
          </Button>
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Business Partners"
        subtitle="Manage customers and vendors in one unified registry"
        action={openNew}
        actionLabel="New Partner"
        actionIcon={Plus}
      />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {['all', 'customer', 'vendor'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              filter === f ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {f === 'all' ? 'All Partners' : f === 'customer' ? 'Customers' : 'Vendors'}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} searchKey="name" loading={loading} />

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Partner' : 'New Business Partner'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="col-span-2">
              <Label>Full Name / Company Name *</Label>
              <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Tech Solutions Pvt Ltd" className="mt-1" />
            </div>
            <div>
              <Label>Partner Type</Label>
              <Select value={form.partner_type} onValueChange={v => setForm({...form, partner_type: v})}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Company">Company</SelectItem>
                  <SelectItem value="Individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>VAT/PAN Number</Label>
              <Input value={form.tax_id_number} onChange={e => setForm({...form, tax_id_number: e.target.value})} placeholder="e.g. 608734567" className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="contact@company.com" className="mt-1" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+977 9800000000" className="mt-1" />
            </div>
            <div>
              <Label>City</Label>
              <Input value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="Kathmandu" className="mt-1" />
            </div>
            <div>
              <Label>Country</Label>
              <Input value={form.country} onChange={e => setForm({...form, country: e.target.value})} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Street address" className="mt-1" />
            </div>
            <div>
              <Label>Credit Limit (NPR)</Label>
              <Input type="number" value={form.credit_limit_amount} onChange={e => setForm({...form, credit_limit_amount: Number(e.target.value)})} className="mt-1" />
            </div>
            <div>
              <Label>Payment Terms (days)</Label>
              <Input type="number" value={form.default_payment_term_days} onChange={e => setForm({...form, default_payment_term_days: Number(e.target.value)})} className="mt-1" />
            </div>
            <div className="flex items-center gap-6 col-span-2 bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Switch checked={form.is_customer} onCheckedChange={v => setForm({...form, is_customer: v})} />
                <Label>Is Customer</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.is_vendor} onCheckedChange={v => setForm({...form, is_vendor: v})} />
                <Label>Is Vendor</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.is_active} onCheckedChange={v => setForm({...form, is_active: v})} />
                <Label>Active</Label>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}