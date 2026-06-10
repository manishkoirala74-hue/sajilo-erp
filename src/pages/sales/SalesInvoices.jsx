import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Eye, CheckCircle2, XCircle, Ban, AlertTriangle, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
import { postSalesInvoice, loadItemsMap, loadSettings } from '@/lib/glPostingService';
import { loadActiveTaxTypes, computeTotalTax } from '@/lib/taxService';
import { useSajiloSync } from '@/hooks/useSajiloSync';

const emptySI = {
  invoice_number: '', customer_id: '', customer_name: '', sales_order_id: '',
  invoice_date: format(new Date(), 'yyyy-MM-dd'),
  due_date: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
  payment_mode: 'Credit', cash_bank_account_id: '', cash_bank_account_name: '',
  status: 'Draft', payment_status: 'Unpaid',
  goods_subtotal: 0, sundry_charges_total: 0, total_tax_amount: 0, grand_total: 0,
  notes: '', line_items: []
};

export default function SalesInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [taxTypes, setTaxTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewDetail, setViewDetail] = useState(null);
  const [form, setForm] = useState(emptySI);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  // Cancel dialog state
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Reject dialog state
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // Duplicate warning state
  const [dupWarning, setDupWarning] = useState(false);
  const [pendingPostStatus, setPendingPostStatus] = useState(null);

  const loadData = () => {
    Promise.all([
      sajilo.entities.SalesInvoice.list('-created_date'),
      sajilo.entities.BusinessPartner.filter({ is_active: true }),
      sajilo.entities.SalesOrder.filter({ fulfillment_status: 'Confirmed' }),
      sajilo.entities.CompanySettings.list(),
      sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 500),
      loadActiveTaxTypes(),
    ]).then(([inv, cs, sos, sett, accs, txTypes]) => {
      setInvoices(inv);
      setCustomers(cs.filter(c => c.is_customer || c.treat_as_customer));
      setSalesOrders(sos);
      setSettings(sett.length > 0 ? sett[0] : {});
      setAccounts(accs);
      setTaxTypes(txTypes || []);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  useSajiloSync(['BusinessPartner', 'SalesOrder', 'CompanySettings'], loadData);

  const fetchInvoices = async () => {
    const data = await sajilo.entities.SalesInvoice.list('-created_date');
    setInvoices(data);
  };

  const generateInvoiceNumber = () => {
    const year = new Date().getFullYear();
    const prefix = settings?.invoice_prefix_sales || 'SI';
    const suffix = settings?.invoice_suffix || '';
    const startFrom = settings?.invoice_next_number || 1;
    const seq = String(startFrom).padStart(3, '0');
    return `${prefix}-${year}-${seq}${suffix}`;
  };

  const openNew = () => {
    const isAuto = !settings || settings.invoice_numbering_method !== 'Manual';
    const invNumber = isAuto ? generateInvoiceNumber() : '';
    setForm({ ...emptySI, invoice_number: invNumber });
    setDupWarning(false);
    setPendingPostStatus(null);
    setShowForm(true);
  };

  const openEdit = (row) => {
    setForm({ ...emptySI, ...row });
    setDupWarning(false);
    setPendingPostStatus(null);
    setShowForm(true);
  };

  const fetchFromSO = (soId) => {
    const so = salesOrders.find(s => s.id === soId);
    if (so) {
      setForm(f => ({
        ...f,
        sales_order_id: so.id,
        customer_id: so.customer_id,
        customer_name: so.customer_name,
        line_items: so.line_items || [],
        goods_subtotal: so.subtotal,
        total_tax_amount: so.vat_amount,
        grand_total: so.total_amount,
      }));
      toast.success('Data fetched from Sales Order');
    }
  };

  const handleLineChange = (lines) => {
    const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);
    const { totalTaxAmount: taxAmount } = computeTotalTax(lines, taxTypes);
    setForm(f => ({
      ...f, line_items: lines, goods_subtotal: subtotal,
      total_tax_amount: taxAmount,
      grand_total: subtotal + taxAmount + (f.sundry_charges_total || 0)
    }));
  };

  const checkDuplicate = (invoiceNumber, excludeId = null) => {
    return invoices.some(inv => inv.invoice_number === invoiceNumber && inv.id !== excludeId);
  };

  const handleSave = async (postStatus = 'Draft') => {
    if (form.payment_mode === 'Credit' && !form.customer_name) { toast.error('Select a customer'); return; }
    if (['Cash', 'Bank'].includes(form.payment_mode) && !form.cash_bank_account_id) { toast.error('Select a Cash/Bank ledger account'); return; }
    if (!form.invoice_number) { toast.error('Invoice number is required'); return; }
    if (!form.grand_total || form.grand_total <= 0) { toast.error('Total amount cannot be empty or zero'); return; }

    const isManual = settings?.invoice_numbering_method === 'Manual';

    if (isManual && checkDuplicate(form.invoice_number, form.id)) {
      const handling = settings?.invoice_duplicate_handling || 'Block';
      if (handling === 'Block') {
        toast.error(`Invoice number "${form.invoice_number}" already exists. Duplicate numbers are not allowed.`);
        return;
      } else {
        if (!dupWarning) {
          setDupWarning(true);
          setPendingPostStatus(postStatus);
          return;
        }
        setDupWarning(false);
        setPendingPostStatus(null);
      }
    }

    setSaving(true);
    try {
      const isCashOrBank = ['Cash', 'Bank'].includes(form.payment_mode);
      const data = { 
        ...form, 
        status: postStatus,
        payment_status: isCashOrBank ? 'Paid' : form.payment_status 
      };

      if (isCashOrBank) {
        data.notes = (data.notes ? data.notes + '\n' : '') + `Payment Mode: ${form.payment_mode} (${form.cash_bank_account_name})`;
      }

      const payload = { ...data };
      delete payload.payment_mode;
      delete payload.cash_bank_account_id;
      delete payload.cash_bank_account_name;

      if (form.id) {
        const oldInv = invoices.find(i => i.id === form.id);
        if (oldInv && oldInv.status === 'Posted') {
          for (const line of (oldInv.line_items || [])) {
            if (line.item_id) {
              const items = await sajilo.entities.Item.filter({ id: line.item_id });
              if (items.length > 0) {
                const item = items[0];
                const restoredQty = (item.quantity_on_hand || 0) + (line.quantity || 0);
                await sajilo.entities.Item.update(item.id, { quantity_on_hand: restoredQty });
              }
            }
          }
          const [itemsMap, glSettings] = await Promise.all([loadItemsMap((oldInv.line_items || []).map(l => l.item_id)), loadSettings()]);
          await postSalesInvoice(oldInv, itemsMap, glSettings, true);
        }

        await sajilo.entities.SalesInvoice.update(form.id, payload);

        if (postStatus === 'Posted') {
          for (const line of form.line_items) {
            if (line.item_id) {
              const items = await sajilo.entities.Item.filter({ id: line.item_id });
              if (items.length > 0) {
                const item = items[0];
                const newQty = Math.max(0, (item.quantity_on_hand || 0) - (line.quantity || 0));
                await sajilo.entities.Item.update(item.id, { quantity_on_hand: newQty });
              }
            }
          }
          const [itemsMap, glSettings] = await Promise.all([loadItemsMap(form.line_items.map(l => l.item_id)), loadSettings()]);
          await postSalesInvoice(data, itemsMap, glSettings);
          toast.success('Invoice updated and posted — stock deducted & GL updated');
        } else {
          toast.success('Invoice updated as draft');
        }
      } else {
        const created = await sajilo.entities.SalesInvoice.create(payload);

        if (postStatus === 'Posted') {
          for (const line of form.line_items) {
            if (line.item_id) {
              const items = await sajilo.entities.Item.filter({ id: line.item_id });
              if (items.length > 0) {
                const item = items[0];
                const newQty = Math.max(0, (item.quantity_on_hand || 0) - (line.quantity || 0));
                await sajilo.entities.Item.update(item.id, { quantity_on_hand: newQty });
              }
            }
          }
          const [itemsMap, glSettings] = await Promise.all([loadItemsMap(form.line_items.map(l => l.item_id)), loadSettings()]);
          await postSalesInvoice({ ...data, id: created.id }, itemsMap, glSettings);
          toast.success('Invoice posted — stock deducted & GL updated');
        } else {
          toast.success('Invoice saved as draft');
        }
      }

    } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
    setShowForm(false);
    fetchInvoices();
  };

  const markPaid = async (inv) => {
    await sajilo.entities.SalesInvoice.update(inv.id, { payment_status: 'Paid' });
    toast.success('Invoice marked as paid');
    fetchInvoices();
  };

  // ── CANCEL (reverses all transactions, stock restored) ──
  const handleConfirmCancel = async () => {
    if (!cancelReason.trim()) { toast.error('Please provide a cancellation reason'); return; }
    setCancelling(true);
    const inv = cancelTarget;

    // Reverse stock if it was Posted
    if (inv.status === 'Posted') {
      for (const line of (inv.line_items || [])) {
        if (line.item_id) {
          const items = await sajilo.entities.Item.filter({ id: line.item_id });
          if (items.length > 0) {
            const item = items[0];
            const restoredQty = (item.quantity_on_hand || 0) + (line.quantity || 0);
            await sajilo.entities.Item.update(item.id, { quantity_on_hand: restoredQty });
          }
        }
      }
    }

    await sajilo.entities.SalesInvoice.update(inv.id, {
      status: 'Cancelled',
      payment_status: 'Unpaid',
      cancellation_reason: cancelReason,
      cancelled_date: format(new Date(), 'yyyy-MM-dd'),
    });

    // GL Reversal
    if (inv.status === 'Posted') {
      const [itemsMap, glSettings] = await Promise.all([loadItemsMap((inv.line_items || []).map(l => l.item_id)), loadSettings()]);
      await postSalesInvoice(inv, itemsMap, glSettings, true);
    }
    toast.success('Invoice cancelled — all transactions reversed & GL updated');
    setCancelling(false);
    setCancelTarget(null);
    setCancelReason('');
    fetchInvoices();
  };

  // ── REJECT (no transactions — just reserve & void the number) ──
  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) { toast.error('Please provide a rejection reason'); return; }
    setRejecting(true);
    await sajilo.entities.SalesInvoice.update(rejectTarget.id, {
      status: 'Rejected',
      rejection_reason: rejectReason,
      rejected_date: format(new Date(), 'yyyy-MM-dd'),
    });
    toast.success('Invoice number rejected and recorded');
    setRejecting(false);
    setRejectTarget(null);
    setRejectReason('');
    fetchInvoices();
  };

  const filtered = filterStatus === 'all' ? invoices : invoices.filter(i =>
    filterStatus === 'Unpaid' ? i.payment_status === 'Unpaid' && i.status === 'Posted'
    : filterStatus === 'Rejected' ? i.status === 'Rejected'
    : i.status === filterStatus
  );

  const columns = [
    { key: 'invoice_number', label: 'Invoice #', render: (val, row) => (
      <span className={`font-mono font-semibold ${row.status === 'Cancelled' ? 'line-through text-muted-foreground' : row.status === 'Rejected' ? 'text-orange-500 line-through' : 'text-primary'}`}>{val}</span>
    )},
    { key: 'customer_name', label: 'Customer', render: (val, row) => (
      <span className={row.status === 'Cancelled' || row.status === 'Rejected' ? 'text-muted-foreground' : ''}>{val || '—'}</span>
    )},
    { key: 'invoice_date', label: 'Date', isDate: true },
    { key: 'grand_total', label: 'Total', render: (val, row) => (
      <span className={`font-semibold ${row.status === 'Cancelled' ? 'line-through text-muted-foreground' : ''}`}>NPR {Number(val).toLocaleString()}</span>
    )},
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
    { key: 'payment_status', label: 'Payment', render: (val, row) => (
      row.status === 'Cancelled' || row.status === 'Rejected' ? <span className="text-xs text-muted-foreground">—</span> : <StatusBadge status={val} />
    )},
    {
      key: 'actions', label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" title="View" onClick={() => setViewDetail(row)}>
            <Eye className="w-4 h-4" />
          </Button>
          {row.payment_status === 'Unpaid' && row.status === 'Posted' && (
            <Button variant="ghost" size="icon" className="text-emerald-500" title="Mark Paid" onClick={() => markPaid(row)}>
              <CheckCircle2 className="w-4 h-4" />
            </Button>
          )}
          {(row.status === 'Draft' || row.status === 'Posted') && (
            <Button variant="ghost" size="icon" className="text-primary" title="Edit Invoice" onClick={() => openEdit(row)}>
              <Pencil className="w-4 h-4" />
            </Button>
          )}
          {(row.status === 'Draft' || row.status === 'Posted') && (
            <Button variant="ghost" size="icon" className="text-destructive" title="Cancel Invoice (reverse transactions)" onClick={() => { setCancelTarget(row); setCancelReason(''); }}>
              <XCircle className="w-4 h-4" />
            </Button>
          )}
          {row.status === 'Draft' && (
            <Button variant="ghost" size="icon" className="text-orange-500" title="Reject Invoice Number (no transactions)" onClick={() => { setRejectTarget(row); setRejectReason(''); }}>
              <Ban className="w-4 h-4" />
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Sales Invoices"
        subtitle="Create and manage customer invoices and track payments"
        action={openNew}
        actionLabel="New Invoice"
        actionIcon={Plus}
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: 'all', label: 'All' },
          { key: 'Draft', label: 'Draft' },
          { key: 'Posted', label: 'Posted' },
          { key: 'Unpaid', label: 'Unpaid' },
          { key: 'Cancelled', label: 'Cancelled' },
          { key: 'Rejected', label: 'Rejected' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === f.key ? 'bg-primary text-white' : 'bg-white border border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {f.label}
            {f.key === 'Cancelled' && <span className="ml-1.5 text-xs bg-red-100 text-red-600 rounded-full px-1.5">{invoices.filter(i => i.status === 'Cancelled').length}</span>}
            {f.key === 'Rejected' && <span className="ml-1.5 text-xs bg-orange-100 text-orange-600 rounded-full px-1.5">{invoices.filter(i => i.status === 'Rejected').length}</span>}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} searchKey="customer_name" loading={loading} />

      {/* ── NEW INVOICE FORM ── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Sales Invoice' : 'New Sales Invoice'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="col-span-2">
              <Label>Payment Mode</Label>
              <div className="flex gap-2 mt-1">
                {['Credit', 'Cash', 'Bank'].map(mode => (
                  <Button 
                    key={mode} 
                    type="button"
                    variant={form.payment_mode === mode ? 'default' : 'outline'}
                    onClick={() => setForm(f => ({ ...f, payment_mode: mode, cash_bank_account_id: '', cash_bank_account_name: '', customer_id: '', customer_name: '' }))}
                    className="flex-1"
                  >
                    {mode}
                  </Button>
                ))}
              </div>
            </div>
            <div className="col-span-2">
              <Label>Invoice Number *</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={form.invoice_number}
                  onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                  readOnly={settings?.invoice_numbering_method !== 'Manual'}
                  className={settings?.invoice_numbering_method !== 'Manual' ? 'font-mono bg-muted' : 'font-mono'}
                  placeholder={settings?.invoice_numbering_method === 'Manual' ? 'Enter invoice number' : ''}
                />
                {settings?.invoice_numbering_method !== 'Manual' && (
                  <span className="flex items-center text-xs text-muted-foreground bg-muted px-2 rounded border border-border whitespace-nowrap">Auto</span>
                )}
              </div>
              {settings?.invoice_numbering_method === 'Manual' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Manual mode — {settings?.invoice_duplicate_handling === 'Warn' ? 'Duplicate numbers will trigger a warning' : 'Duplicate numbers are blocked'}
                </p>
              )}
            </div>
            
            {form.payment_mode === 'Credit' ? (
              <div>
                <Label>Customer *</Label>
                <Select value={form.customer_id} onValueChange={v => {
                  const c = customers.find(x => x.id === v);
                  setForm(f => ({ ...f, customer_id: v, customer_name: c?.name || '' }));
                }}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div>
                  <Label>{form.payment_mode} Account (Ledger) *</Label>
                  <Select value={form.cash_bank_account_id} onValueChange={v => {
                    const acc = accounts.find(x => x.id === v);
                    setForm(f => ({ ...f, cash_bank_account_id: v, cash_bank_account_name: acc?.account_name || '' }));
                  }}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder={`Select ${form.payment_mode} account`} /></SelectTrigger>
                    <SelectContent>
                      {accounts
                        .filter(a => a.ledger_type === 'Sub Ledger' && (form.payment_mode === 'Cash' ? a.account_name.toLowerCase().includes('cash') : (a.parent_account_name?.toLowerCase().includes('bank') || a.account_name.toLowerCase().includes('bank'))))
                        .map(a => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Customer Name (Optional)</Label>
                  <Input 
                    value={form.customer_name} 
                    onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} 
                    placeholder="Walk-in Customer" 
                    className="mt-1" 
                  />
                </div>
              </>
            )}
            <div>
              <Label>Fetch from Sales Order</Label>
              <Select onValueChange={fetchFromSO}>
                <SelectTrigger className="mt-1 border-dashed border-primary/50 text-primary">
                  <SelectValue placeholder="📋 Fetch from SO..." />
                </SelectTrigger>
                <SelectContent>
                  {salesOrders.map(so => (
                    <SelectItem key={so.id} value={so.id}>{so.order_number} — {so.customer_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <DateInput label="Invoice Date" value={form.invoice_date} onChange={v => setForm(f => ({...f, invoice_date: v}))} className="mt-1" />
            </div>
            <div>
              <DateInput label="Due Date" value={form.due_date} onChange={v => setForm(f => ({...f, due_date: v}))} className="mt-1" />
            </div>
            <div>
              <Label>Sundry Charges (NPR)</Label>
              <Input type="number" value={form.sundry_charges_total} onChange={e => {
                const sc = Number(e.target.value);
                setForm(f => ({ ...f, sundry_charges_total: sc, grand_total: f.goods_subtotal + f.total_tax_amount + sc }));
              }} className="mt-1" />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Optional" className="mt-1" />
            </div>
          </div>

          <div className="mt-6">
            <Label className="text-base font-semibold mb-3 block">Line Items</Label>
            <LineItemsEditor value={form.line_items} onChange={handleLineChange} taxTypes={taxTypes} />
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => handleSave('Draft')} disabled={saving}>Save Draft</Button>
            <Button onClick={() => handleSave('Posted')} disabled={saving}>
              {saving ? 'Posting...' : 'Post Invoice (Deduct Stock)'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── VIEW DETAIL ── */}
      <Dialog open={!!viewDetail} onOpenChange={() => setViewDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Invoice {viewDetail?.invoice_number}
              <StatusBadge status={viewDetail?.status} />
            </DialogTitle>
          </DialogHeader>
          {viewDetail && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{viewDetail.customer_name}</span></div>
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{viewDetail.invoice_date}</span></div>
                <div><span className="text-muted-foreground">Due Date:</span> <span className="font-medium">{viewDetail.due_date}</span></div>
                <div><span className="text-muted-foreground">Payment:</span> <StatusBadge status={viewDetail.payment_status} /></div>
                <div><span className="text-muted-foreground">Subtotal:</span> <span className="font-medium">NPR {Number(viewDetail.goods_subtotal).toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Tax:</span> <span className="font-medium">NPR {Number(viewDetail.total_tax_amount).toLocaleString()}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Grand Total:</span> <span className="font-bold text-primary text-base"> NPR {Number(viewDetail.grand_total).toLocaleString()}</span></div>
              </div>
              {viewDetail.notes && <p className="text-sm text-muted-foreground border-t pt-3">{viewDetail.notes}</p>}
              {viewDetail.status === 'Cancelled' && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-red-700 flex items-center gap-1"><XCircle className="w-4 h-4" /> Cancelled</p>
                  <p className="text-sm text-red-600 mt-1">{viewDetail.cancellation_reason}</p>
                  <p className="text-xs text-red-400 mt-1">Date: {viewDetail.cancelled_date}</p>
                </div>
              )}
              {viewDetail.status === 'Rejected' && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-sm font-semibold text-orange-700 flex items-center gap-1"><Ban className="w-4 h-4" /> Rejected (Number Voided)</p>
                  <p className="text-sm text-orange-600 mt-1">{viewDetail.rejection_reason}</p>
                  <p className="text-xs text-orange-400 mt-1">Date: {viewDetail.rejected_date}</p>
                </div>
              )}
              {(viewDetail.line_items || []).length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-sm font-semibold mb-2">Line Items</p>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b text-muted-foreground"><th className="text-left py-1">Item</th><th className="text-right py-1">Qty</th><th className="text-right py-1">Price</th><th className="text-right py-1">Total</th></tr></thead>
                    <tbody>
                      {viewDetail.line_items.map((l, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1">{l.item_name}</td>
                          <td className="text-right py-1">{l.quantity}</td>
                          <td className="text-right py-1">NPR {Number(l.unit_price).toLocaleString()}</td>
                          <td className="text-right py-1 font-medium">NPR {Number(l.line_total).toLocaleString()}</td>
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

      {/* ── CANCEL DIALOG ── */}
      <Dialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" /> Cancel Invoice {cancelTarget?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <p className="font-semibold">This action will:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                {cancelTarget?.status === 'Posted' && <li>Reverse all stock deductions (restore inventory)</li>}
                <li>Mark the invoice as Cancelled (number is skipped — not reused)</li>
                <li>This action cannot be undone</li>
              </ul>
            </div>
            <div>
              <Label>Cancellation Reason *</Label>
              <Input
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Enter reason for cancellation..."
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Back</Button>
            <Button variant="destructive" disabled={cancelling || !cancelReason.trim()} onClick={handleConfirmCancel}>
              {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── REJECT DIALOG ── */}
      <Dialog open={!!rejectTarget} onOpenChange={() => setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <Ban className="w-5 h-5" /> Reject Invoice Number {rejectTarget?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-700">
              <p className="font-semibold">Rejecting a Draft invoice:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>No stock or financial transactions are reversed (draft has none)</li>
                <li>The invoice number is voided and <strong>will not be reused</strong></li>
                <li>Reason is recorded for audit trail</li>
              </ul>
            </div>
            <div>
              <Label>Rejection Reason *</Label>
              <Input
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejecting this number..."
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Back</Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white" disabled={rejecting || !rejectReason.trim()} onClick={handleConfirmReject}>
              {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DUPLICATE WARNING DIALOG (Manual mode, Warn) ── */}
      <Dialog open={dupWarning} onOpenChange={() => { setDupWarning(false); setPendingPostStatus(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="w-5 h-5" /> Duplicate Invoice Number
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            Invoice number <span className="font-mono font-semibold text-foreground">"{form.invoice_number}"</span> already exists in the system. Do you want to proceed anyway?
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDupWarning(false); setPendingPostStatus(null); }}>Go Back</Button>
            <Button className="bg-yellow-600 hover:bg-yellow-700 text-white" onClick={() => handleSave(pendingPostStatus)}>
              Proceed Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}