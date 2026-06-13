import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Eye, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import DataTable from '@/components/shared/DataTable';
import LineItemsEditor from '@/components/invoices/LineItemsEditor';
import { toast } from 'sonner';
import { format } from 'date-fns';
import DateInput from '@/components/shared/DateInput';
import { useSajiloSync } from '@/hooks/useSajiloSync';
import { loadActiveTaxTypes, computeTotalTax } from '@/lib/taxService';
import SearchableSelect from '@/components/shared/SearchableSelect';
import QuickPartnerCreate from '@/components/shared/QuickPartnerCreate';
import VoucherLink from '@/components/shared/VoucherLink';

const FULFILLMENT_STATUSES = ['Draft', 'Confirmed', 'Preparing', 'Ready', 'Dispatched', 'Delivered'];

const emptySO = {
  order_number: '', customer_id: '', customer_name: '',
  order_date: format(new Date(), 'yyyy-MM-dd'), expected_delivery_date: '',
  fulfillment_status: 'Draft', subtotal: 0, vat_amount: 0, total_amount: 0,
  notes: '', line_items: []
};

export default function SalesOrders() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showCustomerCreate, setShowCustomerCreate] = useState(false);
  const [viewDetail, setViewDetail] = useState(null);
  const [form, setForm] = useState(emptySO);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [taxTypes, setTaxTypes] = useState([]);

  const loadData = () => {
    Promise.all([
      sajilo.entities.SalesOrder.list('-created_date'),
      sajilo.entities.BusinessPartner.filter({ is_active: true }),
      loadActiveTaxTypes(),
    ]).then(([sos, cs, txTypes]) => {
      setOrders(sos);
      setCustomers(cs.filter(c => c.is_customer || c.treat_as_customer));
      setTaxTypes(txTypes || []);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const viewId = searchParams.get('view');
    if (viewId) {
      if (!viewDetail || viewDetail.order_number !== viewId) {
        sajilo.entities.SalesOrder.filter({ order_number: viewId }).then(res => {
          if (res.length > 0) setViewDetail({ ...res[0], _isViewMode: true });
        });
      }
    } else if (searchParams.get('new') === '1') {
      openNew();
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  const closeViewDetail = () => {
    setViewDetail(null);
    if (searchParams.get('view')) {
      if (location.state?.from) {
        navigate(location.state.from);
      } else {
        searchParams.delete('view');
        setSearchParams(searchParams, { replace: true });
      }
    }
  };

  useSajiloSync(['BusinessPartner'], loadData);

  const fetchOrders = async () => {
    const data = await sajilo.entities.SalesOrder.list('-created_date');
    setOrders(data);
  };

  const generateSONumber = () => {
    const year = new Date().getFullYear();
    const seq = String(orders.length + 1).padStart(3, '0');
    return `SO-${year}-${seq}`;
  };

  const openNew = () => {
    setForm({ ...emptySO, order_number: generateSONumber() });
    setShowForm(true);
  };

  const handleLineChange = (lines) => {
    const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);
    const { totalTaxAmount: vatAmount } = computeTotalTax(lines, taxTypes);
    setForm(f => ({ ...f, line_items: lines, subtotal, vat_amount: vatAmount, total_amount: subtotal + vatAmount }));
  };

  const handleSave = async () => {
    if (!form.customer_name) { toast.error('Select a customer'); return; }
    setSaving(true);
    try {
  await sajilo.entities.SalesOrder.create(form);
      toast.success('Sales order created');
        } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
    setShowForm(false);
    fetchOrders();
  };

  const advanceStatus = async (order) => {
    const idx = FULFILLMENT_STATUSES.indexOf(order.fulfillment_status);
    if (idx < FULFILLMENT_STATUSES.length - 1) {
      const next = FULFILLMENT_STATUSES[idx + 1];
      await sajilo.entities.SalesOrder.update(order.id, { fulfillment_status: next });
      toast.success(`Status updated to ${next}`);
      fetchOrders();
    }
  };

  const filtered = filterStatus === 'all' ? orders : orders.filter(o => o.fulfillment_status === filterStatus);

  const columns = [
    { key: 'order_number', label: 'Order #', render: (val) => (
      <VoucherLink voucherNumber={val}>
        <span className="font-mono font-semibold text-primary cursor-pointer">{val}</span>
      </VoucherLink>
    ) },
    { key: 'customer_name', label: 'Customer' },
    { key: 'order_date', label: 'Date', isDate: true },
    { key: 'total_amount', label: 'Total', render: (val) => <span className="font-semibold">NPR {Number(val).toLocaleString()}</span> },
    { key: 'fulfillment_status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
    {
      key: 'actions', label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setViewDetail(row)}>
            <Eye className="w-4 h-4" />
          </Button>
          {row.fulfillment_status !== 'Delivered' && row.fulfillment_status !== 'Cancelled' && (
            <Button variant="ghost" size="icon" className="text-primary" onClick={() => advanceStatus(row)}>
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Sales Orders"
        subtitle="Manage B2B orders from quotation to delivery"
        action={openNew}
        actionLabel="New Order"
        actionIcon={Plus}
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        {['all', ...FULFILLMENT_STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === s ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} searchKey="customer_name" loading={loading} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Sales Order — {form.order_number}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <Label>Customer *</Label>
              <SearchableSelect
                options={customers.map(c => ({ value: c.id, label: c.name }))}
                value={form.customer_id}
                onChange={v => {
                  const c = customers.find(x => x.id === v);
                  setForm(f => ({ ...f, customer_id: v, customer_name: c?.name || '' }));
                }}
                placeholder="Select customer"
                className="mt-1"
                onCreateNew={() => setShowCustomerCreate(true)}
                createNewText="New Customer"
              />
            </div>
            <div>
              <DateInput label="Order Date" value={form.order_date} onChange={v => setForm(f => ({...f, order_date: v}))} className="mt-1" />
            </div>
            <div>
              <DateInput label="Expected Delivery" value={form.expected_delivery_date} onChange={v => setForm(f => ({...f, expected_delivery_date: v}))} className="mt-1" />
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
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Create Order'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <QuickPartnerCreate
        open={showCustomerCreate}
        onOpenChange={setShowCustomerCreate}
        type="customer"
        onCreated={(customer) => {
          setCustomers(prev => [...prev, customer]);
          setForm(f => ({ ...f, customer_id: customer.id, customer_name: customer.name }));
        }}
      />

      {/* ── VIEW DETAIL ── */}
      <Dialog open={!!viewDetail} onOpenChange={closeViewDetail}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                Sales Order {viewDetail?.order_number}
                <StatusBadge status={viewDetail?.fulfillment_status} />
              </div>
              {viewDetail?._isViewMode && (
                <span className="text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded border border-blue-200 dark:border-blue-800">
                  View Mode
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewDetail && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{viewDetail.customer_name}</span></div>
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{viewDetail.order_date}</span></div>
                <div><span className="text-muted-foreground">Expected Delivery:</span> <span className="font-medium">{viewDetail.expected_delivery_date || '-'}</span></div>
                <div><span className="text-muted-foreground">Subtotal:</span> <span className="font-medium">NPR {Number(viewDetail.subtotal).toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Tax:</span> <span className="font-medium">NPR {Number(viewDetail.vat_amount).toLocaleString()}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Grand Total:</span> <span className="font-bold text-primary text-base"> NPR {Number(viewDetail.total_amount).toLocaleString()}</span></div>
              </div>
              {viewDetail.notes && <p className="text-sm text-muted-foreground border-t pt-3">{viewDetail.notes}</p>}
              {(viewDetail.line_items || []).length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-sm font-semibold mb-2">Line Items</p>
                  <table className="table-fluid-grid text-xs">
                    <thead><tr className="border-b text-muted-foreground"><th className="cell-density text-left py-1">Item</th><th className="cell-density text-right py-1">Qty</th><th className="cell-density text-right py-1">Price</th><th className="cell-density text-right py-1">Total</th></tr></thead>
                    <tbody>
                      {viewDetail.line_items.map((l, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="cell-density py-1">{l.item_name}</td>
                          <td className="cell-density text-right py-1">{l.quantity}</td>
                          <td className="cell-density text-right py-1">NPR {Number(l.unit_price).toLocaleString()}</td>
                          <td className="cell-density text-right py-1 font-medium">NPR {Number(l.line_total).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}