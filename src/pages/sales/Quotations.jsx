import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Printer, Copy, CheckCircle, XCircle, ArrowRight, FileText, Send, Eye, Pencil, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import DateInput from '@/components/shared/DateInput';
import { toast } from 'sonner';
import { format, addDays } from 'date-fns';
import QuotationPrint from '@/components/quotations/QuotationPrint';
import QuotationLineItems from '@/components/quotations/QuotationLineItems';
import { useSajiloSync } from '@/hooks/useSajiloSync';
import { loadActiveTaxTypes, computeTotalTax } from '@/lib/taxService';
import SearchableSelect from '@/components/shared/SearchableSelect';
import QuickPartnerCreate from '@/components/shared/QuickPartnerCreate';
import VoucherLink from '@/components/shared/VoucherLink';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import FileUpload from '@/components/shared/FileUpload';

const STATUS_COLORS = {
  Draft: 'bg-gray-100 text-gray-700',
  Final: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',
  Accepted: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400',
  Rejected: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',
  Expired: 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400',
  Converted: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',
  Cancelled: 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
};

const ALL_STATUSES = ['Draft', 'Final', 'Accepted', 'Rejected', 'Expired', 'Converted', 'Cancelled'];

export default function Quotations() {
  const [quotations, setQuotations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const { activeCompany, activeFiscalYear } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [showCustomerCreate, setShowCustomerCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [printTarget, setPrintTarget] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [taxTypes, setTaxTypes] = useState([]);
  const printRef = useRef();

  const loadData = () => {
    Promise.all([
      sajilo.entities.Quotation.list('-created_date'),
      sajilo.entities.BusinessPartner.filter({ is_customer: true }),
      sajilo.entities.Item.filter({ is_active: true }),
      sajilo.entities.CompanySettings.list(),
      loadActiveTaxTypes(),
    ]).then(([qs, cs, its, ss, txTypes]) => {
      setQuotations(qs);
      setCustomers(cs.filter(c => c.is_active !== false));
      setItems(its);
      setSettings(ss[0] || {});
      setTaxTypes(txTypes || []);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      import("sonner").then(m => m.toast.error(err.message || "Error loading data"));
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
      if (!printTarget || printTarget.quotation_number !== viewId) {
        sajilo.entities.Quotation.filter({ quotation_number: viewId }).then(res => {
          if (res.length > 0) setPrintTarget({ ...res[0], _isViewMode: true });
        });
      }
    } else if (searchParams.get('new') === '1') {
      openNew();
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  const closePrintTarget = () => {
    setPrintTarget(null);
    if (searchParams.get('view')) {
      if (location.state?.from) {
        navigate(location.state.from);
      } else {
        searchParams.delete('view');
        setSearchParams(searchParams, { replace: true });
      }
    }
  };

  useSajiloSync(['BusinessPartner', 'Item', 'CompanySettings'], loadData);

  const fetchQuotations = async () => {
    const data = await sajilo.entities.Quotation.list('-created_date');
    setQuotations(data);
  };

  const generateNumber = () => {
    const prefix = settings?.quotation_prefix || 'QT';
    const suffix = settings?.quotation_suffix || '';
    const year = new Date().getFullYear();
    const next = settings?.quotation_next_number || (quotations.length + 1);
    return `${prefix}-${year}-${String(next).padStart(3, '0')}${suffix}`;
  };

  const getSafeDefaultDate = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (activeFiscalYear) {
      if (today > activeFiscalYear.end_date) return activeFiscalYear.end_date;
      if (today < activeFiscalYear.start_date) return activeFiscalYear.start_date;
    }
    return today;
  };

  const makeEmpty = () => {
    const today = getSafeDefaultDate();
    const validDays = settings?.quotation_validity_days || 30;
    return {
      id: crypto.randomUUID(),
      quotation_number: generateNumber(),
      customer_id: '', customer_name: '', customer_email: '', customer_phone: '', customer_address: '',
      quotation_date: today,
      valid_until: format(addDays(new Date(), validDays), 'yyyy-MM-dd'),
      status: 'Draft',
      goods_subtotal: 0, discount_amount: 0, total_tax_amount: 0, grand_total: 0,
      notes: settings?.quotation_default_notes || '',
      terms_and_conditions: settings?.quotation_default_terms || '',
      internal_notes: '',
      line_items: [],
    };
  };

  const openNew = () => { setEditing(null); setForm(makeEmpty()); setShowForm(true); };
  const openEdit = (q) => { setEditing(q); setForm({ ...q }); setShowForm(true); };
  const openPrint = (q) => setPrintTarget(q);

  const sf = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleLineChange = (lines) => {
    const subtotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);
    const { totalTaxAmount: tax } = computeTotalTax(lines, taxTypes);
    setForm(prev => ({
      ...prev, line_items: lines, goods_subtotal: subtotal,
      total_tax_amount: tax, grand_total: subtotal + tax - (prev.discount_amount || 0),
    }));
  };

  const handleCustomerSelect = (id) => {
    const c = customers.find(c => c.id === id);
    setForm(prev => ({
      ...prev,
      customer_id: id,
      customer_name: c?.name || '',
      customer_email: c?.email || '',
      customer_phone: c?.phone || '',
      customer_address: c?.address || '',
    }));
  };

  const handleSave = async () => {
    if (!form.customer_name) { toast.error('Select a customer'); return; }
    setSaving(true);
    try {
  if (editing) {
        await sajilo.entities.Quotation.update(editing.id, form);
        toast.success('Quotation updated');
      } else {
        await sajilo.entities.Quotation.create(form);
        // Bump the next number in settings
        if (settings?.id) {
          const next = (settings.quotation_next_number || 1) + 1;
          await sajilo.entities.CompanySettings.update(settings.id, { quotation_next_number: next });
          setSettings(s => ({ ...s, quotation_next_number: next }));
        }
        toast.success('Quotation created');
      }
        } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
    setShowForm(false);
    fetchQuotations();
  };

  const updateStatus = async (q, status) => {
    await sajilo.entities.Quotation.update(q.id, { status });
    toast.success(`Status → ${status}`);
    fetchQuotations();
  };

  const duplicate = async (q) => {
    const copy = { ...q, id: undefined, quotation_number: generateNumber(), status: 'Draft', quotation_date: format(new Date(), 'yyyy-MM-dd') };
    delete copy.id;
    await sajilo.entities.Quotation.create(copy);
    toast.success('Quotation duplicated');
    fetchQuotations();
  };

  const convertToOrder = async (q) => {
    const order = {
      order_number: `SO-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`,
      customer_id: q.customer_id,
      customer_name: q.customer_name,
      order_date: format(new Date(), 'yyyy-MM-dd'),
      fulfillment_status: 'Confirmed',
      subtotal: q.goods_subtotal,
      vat_amount: q.total_tax_amount,
      total_amount: q.grand_total,
      notes: q.notes,
      line_items: q.line_items,
    };
    const so = await sajilo.entities.SalesOrder.create(order);
    await sajilo.entities.Quotation.update(q.id, { status: 'Converted', converted_to_order_id: so.id });
    toast.success('Converted to Sales Order');
    fetchQuotations();
  };

  const filtered = filterStatus === 'all' ? quotations : quotations.filter(q => q.status === filterStatus);

  
  const columns = [
    { key: 'quotation_number', label: 'Quotation #', render: (val, row) => (
      <VoucherLink voucherNumber={val}>
        <span className={`cursor-pointer font-mono font-semibold ${row.status === 'Cancelled' || row.status === 'Rejected' ? 'text-muted-foreground line-through' : 'text-primary'}`}>{val}</span>
      </VoucherLink>
    )},
    { key: 'customer_name', label: 'Customer', render: (val, row) => (
      <div className={row.status === 'Cancelled' || row.status === 'Rejected' ? 'text-muted-foreground' : ''}>
        <p className="font-medium">{val}</p>
        {row.customer_email && <p className="text-xs opacity-70">{row.customer_email}</p>}
      </div>
    )},
    { key: 'quotation_date', label: 'Date', isDate: true },
    { key: 'valid_until', label: 'Valid Until', render: (val, row) => (
      val ? (
        <span className={new Date(val) < new Date() && row.status === 'Final' ? 'text-red-500 font-medium' : 'text-muted-foreground'}>
          {val}
        </span>
      ) : '—'
    )},
    { key: 'grand_total', label: 'Total', render: (val, row) => (
      <span className={`font-semibold ${row.status === 'Cancelled' || row.status === 'Rejected' ? 'line-through text-muted-foreground' : ''}`}>NPR {Number(val).toLocaleString()}</span>
    )},
    { key: 'status', label: 'Status', render: (val) => <StatusBadge status={val} /> },
    {
      key: 'actions', label: 'Actions', render: (_, row) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" title="View / Print" onClick={() => openPrint(row)}>
            <Eye className="w-4 h-4" />
          </Button>
          {row.status === 'Draft' && (
            <Button variant="ghost" size="icon" className="text-primary" title="Edit Quotation" onClick={() => openEdit(row)}>
              <Pencil className="w-4 h-4" />
            </Button>
          )}
          {row.status === 'Draft' && (
            <Button variant="ghost" size="icon" className="text-blue-500" title="Mark as Final" onClick={() => updateStatus(row, 'Final')}>
              <Send className="w-4 h-4" />
            </Button>
          )}
          {row.status === 'Final' && (
            <Button variant="ghost" size="icon" className="text-green-500" title="Accept" onClick={() => updateStatus(row, 'Accepted')}>
              <CheckCircle className="w-4 h-4" />
            </Button>
          )}
          {row.status === 'Final' && (
            <Button variant="ghost" size="icon" className="text-red-500" title="Reject" onClick={() => updateStatus(row, 'Rejected')}>
              <Ban className="w-4 h-4" />
            </Button>
          )}
          {row.status === 'Accepted' && (
            <Button variant="ghost" size="icon" className="text-purple-500" title="Convert to Sales Order" onClick={() => convertToOrder(row)}>
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="text-muted-foreground" title="Duplicate" onClick={() => duplicate(row)}>
            <Copy className="w-4 h-4" />
          </Button>
          {(row.status === 'Draft' || row.status === 'Final') && (
            <Button variant="ghost" size="icon" className="text-destructive" title="Cancel Quotation" onClick={() => updateStatus(row, 'Cancelled')}>
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
        title="Quotations"
        subtitle="Prepare and send price quotations to customers"
        action={openNew}
        actionLabel="New Quotation"
        actionIcon={Plus}
        actionDisabled={!activeFiscalYear}
      />

      {/* Status Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: 'all', label: `All (${quotations.length})` },
          ...ALL_STATUSES.map(s => ({ key: s, label: `${s} (${quotations.filter(q => q.status === s).length})` }))
        ].map(f => (
          <button key={f.key} onClick={() => setFilterStatus(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterStatus === f.key ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">{Array(5).fill(0).map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No quotations found</p>
            <Button className="mt-4" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> New Quotation</Button>
          </div>
        ) : (
          <DataTable columns={columns} data={filtered} searchKey="quotation_number" />
        )}
        <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
          {filtered.length} quotation{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit Quotation — ${form.quotation_number}` : `New Quotation — ${form.quotation_number || ''}`}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-2">
            {/* Header */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label>Customer *</Label>
                <SearchableSelect
                  options={customers.map(c => ({ value: c.id, label: c.name }))}
                  value={form.customer_id}
                  onChange={handleCustomerSelect}
                  placeholder="Select customer…"
                  className="mt-1"
                  onCreateNew={() => setShowCustomerCreate(true)}
                  createNewText="New Customer"
                />
              </div>
              <div>
                <Label>Quotation Number</Label>
                <Input value={form.quotation_number || ''} onChange={e => sf('quotation_number', e.target.value)} className="mt-1 font-mono" />
              </div>
              <div>
                    <DateInput label="Quotation Date" value={form.quotation_date} onChange={v => sf('quotation_date', v)} className="mt-1" min={activeFiscalYear?.start_date} max={activeFiscalYear?.end_date} />
              </div>
              <div>
                <DateInput label="Valid Until" value={form.valid_until} onChange={v => sf('valid_until', v)} className="mt-1" min={activeFiscalYear?.start_date} max={activeFiscalYear?.end_date} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status || 'Draft'} onValueChange={v => sf('status', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Customer Details (auto-filled, editable) */}
            {form.customer_name && (
              <div className="grid grid-cols-3 gap-3 bg-muted/30 rounded-xl p-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Customer Email</Label>
                  <Input value={form.customer_email || ''} onChange={e => sf('customer_email', e.target.value)} className="mt-1 h-8 text-sm" placeholder="Optional" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Customer Phone</Label>
                  <Input value={form.customer_phone || ''} onChange={e => sf('customer_phone', e.target.value)} className="mt-1 h-8 text-sm" placeholder="Optional" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Customer Address</Label>
                  <Input value={form.customer_address || ''} onChange={e => sf('customer_address', e.target.value)} className="mt-1 h-8 text-sm" placeholder="Optional" />
                </div>
              </div>
            )}

            {/* Line Items */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 pb-1 border-b border-border">Line Items</p>
              <QuotationLineItems
                value={form.line_items || []}
                onChange={handleLineChange}
                items={items}
                vatRate={settings?.vat_rate || 13}
              />
            </div>

            {/* Totals + Discount */}
            <div className="flex justify-end">
              <div className="w-72 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>NPR {Number(form.goods_subtotal || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Discount (NPR)</span>
                  <Input type="number" min={0} value={form.discount_amount || 0}
                    onChange={e => {
                      const disc = Number(e.target.value);
                      sf('discount_amount', disc);
                      setForm(prev => ({ ...prev, discount_amount: disc, grand_total: (prev.goods_subtotal || 0) + (prev.total_tax_amount || 0) - disc }));
                    }}
                    className="w-32 h-7 text-right text-sm" />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>NPR {Number(form.total_tax_amount || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t border-border pt-2">
                  <span>Grand Total</span>
                  <span className="text-primary">NPR {Number(form.grand_total || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Attachments */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 pb-1 border-b border-border">Attachments</p>
              <FileUpload 
                companyId={sajilo.getCompanyId()} 
                moduleName="Quotation" 
                recordId={form.id} 
              />
            </div>

            {/* Notes & T&C */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Notes (printed on document)</Label>
                <textarea
                  className="w-full mt-1 h-24 border border-input rounded-md px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.notes || ''}
                  onChange={e => sf('notes', e.target.value)}
                  placeholder="Customer-visible notes…"
                />
              </div>
              <div>
                <Label>Terms & Conditions</Label>
                <textarea
                  className="w-full mt-1 h-24 border border-input rounded-md px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={form.terms_and_conditions || ''}
                  onChange={e => sf('terms_and_conditions', e.target.value)}
                  placeholder="Payment terms, delivery terms…"
                />
              </div>
              <div className="col-span-2">
                <Label>Internal Notes (not printed)</Label>
                <Input value={form.internal_notes || ''} onChange={e => sf('internal_notes', e.target.value)}
                  className="mt-1" placeholder="For internal use only…" />
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center mt-4 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => { handleSave().then(() => { if (form) openPrint(form); }); }}>
              <Printer className="w-4 h-4 mr-1" /> Save & Print
            </Button>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      {printTarget && (
        <QuotationPrint
          quotation={printTarget}
          settings={activeCompany || settings}
          onClose={closePrintTarget}
        />
      )}

      <QuickPartnerCreate
        open={showCustomerCreate}
        onOpenChange={setShowCustomerCreate}
        type="customer"
        onCreated={(customer) => {
          setCustomers(prev => [...prev, customer]);
          setForm(f => ({ ...f, customer_id: customer.id, customer_name: customer.name }));
        }}
      />
    </div>
  );
}