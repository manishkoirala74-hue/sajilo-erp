import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Plus, Eye, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';

const empty = {
  product_name: '', product_item_id: '', bom_description: '',
  planned_quantity: 1, actual_yield_quantity: 0, expected_yield_percent: 100,
  status: 'Draft', start_date: new Date().toISOString().split('T')[0],
  completion_date: '', total_material_cost: 0, total_overhead_cost: 0,
  final_unit_cost: 0, batch_number: '', notes: '',
  bom_components: []
};

const emptyComp = { component_type: 'Material', item_id: '', item_name: '', quantity_required: 1, unit_cost: 0, line_cost: 0 };
const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

export default function ManufacturingOrders() {
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [ords, itms] = await Promise.all([
      sajilo.entities.ManufacturingOrder.list('-created_date', 100),
      sajilo.entities.Item.filter({ is_active: true }, 'item_name', 200)
    ]);
    setOrders(ords);
    setItems(itms);
    setLoading(false);
  };

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleComp = (idx, field, val) => {
    const comps = [...form.bom_components];
    comps[idx] = { ...comps[idx], [field]: val };
    if (field === 'item_id') {
      const item = items.find(i => i.id === val);
      if (item) comps[idx] = { ...comps[idx], item_name: item.item_name, unit_cost: item.weighted_average_cost || 0 };
    }
    if (field === 'quantity_required' || field === 'unit_cost') {
      const q = parseFloat(field === 'quantity_required' ? val : comps[idx].quantity_required) || 0;
      const u = parseFloat(field === 'unit_cost' ? val : comps[idx].unit_cost) || 0;
      comps[idx].line_cost = parseFloat((q * u).toFixed(2));
    }
    const totalMat = comps.filter(c => c.component_type === 'Material').reduce((s, c) => s + (c.line_cost || 0), 0);
    const totalOH = comps.filter(c => c.component_type !== 'Material').reduce((s, c) => s + (c.line_cost || 0), 0);
    const unitCost = form.planned_quantity > 0 ? (totalMat + totalOH) / form.planned_quantity : 0;
    setForm({ ...form, bom_components: comps, total_material_cost: parseFloat(totalMat.toFixed(2)), total_overhead_cost: parseFloat(totalOH.toFixed(2)), final_unit_cost: parseFloat(unitCost.toFixed(2)) });
  };

  const addComp = () => setForm({ ...form, bom_components: [...form.bom_components, { ...emptyComp }] });
  const removeComp = (idx) => setForm({ ...form, bom_components: form.bom_components.filter((_, i) => i !== idx) });

  const save = async (status) => {
    if (!form.product_name) return toast.error('Product name required');
    setSaving(true);
    try {
  const moNum = editing ? form.mo_number : `MO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(3, '0')}`;
      const payload = { ...form, status, mo_number: moNum };
      if (editing) {
        await sajilo.entities.ManufacturingOrder.update(editing, payload);
        toast.success('MO updated');
      } else {
        await sajilo.entities.ManufacturingOrder.create(payload);
        toast.success('Manufacturing order created');
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

  const complete = async (order) => {
    if (!order.actual_yield_quantity) return toast.error('Set actual yield quantity first');
    await sajilo.entities.ManufacturingOrder.update(order.id, {
      status: 'Completed', completion_date: new Date().toISOString().split('T')[0]
    });
    if (order.product_item_id) {
      const item = items.find(i => i.id === order.product_item_id);
      if (item) {
        const newQty = (item.quantity_on_hand || 0) + order.actual_yield_quantity;
        await sajilo.entities.Item.update(order.product_item_id, { quantity_on_hand: newQty, weighted_average_cost: order.final_unit_cost });
      }
    }
    toast.success('Manufacturing order completed, inventory updated');
    fetchData();
  };

  const columns = [
    { key: 'mo_number', label: 'MO #' },
    { key: 'product_name', label: 'Product' },
    { key: 'planned_quantity', label: 'Planned Qty' },
    { key: 'actual_yield_quantity', label: 'Actual Yield' },
    { key: 'start_date', label: 'Start Date' },
    { key: 'total_material_cost', label: 'Material Cost', render: v => fmt(v) },
    { key: 'final_unit_cost', label: 'Unit Cost', render: v => fmt(v) },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (_, row) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => { setSelected(row); setViewOpen(true); }}><Eye className="w-3 h-3" /></Button>
        <Button size="sm" variant="ghost" onClick={() => { setForm(row); setEditing(row.id); setOpen(true); }}>Edit</Button>
        {row.status === 'In Progress' && (
          <Button size="sm" variant="outline" onClick={() => complete(row)}><CheckCircle className="w-3 h-3 mr-1" />Complete</Button>
        )}
      </div>
    )}
  ];

  return (
    <div>
      <PageHeader title="Manufacturing Orders" subtitle="Bill of Materials and production tracking"
        action={() => { setForm(empty); setEditing(null); setOpen(true); }} actionLabel="New MO" actionIcon={Plus} />

      <DataTable columns={columns} data={orders} searchKey="product_name" loading={loading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit MO' : 'New Manufacturing Order'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Product Name *</Label><Input value={form.product_name} onChange={e => f('product_name', e.target.value)} /></div>
              <div><Label>Finished Good Item</Label>
                <Select value={form.product_item_id} onValueChange={v => f('product_item_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select item..." /></SelectTrigger>
                  <SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Planned Quantity</Label><Input type="number" value={form.planned_quantity} onChange={e => f('planned_quantity', parseFloat(e.target.value) || 1)} /></div>
              <div><Label>Actual Yield</Label><Input type="number" value={form.actual_yield_quantity} onChange={e => f('actual_yield_quantity', parseFloat(e.target.value) || 0)} /></div>
              <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => f('start_date', e.target.value)} /></div>
              <div><Label>Completion Date</Label><Input type="date" value={form.completion_date} onChange={e => f('completion_date', e.target.value)} /></div>
              <div><Label>Batch Number</Label><Input value={form.batch_number} onChange={e => f('batch_number', e.target.value)} /></div>
              <div><Label>BOM Description</Label><Input value={form.bom_description} onChange={e => f('bom_description', e.target.value)} /></div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>BOM Components</Label>
                <Button size="sm" variant="outline" onClick={addComp}>+ Add Component</Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50"><tr>
                    <th className="px-2 py-2 text-left">Type</th>
                    <th className="px-2 py-2 text-left">Item</th>
                    <th className="px-2 py-2 text-left">Qty</th>
                    <th className="px-2 py-2 text-left">Unit Cost</th>
                    <th className="px-2 py-2 text-left">Line Cost</th>
                    <th className="px-2 py-2"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {form.bom_components.map((c, idx) => (
                      <tr key={idx}>
                        <td className="px-1 py-1 w-36">
                          <Select value={c.component_type} onValueChange={v => handleComp(idx, 'component_type', v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{['Material','Labor Overhead','Machine Overhead'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1">
                          <Select value={c.item_id} onValueChange={v => handleComp(idx, 'item_id', v)}>
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                            <SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-1 py-1 w-20"><Input type="number" value={c.quantity_required} onChange={e => handleComp(idx, 'quantity_required', parseFloat(e.target.value) || 0)} className="h-7 text-xs" /></td>
                        <td className="px-1 py-1 w-24"><Input type="number" value={c.unit_cost} onChange={e => handleComp(idx, 'unit_cost', parseFloat(e.target.value) || 0)} className="h-7 text-xs" /></td>
                        <td className="px-1 py-1 w-24 text-right font-medium">{fmt(c.line_cost)}</td>
                        <td className="px-1 py-1"><button onClick={() => removeComp(idx)} className="text-red-500 px-2">×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-6 mt-2 text-sm">
                <span>Material: <strong>{fmt(form.total_material_cost)}</strong></span>
                <span>Overhead: <strong>{fmt(form.total_overhead_cost)}</strong></span>
                <span>Unit Cost: <strong className="text-primary">{fmt(form.final_unit_cost)}</strong></span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="outline" onClick={() => save('Draft')} disabled={saving}>Save Draft</Button>
              <Button variant="outline" onClick={() => save('Confirmed')} disabled={saving}>Confirm</Button>
              <Button onClick={() => save('In Progress')} disabled={saving}>Start Production</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>MO — {selected?.mo_number}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Product:</span> <strong>{selected.product_name}</strong></div>
                <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={selected.status} /></div>
                <div><span className="text-muted-foreground">Planned Qty:</span> <strong>{selected.planned_quantity}</strong></div>
                <div><span className="text-muted-foreground">Actual Yield:</span> <strong>{selected.actual_yield_quantity}</strong></div>
                <div><span className="text-muted-foreground">Material Cost:</span> <strong>{fmt(selected.total_material_cost)}</strong></div>
                <div><span className="text-muted-foreground">Unit Cost:</span> <strong className="text-primary">{fmt(selected.final_unit_cost)}</strong></div>
              </div>
              <table className="w-full text-xs border rounded-lg overflow-hidden">
                <thead className="bg-muted/50"><tr>
                  <th className="px-3 py-2 text-left">Component</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit Cost</th>
                  <th className="px-3 py-2 text-right">Line Cost</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {(selected.bom_components || []).map((c, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">{c.item_name}</td>
                      <td className="px-3 py-2">{c.component_type}</td>
                      <td className="px-3 py-2 text-right">{c.quantity_required}</td>
                      <td className="px-3 py-2 text-right">{fmt(c.unit_cost)}</td>
                      <td className="px-3 py-2 text-right">{fmt(c.line_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}