import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Eye, XCircle, Pencil, CheckCircle2, RotateCcw } from 'lucide-react';
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
import { postPurchaseInvoice, loadItemsMap, loadSettings } from '@/lib/glPostingService';
import { computeTotalTax } from '@/lib/taxService';
import { useSajiloSync } from '@/hooks/useSajiloSync';
import SearchableSelect from '@/components/shared/SearchableSelect';
import QuickPartnerCreate from '@/components/shared/QuickPartnerCreate';
import CommunicationModal from '@/components/shared/CommunicationModal';
import { Mail } from 'lucide-react';
import VoucherLink from '@/components/shared/VoucherLink';

const emptyPI = {
  invoice_number: '', vendor_invoice_no: '', po_reference_id: '',
  po_reference_number: '', vendor_id: '', vendor_name: '',
  invoice_date: format(new Date(), 'yyyy-MM-dd'),
  due_date: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
  payment_mode: 'Credit', cash_bank_account_id: '', cash_bank_account_name: '',
  status: 'Draft', payment_status: 'Unpaid',
  subtotal: 0, vat_amount: 0, landed_cost_total: 0, grand_total: 0,
  notes: '', line_items: []
};

export default function PurchaseInvoices() {
  

  const [invoices, setInvoices] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [approvedPOs, setApprovedPOs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [taxTypes, setTaxTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showVendorCreate, setShowVendorCreate] = useState(false);
  const [viewDetail, setViewDetail] = useState(null);
  const [form, setForm] = useState(emptyPI);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  const [showCommModal, setShowCommModal] = useState(false);

  // Cancel dialog state
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const loadData = () => {
    Promise.all([
      sajilo.entities.PurchaseInvoice.list('-created_date'),
      sajilo.entities.BusinessPartner.filter({ is_active: true }),
      sajilo.entities.PurchaseOrder.filter({ status: 'Approved' }),
      sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 500)
    ]).then(([inv, vs, pos, accs]) => {
      setInvoices(inv);
      // Purchase module: show vendors + customers flagged as treated_as_vendor
      setVendors(vs.filter(v => v.is_vendor || v.treated_as_vendor));
      setApprovedPOs(pos);
      setAccounts(accs);
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
      if (!viewDetail || viewDetail.invoice_number !== viewId) {
        sajilo.entities.PurchaseInvoice.filter({ invoice_number: viewId }).then(res => {
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


  useSajiloSync(['BusinessPartner', 'PurchaseOrder'], loadData);

  const fetchInvoices = async () => {
    const data = await sajilo.entities.PurchaseInvoice.list('-created_date');
    setInvoices(data);
  };

  const generateInvoiceNumber = () => {
    const year = new Date().getFullYear();
    const seq = String(invoices.length + 1).padStart(3, '0');
    return `PI-${year}-${seq}`;
  };

  const openNew = () => {
    setForm({ ...emptyPI, invoice_number: generateInvoiceNumber() });
    setShowForm(true);
  };

  const openEdit = (row) => {
    setForm({ ...emptyPI, ...row });
    setShowForm(true);
  };

  const fetchFromPO = (poId) => {
    const po = approvedPOs.find(p => p.id === poId);
    if (po) {
      setForm(f => ({
        ...f,
        po_reference_id: po.id,
        po_reference_number: po.po_number,
        vendor_id: po.vendor_id,
        vendor_name: po.vendor_name,
        line_items: po.line_items || [],
        subtotal: po.subtotal,
        vat_amount: po.vat_amount,
        grand_total: po.total_amount,
      }));
      toast.success('Data fetched from PO');
    }
  };

  const handleLineChange = (lines) => {
    const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);
    const { totalTaxAmount: vatAmount } = computeTotalTax(lines, taxTypes);
    setForm(f => ({
      ...f, line_items: lines, subtotal,
      vat_amount: vatAmount,
      grand_total: subtotal + vatAmount + (f.landed_cost_total || 0)
    }));
  };

  const handleSave = async (postStatus = 'Draft') => {
    if (form.payment_mode === 'Credit' && !form.vendor_name) { toast.error('Select a vendor'); return; }
    if (['Cash', 'Bank'].includes(form.payment_mode) && !form.cash_bank_account_id) { toast.error('Select a Cash/Bank ledger account'); return; }
    if (!form.grand_total || form.grand_total <= 0) { toast.error('Total amount cannot be empty or zero'); return; }
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
        const isReversal = oldInv && oldInv.status === 'Posted';

        await sajilo.entities.PurchaseInvoice.update(form.id, payload);

        if (postStatus === 'Posted') {
          try {
            const [itemsMap, glSettings] = await Promise.all([loadItemsMap(form.line_items.map(l => l.item_id)), loadSettings()]);
            const idempotencyKey = crypto.randomUUID();
            await postPurchaseInvoice({ ...data, id: form.id }, itemsMap, glSettings, isReversal, idempotencyKey);
            toast.success('Invoice updated and posted — stock, WAC & GL updated');
          } catch (postErr) {
            await sajilo.entities.PurchaseInvoice.update(form.id, { status: 'Draft' });
            throw postErr;
          }
        } else {
          toast.success('Invoice updated as draft');
        }
      } else {
        const created = await sajilo.entities.PurchaseInvoice.create(payload);

        if (postStatus === 'Posted') {
          try {
            const [itemsMap, glSettings] = await Promise.all([loadItemsMap(form.line_items.map(l => l.item_id)), loadSettings()]);
            const idempotencyKey = crypto.randomUUID();
            await postPurchaseInvoice({ ...data, id: created.id }, itemsMap, glSettings, false, idempotencyKey);
            toast.success('Invoice posted — stock, WAC & GL updated');
          } catch (postErr) {
            await sajilo.entities.PurchaseInvoice.update(created.id, { status: 'Draft' });
            throw postErr;
          }
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

  const togglePaymentStatus = async (inv) => {
    const newStatus = inv.payment_status === 'Paid' ? 'Unpaid' : 'Paid';
    await sajilo.entities.PurchaseInvoice.update(inv.id, { payment_status: newStatus });
    toast.success(`Invoice marked as ${newStatus}`);
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
            const restoredQty = (item.quantity_on_hand || 0) - (line.quantity || 0);
            await sajilo.entities.Item.update(item.id, { quantity_on_hand: Math.max(0, restoredQty) });
          }
        }
      }
    }

    await sajilo.entities.PurchaseInvoice.update(inv.id, {
      status: 'Cancelled',
      payment_status: 'Unpaid',
      notes: (inv.notes ? inv.notes + '\n' : '') + `Cancelled: ${cancelReason}`,
    });

    // GL Reversal
    if (inv.status === 'Posted') {
      const [itemsMap, glSettings] = await Promise.all([loadItemsMap((inv.line_items || []).map(l => l.item_id)), loadSettings()]);
      await postPurchaseInvoice(inv, itemsMap, glSettings, true);
    }
    toast.success('Purchase Invoice cancelled — all transactions reversed & GL updated');
    setCancelling(false);
    setCancelTarget(null);
    setCancelReason('');
    fetchInvoices();
  };

  const filtered = filterStatus === 'all' ? invoices : invoices.filter(i =>
    filterStatus === 'Unpaid' ? i.payment_status === 'Unpaid' && i.status === 'Posted'
    : filterStatus === 'Paid' ? i.payment_status === 'Paid' && i.status === 'Posted'
    : i.status === filterStatus
  );

  const columns = [
    { key: 'invoice_number', label: 'Invoice #', render: (val, row) => (
      <VoucherLink voucherNumber={val}>
        <span className={`cursor-pointer font-mono font-semibold ${row.status === 'Cancelled' ? 'line-through text-muted-foreground' : 'text-primary'}`}>{val}</span>
      </VoucherLink>
    )},
    { key: 'vendor_name', label: 'Vendor', render: (val, row) => {
      let displayName = val;
      if (!displayName && row.notes) {
        const match = row.notes.match(/Payment Mode: (?:Cash|Bank) \((.+?)\)/);
        if (match) displayName = match[1];
      }
      return <span className={row.status === 'Cancelled' ? 'text-muted-foreground' : ''}>{displayName || '—'}</span>;
    }},
    { key: 'vendor_invoice_no', label: "Vendor's Ref" },
    { key: 'invoice_date', label: 'Date', isDate: true },
    { key: 'grand_total', label: 'Total', render: (val, row) => (
      <span className={`font-semibold ${row.status === 'Cancelled' ? 'line-through text-muted-foreground' : ''}`}>NPR {Number(val).toLocaleString()}</span>
    )},
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
    { key: 'payment_status', label: 'Payment', render: (val, row) => (
      row.status === 'Cancelled' ? <span className="text-xs text-muted-foreground">—</span> : <StatusBadge status={val} />
    )},
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" title="View" onClick={() => setViewDetail(row)}>
            <Eye className="w-4 h-4" />
          </Button>
          {row.status === 'Posted' && (
            <Button variant="ghost" size="icon" className={row.payment_status === 'Paid' ? 'text-amber-500' : 'text-emerald-500'} title={`Mark as ${row.payment_status === 'Paid' ? 'Unpaid' : 'Paid'}`} onClick={() => togglePaymentStatus(row)}>
              {row.payment_status === 'Paid' ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
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
        </div>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Purchase Invoices"
        subtitle="Record supplier bills and manage accounts payable"
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
          { key: 'Paid', label: 'Paid' },
          { key: 'Cancelled', label: 'Cancelled' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === f.key ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} searchKey="vendor_name" loading={loading} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit Purchase Invoice' : 'New Purchase Invoice'} — {form.invoice_number}</DialogTitle>
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
                    onClick={() => setForm(f => ({ ...f, payment_mode: mode, cash_bank_account_id: '', cash_bank_account_name: '', vendor_id: '', vendor_name: '' }))}
                    className="flex-1"
                  >
                    {mode}
                  </Button>
                ))}
              </div>
            </div>
            
            {form.payment_mode === 'Credit' ? (
              <div>
                <Label>Vendor *</Label>
                <SearchableSelect
                  options={vendors.map(v => ({ value: v.id, label: v.name }))}
                  value={form.vendor_id}
                  onChange={v => {
                    const vendor = vendors.find(vn => vn.id === v);
                    setForm(f => ({ ...f, vendor_id: v, vendor_name: vendor?.name || '' }));
                  }}
                  placeholder="Select vendor"
                  className="mt-1"
                  onCreateNew={() => setShowVendorCreate(true)}
                  createNewText="New Vendor"
                />
              </div>
            ) : (
              <>
                <div>
                  <Label>{form.payment_mode} Account (Ledger) *</Label>
                  <SearchableSelect
                    options={accounts
                      .filter(a => a.ledger_type === 'Sub Ledger' && (form.payment_mode === 'Cash' ? a.account_name.toLowerCase().includes('cash') : (a.parent_account_name?.toLowerCase().includes('bank') || a.account_name.toLowerCase().includes('bank'))))
                      .map(a => ({ value: a.id, label: a.account_name }))}
                    value={form.cash_bank_account_id}
                    onChange={v => {
                      const acc = accounts.find(x => x.id === v);
                      setForm(f => ({ ...f, cash_bank_account_id: v, cash_bank_account_name: acc?.account_name || '' }));
                    }}
                    placeholder={`Select ${form.payment_mode} account`}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Vendor Name (Optional)</Label>
                  <Input 
                    value={form.vendor_name} 
                    onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))} 
                    placeholder="Walk-in Vendor" 
                    className="mt-1" 
                  />
                </div>
              </>
            )}
            <div>
              <Label>Fetch from Approved PO</Label>
              <Select onValueChange={fetchFromPO}>
                <SelectTrigger className="mt-1 border-dashed border-primary/50 text-primary">
                  <SelectValue placeholder="📋 Fetch from PO..." />
                </SelectTrigger>
                <SelectContent>
                  {approvedPOs.map(po => (
                    <SelectItem key={po.id} value={po.id}>{po.po_number} — {po.vendor_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vendor's Invoice No.</Label>
              <Input value={form.vendor_invoice_no} onChange={e => setForm(f => ({...f, vendor_invoice_no: e.target.value}))} placeholder="Supplier reference" className="mt-1" />
            </div>
            <div>
              <DateInput label="Invoice Date" value={form.invoice_date} onChange={v => setForm(f => ({...f, invoice_date: v}))} className="mt-1" />
            </div>
            <div>
              <DateInput label="Due Date" value={form.due_date} onChange={v => setForm(f => ({...f, due_date: v}))} className="mt-1" />
            </div>
            <div>
              <Label>Landed Cost (NPR)</Label>
              <Input type="number" value={form.landed_cost_total} onChange={e => {
                const lc = Number(e.target.value);
                setForm(f => ({ ...f, landed_cost_total: lc, grand_total: f.subtotal + f.vat_amount + lc }));
              }} className="mt-1" />
            </div>
          </div>

          <div className="mt-6">
            <Label className="text-base font-semibold mb-3 block">Line Items</Label>
            <LineItemsEditor value={form.line_items} onChange={handleLineChange} />
          </div>

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="outline" onClick={() => handleSave('Draft')} disabled={saving}>Save Draft</Button>
            <Button onClick={() => handleSave('Posted')} disabled={saving}>
              {saving ? 'Posting...' : 'Post Invoice (Update Stock)'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── VIEW DETAIL ── */}
      <Dialog open={!!viewDetail} onOpenChange={closeViewDetail}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                Purchase Invoice {viewDetail?.invoice_number}
                <StatusBadge status={viewDetail?.status} />
              </div>
              {viewDetail && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowCommModal(true)}>
                    <Mail className="w-3.5 h-3.5 mr-1.5" /> Email Invoice
                  </Button>
                  <span className="text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded border border-blue-200 dark:border-blue-800">
                    View Mode
                  </span>
                </div>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewDetail && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Vendor:</span> <span className="font-medium">{viewDetail.vendor_name}</span></div>
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{viewDetail.invoice_date}</span></div>
                <div><span className="text-muted-foreground">Created:</span> <span className="font-medium">{viewDetail.created_at ? new Date(viewDetail.created_at).toLocaleString() : '-'}</span></div>
                <div><span className="text-muted-foreground">Due Date:</span> <span className="font-medium">{viewDetail.due_date}</span></div>
                <div><span className="text-muted-foreground">Payment:</span> <StatusBadge status={viewDetail.payment_status} /></div>
                <div><span className="text-muted-foreground">Subtotal:</span> <span className="font-medium">NPR {Number(viewDetail.subtotal).toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">VAT:</span> <span className="font-medium">NPR {Number(viewDetail.vat_amount).toLocaleString()}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Grand Total:</span> <span className="font-bold text-primary text-base"> NPR {Number(viewDetail.grand_total).toLocaleString()}</span></div>
              </div>
              {viewDetail.notes && <p className="text-sm text-muted-foreground border-t pt-3">{viewDetail.notes}</p>}
              {viewDetail.status === 'Cancelled' && (
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-1"><XCircle className="w-4 h-4" /> Cancelled</p>
                  <p className="text-xs text-red-400 mt-1">Date: {viewDetail.cancelled_date}</p>
                </div>
              )}
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

      <CommunicationModal 
        open={showCommModal} 
        onOpenChange={setShowCommModal}
        module="PurchaseInvoice"
        referenceId={viewDetail?.id}
        partnerId={viewDetail?.vendor_id}
        companyId={sajilo.getCompanyId()}
        payload={viewDetail || {}}
      />

      {/* ── CANCEL DIALOG ── */}
      <Dialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="w-5 h-5" /> Cancel Purchase Invoice {cancelTarget?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
              <p className="font-semibold">This action will:</p>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                {cancelTarget?.status === 'Posted' && <li>Reverse all stock additions (deduct inventory)</li>}
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
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Back</Button>
            <Button variant="destructive" disabled={cancelling || !cancelReason.trim()} onClick={handleConfirmCancel}>
              {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <QuickPartnerCreate
        open={showVendorCreate}
        onOpenChange={setShowVendorCreate}
        type="vendor"
        onCreated={(vendor) => {
          setVendors(prev => [...prev, vendor]);
          setForm(f => ({ ...f, vendor_id: vendor.id, vendor_name: vendor.name }));
        }}
      />
    </div>
  );
}