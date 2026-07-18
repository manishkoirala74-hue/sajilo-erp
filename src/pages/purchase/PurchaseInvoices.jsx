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
import DualDateDisplay from '@/components/shared/DualDateDisplay';
import { checkoutPurchaseInvoice, cancelPurchaseInvoice, loadItemsMap, loadSettings } from '@/lib/glPostingService';
import { computeTotalTax, loadActiveTaxTypes } from '@/lib/taxService';
import { useSajiloSync } from '@/hooks/useSajiloSync';
import { usePermissions, useAuth } from '@/lib/AuthContext';
import SearchableSelect from '@/components/shared/SearchableSelect';
import { Mail } from 'lucide-react';
import VoucherLink from '@/components/shared/VoucherLink';
import { generateVectorPDF } from '@/utils/pdfGenerator';
import FileUpload from '@/components/shared/FileUpload';

const emptyPI = {
  invoice_number: '', vendor_invoice_no: '', po_reference_id: '', godown_id: '',
  po_reference_number: '', vendor_id: '', vendor_name: '',
  invoice_date: format(new Date(), 'yyyy-MM-dd'),
  due_date: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
  payment_mode: 'Credit', cash_bank_account_id: '', cash_bank_account_name: '',
  status: 'Draft', payment_status: 'Unpaid',
  subtotal: 0, vat_amount: 0, landed_cost_total: 0, grand_total: 0,
  notes: '', line_items: []
};

