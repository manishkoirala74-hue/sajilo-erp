import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Eye, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import DataTable from '@/components/shared/DataTable';
import { toast } from 'sonner';
import { format } from 'date-fns';
import DateInput from '@/components/shared/DateInput';
import { cn } from '@/lib/utils';
import { postStockAdjustment, loadItemsMap, loadSettings } from '@/lib/glPostingService';

const REASONS = ['Physical Count Variance', 'Damage/Wastage', 'Opening Stock', 'Expiry', 'Theft/Loss', 'Other'];

const emptyAdj = {
  adjustment_number: '', adjustment_date: format(new Date(), 'yyyy-MM-dd'),
  adjustment_type: 'Increase', reason: 'Physical Count Variance',
  status: 'Draft', total_cost_impact: 0, notes: '', line_items: []
};

export default function StockAdjustments() {
  const [adjustments, setAdjustments] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewDetail, setViewDetail] = useState(null);
  const [form, setForm] = useState(emptyAdj);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      sajilo.entities.StockAdjustment.list('-created_date'),
      sajilo.entities.Item.filter({ is_active: true }, 'item_name', 500),
    ]).then(([adj, its]) => {
      setAdjustments(adj);
      // Only physical items — exclude services
      setItems(its.filter(i => i.item_type !== 'Service'));
      setLoading(false);
    });
  }, []);

  const fetchAdj = async () => {
    const data = await sajilo.entities.StockAdjustment.list('-created_date');
    setAdjustments(data);
  };

  const genNumber = () => `ADJ-${new Date().getFullYear()}-${String(adjustments.length + 1).padStart(3, '0')}`;
  const openNew = (type = 'Increase') => {
    setForm({ ...emptyAdj, adjustment_number: genNumber(), adjustment_type: type });
    setShowForm(true);
  };

  const addItem = (itemId) => {
    if (form.line_items.find(l => l.item_id === itemId)) return toast.info('Item already added');
    const it = items.find(i => i.id === itemId);
    if (!it) return;
    const newLine = {
      item_id: it.id, item_name: it.item_name, item_code: it.item_code,
      current_qty: it.quantity_on_hand || 0,
      adjusted_qty: it.quantity_on_hand || 0,
      difference_qty: 0,
      cost_per_unit: it.weighted_average_cost || it.purchase_price || 0,
      cost_impact: 0
    };
    setForm(f => ({ ...f, line_items: [...f.line_items, newLine] }));
  };

  const updateLine = (idx, field, val) => {
    const lines = [...form.line_items];
    lines[idx] = { ...lines[idx], [field]: parseFloat(val) || 0 };
    if (field === 'adjusted_qty' || field === 'cost_per_unit') {
      const diff = lines[idx].adjusted_qty - lines[idx].current_qty;
      lines[idx].difference_qty = diff;
      lines[idx].cost_impact = Math.abs(diff) * lines[idx].cost_per_unit;
    }
    const totalCost = lines.reduce((s, l) => s + (l.cost_impact || 0), 0);
    setForm(f => ({ ...f, line_items: lines, total_cost_impact: parseFloat(totalCost.toFixed(2)) }));
  };

  const removeLine = (idx) => setForm(f => ({ ...f, line_items: f.line_items.filter((_, i) => i !== idx) }));

  const handleSave = async (status) => {
    if (form.line_items.length === 0) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const created = await sajilo.entities.StockAdjustment.create({ ...form, status, idempotency_key: idempotencyKey });
      if (status === 'Posted') {
        // GL Posting & Atomic Stock Update via RPC
        const [itemsMap, glSettings] = await Promise.all([loadItemsMap(form.line_items.map(l => l.item_id)), loadSettings()]);
        await postStockAdjustment({ ...form, id: created.id, idempotency_key: idempotencyKey }, itemsMap, glSettings);
        toast.success(`Stock adjustment posted — ${form.line_items.length} items updated & GL posted`);
      } else {
        toast.success('Adjustment saved as draft');
      }
    } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
    setShowForm(false);
    fetchAdj();
  };

  const columns = [
    { key: 'adjustment_number', label: 'Ref #', render: v => <span className="font-mono font-semibold text-primary">{v}</span> },
    {
      key: 'adjustment_type', label: 'Type',
      render: v => (
        <div className="flex items-center gap-1">
          {v === 'Increase' ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500" />}
          <span className={cn('text-xs font-medium', v === 'Increase' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>{v}</span>
        </div>
      )
    },
    { key: 'adjustment_date', label: 'Date', isDate: true },
    { key: 'reason', label: 'Reason' },
    { key: 'total_cost_impact', label: 'Cost Impact', render: v => `NPR ${Number(v).toLocaleString()}` },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (_, row) => <Button variant="ghost" size="icon" onClick={() => setViewDetail(row)}><Eye className="w-4 h-4" /></Button> }
  ];

  return (
    <div>
      <PageHeader title="Stock Adjustments" subtitle="Increase or decrease stock quantity at purchase cost rate" />

      <div className="flex gap-3 mb-5">
        <Button onClick={() => openNew('Increase')} className="bg-emerald-600 hover:bg-emerald-700">
          <TrendingUp className="w-4 h-4 mr-2" /> Stock Increase
        </Button>
        <Button onClick={() => openNew('Decrease')} variant="outline" className="border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-500/10">
          <TrendingDown className="w-4 h-4 mr-2" /> Stock Decrease
        </Button>
      </div>

      <DataTable columns={columns} data={adjustments} searchKey="reason" loading={loading} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={cn('flex items-center gap-2', form.adjustment_type === 'Increase' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
              {form.adjustment_type === 'Increase' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              Stock {form.adjustment_type} — {form.adjustment_number}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div>
              <DateInput label="Date" value={form.adjustment_date} onChange={v => setForm(f => ({ ...f, adjustment_date: v }))} />
            </div>
            <div>
              <Label>Reason</Label>
              <Select value={form.reason} onValueChange={v => setForm(f => ({ ...f, reason: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
            </div>
          </div>

          {/* Add item */}
          <div className="mt-5">
            <div className="flex items-center gap-3 mb-3">
              <Label className="text-base font-semibold">Items</Label>
              <div className="flex-1 max-w-xs">
                <Select onValueChange={addItem}>
                  <SelectTrigger><SelectValue placeholder="+ Add item…" /></SelectTrigger>
                  <SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name} (Stock: {i.quantity_on_hand})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="table-fluid-grid text-sm">
                <thead className="cell-density bg-muted/50"><tr>
                  <th className="cell-density text-left">Item</th>
                  <th className="cell-density text-right w-28">Current Qty</th>
                  <th className="cell-density text-right w-28">{form.adjustment_type === 'Increase' ? 'New Qty' : 'Adjusted Qty'}</th>
                  <th className="cell-density text-right w-24">Difference</th>
                  <th className="cell-density text-right w-28">Cost/Unit (WAC)</th>
                  <th className="cell-density text-right w-28">Cost Impact</th>
                  <th className="cell-density w-10"></th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {form.line_items.map((line, idx) => (
                    <tr key={idx} className={line.difference_qty > 0 ? 'bg-emerald-50 dark:bg-emerald-500/10/30' : line.difference_qty < 0 ? 'bg-red-50 dark:bg-red-500/10/30' : ''}>
                      <td className="cell-density ">
                        <p className="font-medium">{line.item_name}</p>
                        <p className="text-xs text-muted-foreground">{line.item_code}</p>
                      </td>
                      <td className="cell-density text-right font-mono">{line.current_qty}</td>
                      <td className="cell-density text-right">
                        <Input type="number" min={0} value={line.adjusted_qty}
                          onChange={e => updateLine(idx, 'adjusted_qty', e.target.value)}
                          className="h-8 text-right w-24 ml-auto" />
                      </td>
                      <td className={cn('px-3 py-2 text-right font-semibold', line.difference_qty > 0 ? 'text-emerald-600 dark:text-emerald-400' : line.difference_qty < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                        {line.difference_qty > 0 ? `+${line.difference_qty}` : line.difference_qty}
                      </td>
                      <td className="cell-density text-right">
                        <Input type="number" min={0} value={line.cost_per_unit}
                          onChange={e => updateLine(idx, 'cost_per_unit', e.target.value)}
                          className="h-8 text-right w-28 ml-auto" />
                      </td>
                      <td className="cell-density text-right font-medium">NPR {Number(line.cost_impact || 0).toLocaleString()}</td>
                      <td className="cell-density "><button onClick={() => removeLine(idx)} className="text-red-500 px-2">×</button></td>
                    </tr>
                  ))}
                  {form.line_items.length === 0 && <tr><td colSpan={7} className="cell-density text-center text-muted-foreground text-sm">Add items using the dropdown above</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-2 text-sm font-semibold">
              Total Cost Impact: <span className="ml-2 text-primary">NPR {Number(form.total_cost_impact).toLocaleString()}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => handleSave('Draft')} disabled={saving}>Save Draft</Button>
            <Button onClick={() => handleSave('Posted')} disabled={saving}
              className={form.adjustment_type === 'Increase' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}>
              {saving ? 'Posting…' : `Post ${form.adjustment_type}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewDetail} onOpenChange={() => setViewDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Adjustment — {viewDetail?.adjustment_number}</DialogTitle></DialogHeader>
          {viewDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 bg-muted/30 rounded-lg p-4 text-sm">
                <div><span className="text-muted-foreground">Type:</span> <strong>{viewDetail.adjustment_type}</strong></div>
                <div><span className="text-muted-foreground">Reason:</span> <strong>{viewDetail.reason}</strong></div>
                <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={viewDetail.status} /></div>
              </div>
              <table className="table-fluid-grid text-sm border rounded-lg overflow-hidden">
                <thead className="cell-density bg-muted/50"><tr>
                  <th className="cell-density text-left">Item</th>
                  <th className="cell-density text-right">Before</th>
                  <th className="cell-density text-right">After</th>
                  <th className="cell-density text-right">Diff</th>
                  <th className="cell-density text-right">Cost Impact</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {(viewDetail.line_items || []).map((l, i) => (
                    <tr key={i}>
                      <td className="cell-density ">{l.item_name}</td>
                      <td className="cell-density text-right">{l.current_qty}</td>
                      <td className="cell-density text-right">{l.adjusted_qty}</td>
                      <td className={cn('px-3 py-2 text-right font-semibold', l.difference_qty > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                        {l.difference_qty > 0 ? `+${l.difference_qty}` : l.difference_qty}
                      </td>
                      <td className="cell-density text-right">NPR {Number(l.cost_impact || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-right font-semibold">Total Cost Impact: NPR {Number(viewDetail.total_cost_impact).toLocaleString()}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}