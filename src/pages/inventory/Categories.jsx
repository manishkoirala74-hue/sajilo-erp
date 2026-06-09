import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Edit2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import { toast } from 'sonner';

const emptyForm = {
  category_name: '', category_code: '', description: '',
  purchase_account_id: '', purchase_account_name: '',
  sales_account_id: '', sales_account_name: '',
  discount_scheme_id: '', discount_scheme_name: ''
};

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [discountSchemes, setDiscountSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      sajilo.entities.ItemCategory.list('category_name'),
      sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 500),
      sajilo.entities.DiscountScheme.filter({ is_active: true }, 'scheme_name', 200),
    ]).then(([cats, accs, ds]) => {
      setCategories(cats);
      setAccounts(accs);
      setDiscountSchemes(ds);
      setLoading(false);
    });
  }, []);

  const fetchCategories = async () => {
    const data = await sajilo.entities.ItemCategory.list('category_name');
    setCategories(data);
  };

  const openNew = () => { setForm(emptyForm); setEditing(null); setShowForm(true); };
  const openEdit = (c) => { setForm(c); setEditing(c); setShowForm(true); };
  const sf = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.category_name) { toast.error('Category name is required'); return; }
    setSaving(true);
    try {
  if (editing) {
        await sajilo.entities.ItemCategory.update(editing.id, form);
        toast.success('Category updated');
      } else {
        await sajilo.entities.ItemCategory.create(form);
        toast.success('Category created');
      }
        } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
    setShowForm(false);
    fetchCategories();
  };

  const subAccounts = accounts.filter(a => a.ledger_type === 'Sub Ledger' || !a.ledger_type);
  const cogsAccounts = subAccounts.filter(a => ['Cost of Goods Sold', 'Expense', 'Asset'].includes(a.account_type));
  const salesAccounts = subAccounts.filter(a => ['Revenue', 'Other Income'].includes(a.account_type));

  const columns = [
    {
      key: 'category_name', label: 'Category Name',
      render: (val) => (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-indigo-50 flex items-center justify-center">
            <Tag className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <span className="font-medium">{val}</span>
        </div>
      )
    },
    { key: 'category_code', label: 'Code' },
    { key: 'description', label: 'Description' },
    {
      key: 'discount_scheme_name', label: 'Discount',
      render: v => v ? <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">{v}</span> : '—'
    },
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
          <Edit2 className="w-4 h-4" />
        </Button>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Item Categories"
        subtitle="Organize products into categories"
        action={openNew}
        actionLabel="New Category"
        actionIcon={Plus}
      />
      <DataTable columns={columns} data={categories} searchKey="category_name" loading={loading} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Category' : 'New Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 mt-2">
            <div className="space-y-3">
              <div>
                <Label>Category Name *</Label>
                <Input value={form.category_name} onChange={e => sf('category_name', e.target.value)} placeholder="e.g. Electronics" />
              </div>
              <div>
                <Label>Category Code</Label>
                <Input value={form.category_code} onChange={e => sf('category_code', e.target.value)} placeholder="e.g. ELEC" />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={form.description} onChange={e => sf('description', e.target.value)} placeholder="Optional" />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 pb-1 border-b border-border">Default Settings</p>
              <div className="space-y-3">
                <div>
                  <Label>Default Discount Scheme</Label>
                  <Select value={form.discount_scheme_id} onValueChange={v => {
                    const d = discountSchemes.find(d => d.id === v);
                    setForm(prev => ({ ...prev, discount_scheme_id: v, discount_scheme_name: d?.scheme_name || '' }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>None</SelectItem>
                      {discountSchemes.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.scheme_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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