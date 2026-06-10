import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Eye, CheckCircle2, XCircle, Clock, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import DataTable from '@/components/shared/DataTable';
import LineItemsEditor from '@/components/invoices/LineItemsEditor';
import { toast } from 'sonner';
import { format } from 'date-fns';
import ItemPurchaseHistory from '@/components/purchase/ItemPurchaseHistory';
import DateInput from '@/components/shared/DateInput';
import { useSajiloSync } from '@/hooks/useSajiloSync';
import { loadActiveTaxTypes, computeTotalTax } from '@/lib/taxService';

const emptyPO = {
  po_number: '', vendor_id: '', vendor_name: '', status: 'Draft',
  order_date: format(new Date(), 'yyyy-MM-dd'),
  expected_delivery_date: '',
  subtotal: 0, vat_amount: 0, total_amount: 0, notes: '', line_items: []
};

export default function PurchaseOrders() {
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewDetail, setViewDetail] = useState(null);
  const [form, setForm] = useState(emptyPO);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [taxTypes, setTaxTypes] = useState([]);

  const loadData = () => {
    Promise.all([
      sajilo.entities.PurchaseOrder.list('-created_date'),
      sajilo.entities.BusinessPartner.filter({ is_active: true }),
      loadActiveTaxTypes(),
    ]).then(([pos, vs, txTypes]) => {
      setOrders(pos);
      setVendors(vs.filter(v => v.is_vendor || v.treated_as_vendor));
      setTaxTypes(txTypes || []);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  useSajiloSync(['BusinessPartner'], loadData);

  const fetchOrders = async () => {
    const data = await sajilo.entities.PurchaseOrder.list('-created_date');
    setOrders(data);
  };

  const generatePONumber = () => {
    const year = new Date().getFullYear();
    const seq = String(orders.length + 1).padStart(3, '0');
    return `PO-${year}-${seq}`;
  };

  const openNew = () => {
    setForm({ ...emptyPO, po_number: generatePONumber() });
    setShowForm(true);
  };

  const handleLineChange = (lines) => {
    const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);
    const { totalTaxAmount: vatAmount } = computeTotalTax(lines, taxTypes);
    setForm(f => ({ ...f, line_items: lines, subtotal, vat_amount: vatAmount, total_amount: subtotal + vatAmount }));
  };

  const handleSave = async (submitStatus = 'Draft') => {
    if (!form.vendor_name) { toast.error('Select a vendor'); return; }
    setSaving(true);
    try {
  const data = { ...form, status: submitStatus };
      await sajilo.entities.PurchaseOrder.create(data);
      toast.success(`PO ${submitStatus === 'Draft' ? 'saved as draft' : 'submitted for approval'}`);
        } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
    setShowForm(false);
    fetchOrders();
  };

  const approveOrder = async (po) => {
    await sajilo.entities.PurchaseOrder.update(po.id, { status: 'Approved', approved_date: format(new Date(), 'yyyy-MM-dd') });
    toast.success('PO Approved');
    fetchOrders();
  };

  const cancelOrder = async (po) => {
    await sajilo.entities.PurchaseOrder.update(po.id, { status: 'Cancelled' });
    toast.success('PO Cancelled');
    fetchOrders();
  };

  const filtered = filterStatus === 'all' ? orders : orders.filter(o => o.status === filterStatus);

  const statuses = ['all', 'Draft', 'Pending Approval', 'Approved', 'Billed', 'Cancelled'];

  const columns = [
    { key: 'po_number', label: 'PO Number', render: (val) => <span className="font-mono font-semibold text-primary">{val}</span> },
    { key: 'vendor_name', label: 'Vendor' },
    { key: 'order_date', label: 'Date', isDate: true },
    {
      key: 'total_amount', label: 'Amount',
      render: (val) => <span className="font-semibold">NPR {Number(val).toLocaleString()}</span>
    },
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
    {
      key: 'actions', label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setViewDetail(row)}>
            <Eye className="w-4 h-4" />
          </Button>
          {row.status === 'Pending Approval' && (
            <Button variant="ghost" size="icon" className="text-emerald-500 hover:text-emerald-700" onClick={() => approveOrder(row)}>
              <CheckCircle2 className="w-4 h-4" />
            </Button>
          )}
          {(row.status === 'Draft' || row.status === 'Pending Approval') && (
            <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-600" onClick={() => cancelOrder(row)}>
              <XCircle className="w-4 h-4" />
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Purchase Orders"
        subtitle="Manage procurement requests and approvals"
        action={openNew}
        actionLabel="New PO"
        actionIcon={Plus}
      />

      {/* Pending Approvals Banner */}
      {orders.filter(o => o.status === 'Pending Approval').length > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <Clock className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            {orders.filter(o => o.status === 'Pending Approval').length} purchase order(s) awaiting your approval
          </p>
          <Button size="sm" variant="outline" className="ml-auto border-amber-300 text-amber-700 hover:bg-amber-100"
            onClick={() => setFilterStatus('Pending Approval')}>
            Review Now
          </Button>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        {statuses.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === s ? 'bg-primary text-white' : 'bg-white border border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} searchKey="vendor_name" loading={loading} />

      {/* Create PO Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Purchase Order — {form.po_number}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <Label>Vendor *</Label>
              <Select value={form.vendor_id} onValueChange={v => {
                const vendor = vendors.find(vn => vn.id === v);
                setForm(f => ({ ...f, vendor_id: v, vendor_name: vendor?.name || '' }));
              }}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Order Date</Label>
              <DateInput value={form.order_date} onChange={v => setForm(f => ({...f, order_date: v}))} className="mt-1" />
            </div>
            <div>
              <Label>Expected Delivery</Label>
              <DateInput value={form.expected_delivery_date} onChange={v => setForm(f => ({...f, expected_delivery_date: v}))} className="mt-1" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Optional notes" className="mt-1" />
            </div>
          </div>

          <div className="mt-6">
            <Label className="text-base font-semibold mb-3 block">Line Items</Label>
            <LineItemsEditor value={form.line_items} onChange={handleLineChange} taxTypes={taxTypes} />
          </div>

          {form.vendor_id && (
            <div className="mt-4">
              <ItemPurchaseHistory vendorId={form.vendor_id} />
            </div>
          )}

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => handleSave('Draft')} disabled={saving}>Save as Draft</Button>
            <Button onClick={() => handleSave('Pending Approval')} disabled={saving}>
              {saving ? 'Saving...' : 'Submit for Approval'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      {viewDetail && (
        <Dialog open={!!viewDetail} onOpenChange={() => setViewDetail(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Purchase Order — {viewDetail.po_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4 bg-muted/30 rounded-lg p-4">
                <div><p className="text-xs text-muted-foreground">Vendor</p><p className="font-medium">{viewDetail.vendor_name}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><StatusBadge status={viewDetail.status} /></div>
                <div><p className="text-xs text-muted-foreground">Order Date</p><p className="font-medium">{viewDetail.order_date}</p></div>
                <div><p className="text-xs text-muted-foreground">Grand Total</p><p className="font-bold text-lg">NPR {Number(viewDetail.total_amount).toLocaleString()}</p></div>
              </div>
              {viewDetail.line_items?.length > 0 && (
                <div>
                  <p className="font-semibold mb-2">Line Items</p>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-3 py-2 text-left">Item</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Price</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {viewDetail.line_items.map((line, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2">{line.item_name}</td>
                            <td className="px-3 py-2 text-right">{line.quantity}</td>
                            <td className="px-3 py-2 text-right">NPR {Number(line.unit_price).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-medium">NPR {Number(line.line_total).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}