export default function PurchaseInvoices() {
  const { hasAccess } = usePermissions();
  const { activeCompany, mainGodownId, activeGodowns, activeFiscalYear } = useAuth();
  
  const [invoices, setInvoices] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [approvedPOs, setApprovedPOs] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [taxTypes, setTaxTypes] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewDetail, setViewDetail] = useState(null);
  const [form, setForm] = useState(emptyPI);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  // Cancel dialog state
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const loadData = () => {
    Promise.all([
      sajilo.entities.PurchaseInvoice.list('-created_date', 1000),
      sajilo.entities.BusinessPartner.filter({ is_active: true }),
      sajilo.entities.PurchaseOrder.filter({ status: 'Approved' }),
      sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 500),
      sajilo.entities.Godown.filter({ status: 'Active' }),
      sajilo.entities.CompanySettings.list(),
      loadActiveTaxTypes()
    ]).then(([inv, vs, pos, accs, gds, sett, txTypes]) => {
      setInvoices(inv);
      // Purchase module: show vendors + customers flagged as treated_as_vendor
      setVendors(vs.filter(v => v.is_vendor || v.treated_as_vendor));
      setApprovedPOs(pos);
      setAccounts(accs);
      setGodowns(gds || []);
      setSettings(sett?.length > 0 ? sett[0] : {});
      setTaxTypes(txTypes || []);
      setLoading(false);
    }).catch(err => {
      console.error(err);
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
    const data = await sajilo.entities.PurchaseInvoice.list('-created_date', 1000);
    setInvoices(data);
  };

  const generateInvoiceNumber = () => {
    const year = new Date().getFullYear();
    const seq = String(invoices.length + 1).padStart(3, '0');
    return `PI-${year}-${seq}`;
  };

  const getSafeDefaultDate = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (activeFiscalYear) {
      if (today > activeFiscalYear.end_date) return activeFiscalYear.end_date;
      if (today < activeFiscalYear.start_date) return activeFiscalYear.start_date;
    }
    return today;
  };

  const openNew = (isAuto = true) => {
    const invNumber = isAuto ? generateInvoiceNumber() : '';
    const safeDate = getSafeDefaultDate();
    
    setForm({ 
      ...emptyPI, 
      id: crypto.randomUUID(), 
      invoice_number: invNumber, 
      godown_id: mainGodownId || '', 
      invoice_date: safeDate,
      due_date: format(new Date(new Date(safeDate).getTime() + 30 * 86400000), 'yyyy-MM-dd'),
      _isNew: true 
    });
    setShowForm(true);
  };

  const openEdit = (row) => {
    setForm({ ...emptyPI, ...row, _isNew: false });
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
    if (form.payment_mode === 'Credit' && !form.vendor_id) { toast.error('Select a vendor'); return; }
    if (['Cash', 'Bank'].includes(form.payment_mode) && !form.cash_bank_account_id) { toast.error('Select a Cash/Bank ledger account'); return; }
    if (!form.grand_total || form.grand_total <= 0) { toast.error('Total amount cannot be empty or zero'); return; }
    if (settings?.enable_godown_management && !form.godown_id) { toast.error('Godown / Location is required'); return; }
    if (form.line_items.length === 0) { toast.error('Add at least one item'); return; }
    setSaving(true);
    try {
      const isCashOrBank = ['Cash', 'Bank'].includes(form.payment_mode);
      const data = { 
        ...form, 
        status: postStatus,
        payment_status: isCashOrBank ? 'Paid' : form.payment_status 
      };

      // Ensure cash_bank_account_id is strictly null if it's Credit
      if (!isCashOrBank) {
        data.cash_bank_account_id = null;
        data.cash_bank_account_name = null;
      }

      if (data.notes) {
        data.notes = data.notes.replace(/Payment Mode: (?:Cash|Bank) \([^\)]+\)\n?/g, '').trim();
      }
      
      if (isCashOrBank && data.cash_bank_account_name) {
        data.notes = (data.notes ? data.notes + '\n' : '') + `Payment Mode: ${form.payment_mode} (${data.cash_bank_account_name})`;
      }

      let payload = { ...data };
      delete payload.payment_mode;
      delete payload.cash_bank_account_id;
      delete payload.cash_bank_account_name;
      delete payload._isNew;

      let docId = form.id;

      if (postStatus === 'Posted') {
        const idempotencyKey = crypto.randomUUID();
        const [itemsMap, glSettings] = await Promise.all([loadItemsMap(form.line_items.map(l => l.item_id)), loadSettings()]);
        
        const result = await checkoutPurchaseInvoice({ ...data, id: form.id }, itemsMap, glSettings, idempotencyKey);
        docId = result.invoice_id || form.id;
        toast.success('Invoice posted — stock, WAC & GL updated');
      } else {
        // Standard Draft upsert
        if (!form._isNew && invoices.find(i => i.id === form.id)) {
          await sajilo.entities.PurchaseInvoice.update(form.id, payload);
          toast.success('Invoice updated as draft');
        } else {
          const created = await sajilo.entities.PurchaseInvoice.create({ ...payload, id: form.id });
          docId = created.id;
          toast.success('Invoice saved as draft');
        }
      }

      // Native Vector PDF cache generation
      try {
        const fullDocId = docId || form.id;
        const fullDoc = { ...data, id: fullDocId, purchase_number: form.invoice_number || data.invoice_number };
        const partner = vendors.find(v => v.id === form.vendor_id);
        
        await generateVectorPDF(
          fullDoc,
          'PurchaseInvoice',
          settings,
          partner,
          sajilo.getCompanyId()
        );
      } catch (pdfErr) {
        console.error('Vector PDF Gen error:', pdfErr);
      }

      setShowForm(false);
      fetchInvoices();
    } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
      return; // Do not close the form if there's an error
    } finally {
      setSaving(false);
    }
  };

  const togglePaymentStatus = async (inv) => {
    const newStatus = inv.payment_status === 'Paid' ? 'Unpaid' : 'Paid';
    await sajilo.entities.PurchaseInvoice.update(inv.id, { payment_status: newStatus });
    toast.success(`Invoice marked as ${newStatus}`);
    fetchInvoices();
  };

  // ── CANCEL (Atomic cancellation via PostgreSQL RPC) ──
  const handleConfirmCancel = async () => {
    if (!cancelReason.trim()) { toast.error('Please provide a cancellation reason'); return; }
    setCancelling(true);
    const inv = cancelTarget;

    try {
      await cancelPurchaseInvoice(inv.id, cancelReason);
      
      // Instantly update local React state to reflect the cancelled status without refreshing
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'Cancelled', payment_status: 'Unpaid', notes: (i.notes ? i.notes + '\n' : '') + `Cancelled: ${cancelReason}`, cancelled_date: format(new Date(), 'yyyy-MM-dd') } : i));
      
      toast.success('Purchase Invoice cancelled — all transactions reversed & GL updated');
      setCancelTarget(null);
      setCancelReason('');
    } catch (err) {
      // Error handled by cancelPurchaseInvoice service
    } finally {
      setCancelling(false);
    }
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

  const isMissingGL = settings && (!settings.gl_accounts_payable_id);

  return (
    <div>
      {isMissingGL && (
        <div className="mb-4 bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold">Action Required: Missing Global Configuration</h4>
            <p className="text-sm mt-1">Default Accounts Payable GL mapping is missing. Please configure it in Company Settings before generating invoices.</p>
          </div>
        </div>
      )}

      <PageHeader
        title="Purchase Invoices"
        subtitle="Manage supplier bills, track payables, and record incoming inventory"
        action={!isMissingGL ? openNew : undefined}
        actionLabel="New Invoice"
        actionIcon={Plus}
        actionDisabled={!activeFiscalYear || isMissingGL}
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
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4 pb-24">
            {/* LEFT COLUMN */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-card rounded-2xl border border-stone-200 p-5 shadow-sm">
                <h3 className="font-semibold text-lg text-foreground mb-4">Vendor & invoice context</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                  <div className="col-span-2">
                    <Label>Payment Mode</Label>
                    <div className="flex gap-2 mt-1">
                      {['Credit', 'Cash', 'Bank'].map(mode => (
                        <Button 
                          key={mode} 
                          type="button"
                          variant={form.payment_mode === mode ? 'default' : 'outline'}
                          onClick={() => setForm(f => ({ ...f, payment_mode: mode, cash_bank_account_id: '', cash_bank_account_name: '', vendor_id: '', vendor_name: '' }))}
                          className="flex-1 rounded-xl"
                        >
                          {mode}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  {form.payment_mode === 'Credit' ? (
                    <div className="col-span-2">
                      <Label>Vendor *</Label>
                      <SearchableSelect
                        options={vendors.map(v => ({ value: v.id, label: v.name }))}
                        value={form.vendor_id}
                        onChange={v => {
                          const vnd = vendors.find(x => x.id === v);
                          setForm(f => ({ ...f, vendor_id: v, vendor_name: vnd?.name || '' }));
                        }}
                        placeholder="Select vendor"
                        className="mt-1"
                        onCreateNew={() => window.open('/purchase/vendors/new', '_blank')}
                        createNewText="New Vendor"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="col-span-2 md:col-span-1">
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
                      <div className="col-span-2 md:col-span-1">
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
                      <SelectTrigger className="mt-1 border-dashed border-primary/50 text-primary rounded-xl">
                        <SelectValue placeholder="📋 Fetch from PO..." />
                      </SelectTrigger>
                      <SelectContent>
                        {approvedPOs.map(po => (
                          <SelectItem key={po.id} value={po.id}>{po.po_number} — {po.vendor_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {settings?.enable_godown_management && (
                    <div>
                      <Label>Godown / Location *</Label>
                      <SearchableSelect
                        options={(godowns || []).map(g => ({ value: g.id, label: g.name || g.godown_name }))}
                        value={form.godown_id}
                        onChange={v => setForm(f => ({ ...f, godown_id: v }))}
                        placeholder="Select Godown"
                        className="mt-1"
                      />
                    </div>
                  )}
                  <div>
                    <Label>Vendor's Invoice No.</Label>
                    <Input value={form.vendor_invoice_no} onChange={e => setForm(f => ({...f, vendor_invoice_no: e.target.value}))} placeholder="Supplier reference" className="mt-1" />
                  </div>
                  <div>
                    <DateInput label="Invoice Date" value={form.invoice_date} onChange={v => setForm(f => ({...f, invoice_date: v}))} className="mt-1" min={activeFiscalYear?.start_date} max={activeFiscalYear?.end_date} />
                  </div>
                  <div>
                    <DateInput label="Due Date" value={form.due_date} onChange={v => setForm(f => ({...f, due_date: v}))} className="mt-1" />
                  </div>
                  {settings?.enable_landed_costs && (
                    <div>
                      <Label>Landed Cost (NPR)</Label>
                      <Input type="number" value={form.landed_cost_total} onChange={e => {
                        const lc = Number(e.target.value);
                        setForm(f => ({ ...f, landed_cost_total: lc, grand_total: (f.subtotal || 0) + (f.vat_amount || 0) + lc }));
                      }} className="mt-1" />
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-card rounded-2xl border border-stone-200 p-5 shadow-sm">
                <h3 className="font-semibold text-lg text-foreground mb-4">Line Items</h3>
                <LineItemsEditor value={form.line_items} onChange={handleLineChange} taxTypes={taxTypes} hideTotals={true} />
              </div>
              
              <div className="bg-card rounded-2xl border border-stone-200 p-5 shadow-sm">
                <h3 className="font-semibold text-lg text-foreground mb-4">Attachments</h3>
                <FileUpload 
                  companyId={sajilo.getCompanyId()} 
                  moduleName="PurchaseInvoice" 
                  recordId={form.id} 
                />
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="lg:col-span-1">
              <div className="bg-card rounded-2xl border border-stone-200 p-6 sticky top-4 shadow-sm">
                <h3 className="font-semibold text-lg text-foreground mb-5">Invoice totals</h3>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-medium">Subtotal</span>
                    <span className="font-semibold">NPR {(form.subtotal || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-medium">VAT Amount</span>
                    <span className="font-semibold">NPR {(form.vat_amount || 0).toLocaleString()}</span>
                  </div>
                  {settings?.enable_landed_costs && form.landed_cost_total > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-medium">Landed Cost</span>
                      <span className="font-semibold text-orange-600">NPR {(form.landed_cost_total || 0).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-xl font-bold border-t border-stone-100 pt-4 mt-4">
                    <span className="text-foreground">Invoice Total</span>
                    <span className="text-foreground">NPR {(form.grand_total || 0).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 -mx-6 -mb-6 mt-4 bg-stone-50/90 backdrop-blur-md border-t border-stone-200 p-4 flex justify-between items-center z-50 rounded-b-lg">
            <div className="flex flex-col ml-6">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Invoice Total</span>
              <span className="text-xl font-bold text-foreground leading-none mt-1">NPR {(form.grand_total || 0).toLocaleString()}</span>
            </div>
            <div className="flex gap-3 mr-6 items-center">
              <Button type="button" variant="ghost" className="rounded-xl" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
              <Button type="button" variant="outline" className="rounded-xl border-primary text-primary hover:bg-primary/10" onClick={(e) => {
                e.preventDefault();
                handleSave('Draft');
              }} disabled={saving}>Save Draft</Button>
              <Button type="button" className="rounded-xl font-bold shadow-sm px-6" onClick={(e) => {
                e.preventDefault();
                handleSave('Posted');
              }} disabled={saving}>
                {saving ? 'Saving...' : '✓ Save'}
              </Button>
            </div>
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
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => navigate(`/email/compose?module=PurchaseInvoice&id=${viewDetail.id}`)}>
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
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium"><DualDateDisplay date={viewDetail.invoice_date} /></span></div>
                <div><span className="text-muted-foreground">Created:</span> <span className="font-medium">{viewDetail.created_at ? new Date(viewDetail.created_at).toLocaleString() : '-'}</span></div>
                <div><span className="text-muted-foreground">Due Date:</span> <span className="font-medium"><DualDateDisplay date={viewDetail.due_date} /></span></div>
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
              
              <div className="border-t pt-3">
                <p className="text-sm font-semibold mb-2">Attachments</p>
                <FileUpload 
                  companyId={sajilo.getCompanyId()} 
                  moduleName="PurchaseInvoice" 
                  recordId={viewDetail.id} 
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
    </div>
  );
}