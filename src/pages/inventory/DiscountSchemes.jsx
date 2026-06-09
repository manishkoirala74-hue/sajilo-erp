import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Plus, Edit2, Tag, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';

const empty = {
  scheme_name: '', discount_type: 'Percentage', discount_value: 0,
  applies_to: 'All Items', item_id: '', item_name: '', category_id: '',
  category_name: '', valid_from: '', valid_until: '', minimum_quantity: 0,
  minimum_amount: 0, is_active: true, notes: ''
};

export default function DiscountSchemes() {
  const [schemes, setSchemes] = useState([]);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      sajilo.entities.DiscountScheme.list('-created_date', 200),
      sajilo.entities.Item.filter({ is_active: true }, 'item_name', 500),
      sajilo.entities.ItemCategory.list('category_name', 200),
    ]).then(([s, i, c]) => { setSchemes(s); setItems(i); setCategories(c); setLoading(false); });
  }, []);

  const fetchData = async () => {
    const data = await sajilo.entities.DiscountScheme.list('-created_date', 200);
    setSchemes(data);
  };

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!form.scheme_name) return toast.error('Scheme name is required');
    if (form.discount_value <= 0) return toast.error('Discount value must be greater than 0');
    if (form.discount_type === 'Percentage' && form.discount_value > 100) return toast.error('Percentage cannot exceed 100');
    setSaving(true);
    try {
  const payload = { ...form };
      if (editing) {
        await sajilo.entities.DiscountScheme.update(editing, payload);
        toast.success('Discount scheme updated');
      } else {
        await sajilo.entities.DiscountScheme.create(payload);
        toast.success('Discount scheme created');
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

  const isExpired = (scheme) => scheme.valid_until && new Date(scheme.valid_until) < new Date();
  const isUpcoming = (scheme) => scheme.valid_from && new Date(scheme.valid_from) > new Date();

  const columns = [
    {
      key: 'scheme_name', label: 'Scheme Name',
      render: (v, row) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-emerald-50 flex items-center justify-center">
            <Tag className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div>
            <p className="font-medium text-sm">{v}</p>
            {isExpired(row) && <p className="text-xs text-red-500">Expired</p>}
            {isUpcoming(row) && <p className="text-xs text-amber-600">Upcoming</p>}
          </div>
        </div>
      )
    },
    {
      key: 'discount_value', label: 'Discount',
      render: (v, row) => (
        <span className="font-semibold text-emerald-600">
          {row.discount_type === 'Percentage' ? `${v}%` : `NPR ${Number(v).toLocaleString()}`}
        </span>
      )
    },
    {
      key: 'applies_to', label: 'Applies To',
      render: (v, row) => (
        <div>
          <p className="text-sm">{v}</p>
          <p className="text-xs text-muted-foreground">
            {v === 'Specific Item' && row.item_name}
            {v === 'Item Category' && row.category_name}
          </p>
        </div>
      )
    },
    {
      key: 'valid_from', label: 'Validity',
      render: (v, row) => (
        <span className="text-xs text-muted-foreground">
          {v || '—'} {row.valid_until ? `→ ${row.valid_until}` : ''}
        </span>
      )
    },
    {
      key: 'minimum_quantity', label: 'Min. Conditions',
      render: (v, row) => (
        <div className="text-xs text-muted-foreground">
          {v > 0 && <p>Qty ≥ {v}</p>}
          {row.minimum_amount > 0 && <p>Amt ≥ NPR {Number(row.minimum_amount).toLocaleString()}</p>}
          {v === 0 && row.minimum_amount === 0 && '—'}
        </div>
      )
    },
    { key: 'is_active', label: 'Status', render: v => <StatusBadge status={v ? 'Active' : 'Inactive'} /> },
    {
      key: 'id', label: '',
      render: (_, row) => (
        <Button variant="ghost" size="icon" onClick={() => { setForm(row); setEditing(row.id); setOpen(true); }}>
          <Edit2 className="w-4 h-4" />
        </Button>
      )
    }
  ];

  const activeCount = schemes.filter(s => s.is_active && !isExpired(s)).length;

  return (
    <div>
      <PageHeader
        title="Discount Schemes"
        subtitle="Configure sales discounts by item, category, or globally"
        action={() => { setForm(empty); setEditing(null); setOpen(true); }}
        actionLabel="New Discount"
        actionIcon={Plus}
      />

      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: 'Total Schemes', val: schemes.length },
          { label: 'Active Schemes', val: activeCount },
          { label: 'Expired', val: schemes.filter(s => isExpired(s)).length },
        ].map(s => (
          <div key={s.label} className="bg-white border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{s.val}</p>
          </div>
        ))}
      </div>

      <DataTable columns={columns} data={schemes} searchKey="scheme_name" loading={loading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Discount Scheme' : 'New Discount Scheme'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Scheme Name *</Label>
              <Input value={form.scheme_name} onChange={e => f('scheme_name', e.target.value)} placeholder="e.g. Summer Sale, Bulk Buyer" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Discount Type</Label>
                <Select value={form.discount_type} onValueChange={v => f('discount_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Percentage">Percentage (%)</SelectItem>
                    <SelectItem value="Fixed Amount">Fixed Amount (NPR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Discount Value *</Label>
                <Input type="number" min={0} value={form.discount_value}
                  onChange={e => f('discount_value', parseFloat(e.target.value) || 0)}
                  placeholder={form.discount_type === 'Percentage' ? '0–100' : 'NPR amount'} />
              </div>
            </div>

            <div>
              <Label>Applies To</Label>
              <Select value={form.applies_to} onValueChange={v => {
                setForm(prev => ({ ...prev, applies_to: v, item_id: '', item_name: '', category_id: '', category_name: '' }));
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Items">All Items</SelectItem>
                  <SelectItem value="Specific Item">Specific Item</SelectItem>
                  <SelectItem value="Item Category">Item Category</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.applies_to === 'Specific Item' && (
              <div>
                <Label>Select Item</Label>
                <Select value={form.item_id} onValueChange={v => {
                  const item = items.find(i => i.id === v);
                  setForm(prev => ({ ...prev, item_id: v, item_name: item?.item_name || '' }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Choose item…" /></SelectTrigger>
                  <SelectContent>
                    {items.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name} ({i.item_code || '—'})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.applies_to === 'Item Category' && (
              <div>
                <Label>Select Category</Label>
                <Select value={form.category_id} onValueChange={v => {
                  const cat = categories.find(c => c.id === v);
                  setForm(prev => ({ ...prev, category_id: v, category_name: cat?.category_name || '' }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Choose category…" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Valid From</Label>
                <Input type="date" value={form.valid_from} onChange={e => f('valid_from', e.target.value)} />
              </div>
              <div>
                <Label>Valid Until</Label>
                <Input type="date" value={form.valid_until} onChange={e => f('valid_until', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Minimum Quantity</Label>
                <Input type="number" min={0} value={form.minimum_quantity} onChange={e => f('minimum_quantity', parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Minimum Amount (NPR)</Label>
                <Input type="number" min={0} value={form.minimum_amount} onChange={e => f('minimum_amount', parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Optional" />
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => f('is_active', v)} />
              <Label>Active</Label>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{editing ? 'Update' : 'Create'} Scheme</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}