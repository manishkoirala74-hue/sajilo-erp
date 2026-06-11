import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { postSalesReturn, loadItemsMap, loadSettings } from '@/lib/glPostingService';
import { loadActiveTaxTypes, computeTotalTax } from '@/lib/taxService';

const emptyReturn = {
  return_number: '', sales_invoice_id: '', sales_invoice_number: '',
  customer_id: '', customer_name: '',
  return_date: format(new Date(), 'yyyy-MM-dd'),
  reason: '', status: 'Draft', subtotal: 0, vat_amount: 0, grand_total: 0,
  notes: '', line_items: []
};

export default function SalesReturns() {
  const [returns, setReturns] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [taxTypes, setTaxTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewDetail, setViewDetail] = useState(null);
  const [form, setForm] = useState(emptyReturn);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      sajilo.entities.SalesReturn.list('-created_date'),
      sajilo.entities.SalesInvoice.filter({ status: 'Posted' }, '-invoice_date', 200),
      sajilo.entities.BusinessPartner.filter({ is_customer: true }),
      sajilo.entities.Item.filter({ is_active: true }, 'item_name', 500),
      loadActiveTaxTypes(),
    ]).then(([r, inv, cs, its, txTypes]) => {
      setReturns(r); setInvoices(inv);
      setCustomers(cs.filter(c => c.is_active !== false));
      setItems(its.filter(i => i.item_type !== 'Service'));
      setTaxTypes(txTypes || []);
      setLoading(false);
    });
  }, []);

  const fetchReturns = async () => {
    const data = await sajilo.entities.SalesReturn.list('-created_date');
    setReturns(data);
  };

  const genNumber = () => `SRN-${new Date().getFullYear()}-${String(returns.length + 1).padStart(3, '0')}`;
  const openNew = () => { setForm({ ...emptyReturn, return_number: genNumber() }); setShowForm(true); };

  const fetchFromInvoice = (invId) => {
    const inv = invoices.find(i => i.id === invId);
    if (inv) {
      setForm(f => ({
        ...f,
        sales_invoice_id: inv.id, sales_invoice_number: inv.invoice_number,
        customer_id: inv.customer_id, customer_name: inv.customer_name,
        line_items: (inv.line_items || []).map(l => ({ ...l }))
      }));
      toast.success('Items loaded from invoice');
    }
  };

  const updateLine = (idx, field, val) => {
    const lines = [...form.line_items];
    lines[idx] = { ...lines[idx], [field]: val };
    if (field === 'quantity' || field === 'unit_price') {
      const q = parseFloat(field === 'quantity' ? val : lines[idx].quantity) || 0;
      const p = parseFloat(field === 'unit_price' ? val : lines[idx].unit_price) || 0;
      lines[idx].line_total = parseFloat((q * p).toFixed(2));
    }
    const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);
    const { totalTaxAmount: vat } = computeTotalTax(lines, taxTypes);
    setForm(f => ({ ...f, line_items: lines, subtotal, vat_amount: vat, grand_total: subtotal + vat }));
  };

  const addLine = () => setForm(f => ({ ...f, line_items: [...f.line_items, { item_id: '', item_name: '', quantity: 1, unit_price: 0, line_total: 0 }] }));
  const removeLine = (idx) => setForm(f => ({ ...f, line_items: f.line_items.filter((_, i) => i !== idx) }));

  const handleSave = async (status) => {
    if (!form.customer_name) { toast.error('Select a customer'); return; }
    setSaving(true);
    try {
  const created = await sajilo.entities.SalesReturn.create({ ...form, status });
      if (status === 'Posted') {
        for (const line of form.line_items) {
          if (line.item_id && line.quantity > 0) {
            const its = await sajilo.entities.Item.filter({ id: line.item_id });
            if (its[0] && its[0].item_type !== 'Service') {
              await sajilo.entities.Item.update(its[0].id, { quantity_on_hand: (its[0].quantity_on_hand || 0) + line.quantity });
            }
          }
        }
        // GL Posting
        const [itemsMap, glSettings] = await Promise.all([loadItemsMap(form.line_items.map(l => l.item_id)), loadSettings()]);
        await postSalesReturn({ ...form, id: created.id, return_source: form.return_source || 'Sales Invoice' }, itemsMap, glSettings);
        toast.success('Sales return posted — stock restored & GL updated');
      } else {
        toast.success('Saved as draft');
      }
        } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
    setShowForm(false);
    fetchReturns();
  };

  const columns = [
    { key: 'return_number', label: 'Return #', render: v => <span className="font-mono font-semibold text-primary">{v}</span> },
    { key: 'customer_name', label: 'Customer' },
    { key: 'return_source', label: 'Source', render: (v, row) => (
      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border',
        v === 'POS Sale' ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-500/20' : 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20'
      )}>
        {v === 'POS Sale' ? `POS: ${row.pos_sale_number || '—'}` : (row.sales_invoice_number || '—')}
      </span>
    )},
    { key: 'refund_method', label: 'Refund Via', render: v => v || '—' },
    { key: 'return_date', label: 'Date', isDate: true },
    { key: 'grand_total', label: 'Total', render: v => `NPR ${Number(v).toLocaleString()}` },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (_, row) => <Button variant="ghost" size="icon" onClick={() => setViewDetail(row)}><Eye className="w-4 h-4" /></Button> }
  ];

  return (
    <div>
      <PageHeader title="Sales Returns" subtitle="Customer returns — restores stock on posting"
        action={openNew} actionLabel="New Return" actionIcon={Plus} />

      <DataTable columns={columns} data={returns} searchKey="customer_name" loading={loading} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Sales Return — {form.return_number}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <Label>Customer *</Label>
              <Select value={form.customer_id} onValueChange={v => {
                const c = customers.find(x => x.id === v);
                setForm(f => ({ ...f, customer_id: v, customer_name: c?.name || '' }));
              }}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Load from Posted Invoice</Label>
              <Select onValueChange={fetchFromInvoice}>
                <SelectTrigger className="border-dashed border-primary/50 text-primary"><SelectValue placeholder="📋 Load invoice items…" /></SelectTrigger>
                <SelectContent>{invoices.map(i => <SelectItem key={i.id} value={i.id}>{i.invoice_number} — {i.customer_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <DateInput label="Return Date" value={form.return_date} onChange={v => setForm(f => ({ ...f, return_date: v }))} />
            </div>
            <div>
              <Label>Reason</Label>
              <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Defective / Wrong item…" />
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-base font-semibold">Return Items</Label>
              <Button size="sm" variant="outline" onClick={addLine}>+ Add Row</Button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-left w-24">Qty</th>
                  <th className="px-3 py-2 text-left w-28">Unit Price</th>
                  <th className="px-3 py-2 text-right w-28">Total</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {form.line_items.map((line, idx) => (
                    <tr key={idx}>
                      <td className="px-2 py-1">
                        <Select value={line.item_id} onValueChange={v => {
                          const it = items.find(i => i.id === v);
                          if (it) {
                            const lines = [...form.line_items];
                            lines[idx] = { ...lines[idx], item_id: v, item_name: it.item_name, unit_price: it.selling_price || 0, line_total: (lines[idx].quantity || 1) * (it.selling_price || 0) };
                            const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);
                            setForm(f => ({ ...f, line_items: lines, subtotal, grand_total: subtotal }));
                          }
                        }}>
                          <SelectTrigger className="h-8"><SelectValue placeholder="Select item…" /></SelectTrigger>
                          <SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1"><Input type="number" min={0} value={line.quantity} onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)} className="h-8" /></td>
                      <td className="px-2 py-1"><Input type="number" min={0} value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)} className="h-8" /></td>
                      <td className="px-2 py-1 text-right font-medium">NPR {Number(line.line_total || 0).toLocaleString()}</td>
                      <td className="px-2 py-1"><button onClick={() => removeLine(idx)} className="text-red-500 px-2">×</button></td>
                    </tr>
                  ))}
                  {form.line_items.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground text-sm">Load from invoice or add rows manually</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-2 text-sm font-semibold">Total: NPR {Number(form.grand_total).toLocaleString()}</div>
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => handleSave('Draft')} disabled={saving}>Save Draft</Button>
            <Button onClick={() => handleSave('Posted')} disabled={saving}>{saving ? 'Posting…' : 'Post Return (Restore Stock)'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewDetail} onOpenChange={() => setViewDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Return — {viewDetail?.return_number}</DialogTitle></DialogHeader>
          {viewDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-muted/30 rounded-lg p-4 text-sm">
                <div><span className="text-muted-foreground">Customer:</span> <strong>{viewDetail.customer_name}</strong></div>
                <div><span className="text-muted-foreground">Status:</span> <StatusBadge status={viewDetail.status} /></div>
                <div><span className="text-muted-foreground">Invoice:</span> <strong>{viewDetail.sales_invoice_number || '—'}</strong></div>
                <div><span className="text-muted-foreground">Total:</span> <strong>NPR {Number(viewDetail.grand_total).toLocaleString()}</strong></div>
                {viewDetail.reason && <div className="col-span-2"><span className="text-muted-foreground">Reason:</span> {viewDetail.reason}</div>}
              </div>
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-muted/50"><tr>
                  <th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Total</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {(viewDetail.line_items || []).map((l, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">{l.item_name}</td>
                      <td className="px-3 py-2 text-right">{l.quantity}</td>
                      <td className="px-3 py-2 text-right">NPR {Number(l.unit_price).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-medium">NPR {Number(l.line_total).toLocaleString()}</td>
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