import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Plus, Edit2, ArrowRightLeft } from 'lucide-react';
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
  uom_code: '', uom_name: '', uom_type: 'Quantity',
  is_base_unit: false, base_unit_code: '', conversion_factor: 1,
  is_active: true, description: ''
};

export default function UnitOfMeasures() {
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const data = await sajilo.entities.UnitOfMeasure.list('uom_code', 200);
    setUoms(data);
    setLoading(false);
  };

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const baseUnits = uoms.filter(u => u.is_base_unit && u.is_active);

  const save = async () => {
    if (!form.uom_code || !form.uom_name) return toast.error('Code and name are required');
    setSaving(true);
    try {
  const payload = {
        ...form,
        conversion_factor: form.is_base_unit ? 1 : (parseFloat(form.conversion_factor) || 1)
      };
      if (editing) {
        await sajilo.entities.UnitOfMeasure.update(editing, payload);
        toast.success('UOM updated');
      } else {
        await sajilo.entities.UnitOfMeasure.create(payload);
        toast.success('UOM created');
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

  const columns = [
    { key: 'uom_code', label: 'Code', render: v => <span className="font-mono font-semibold text-primary">{v}</span> },
    { key: 'uom_name', label: 'Name' },
    { key: 'uom_type', label: 'Type' },
    {
      key: 'is_base_unit', label: 'Role',
      render: (v, row) => v
        ? <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">Base Unit</span>
        : (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowRightLeft className="w-3 h-3" />
            <span>1 {row.uom_code} = {row.conversion_factor} {row.base_unit_code || '—'}</span>
          </div>
        )
    },
    { key: 'is_active', label: 'Status', render: v => <StatusBadge status={v ? 'Active' : 'Inactive'} /> },
    { key: 'description', label: 'Description', render: v => v || '—' },
    {
      key: 'id', label: '',
      render: (_, row) => (
        <Button variant="ghost" size="icon" onClick={() => { setForm(row); setEditing(row.id); setOpen(true); }}>
          <Edit2 className="w-4 h-4" />
        </Button>
      )
    }
  ];

  // Group by type for display
  const types = [...new Set(uoms.map(u => u.uom_type))];

  return (
    <div>
      <PageHeader
        title="Units of Measure"
        subtitle="Define stock, purchase & sales units with conversion rules"
        action={() => { setForm(empty); setEditing(null); setOpen(true); }}
        actionLabel="New UOM"
        actionIcon={Plus}
      />

      {/* Conversion Summary Cards */}
      {uoms.filter(u => !u.is_base_unit && u.base_unit_code).length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Active Conversions</p>
          <div className="flex flex-wrap gap-2">
            {uoms.filter(u => !u.is_base_unit && u.base_unit_code && u.is_active).map(u => (
              <div key={u.id} className="flex items-center gap-2 bg-white border border-border rounded-lg px-3 py-2 text-sm">
                <span className="font-semibold text-foreground">1 {u.uom_code}</span>
                <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">{u.conversion_factor} {u.base_unit_code}</span>
                <span className="text-xs text-muted-foreground">({u.uom_name})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable columns={columns} data={uoms} searchKey="uom_name" loading={loading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit UOM' : 'New Unit of Measure'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>UOM Code *</Label>
                <Input placeholder="e.g. DZN" value={form.uom_code} onChange={e => f('uom_code', e.target.value.toUpperCase())} className="font-mono" />
              </div>
              <div>
                <Label>UOM Name *</Label>
                <Input placeholder="e.g. Dozen" value={form.uom_name} onChange={e => f('uom_name', e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Type</Label>
                <Select value={form.uom_type} onValueChange={v => f('uom_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Quantity', 'Weight', 'Volume', 'Length', 'Time', 'Other'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-muted/40 rounded-lg px-4 py-3">
              <Switch checked={form.is_base_unit} onCheckedChange={v => f('is_base_unit', v)} />
              <div>
                <p className="text-sm font-medium">This is a Base Unit</p>
                <p className="text-xs text-muted-foreground">e.g. PCS, KG, LTR — no conversion needed</p>
              </div>
            </div>

            {!form.is_base_unit && (
              <div className="border border-border rounded-lg p-4 space-y-3 bg-blue-50/40">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Conversion Rule</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Base Unit</Label>
                    <Select value={form.base_unit_code} onValueChange={v => f('base_unit_code', v)}>
                      <SelectTrigger><SelectValue placeholder="Select base…" /></SelectTrigger>
                      <SelectContent>
                        {baseUnits.map(u => (
                          <SelectItem key={u.id} value={u.uom_code}>{u.uom_code} — {u.uom_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Conversion Factor</Label>
                    <Input type="number" min={0.0001} step="any" value={form.conversion_factor}
                      onChange={e => f('conversion_factor', parseFloat(e.target.value) || 1)} />
                  </div>
                </div>
                {form.base_unit_code && form.conversion_factor > 0 && (
                  <p className="text-xs text-blue-700 font-medium">
                    1 {form.uom_code || '?'} = {form.conversion_factor} {form.base_unit_code}
                  </p>
                )}
              </div>
            )}

            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={e => f('description', e.target.value)} placeholder="Optional" />
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={v => f('is_active', v)} />
              <Label>Active</Label>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{editing ? 'Update' : 'Create'} UOM</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}