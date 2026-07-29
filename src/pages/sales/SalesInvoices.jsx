import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Eye, CheckCircle2, XCircle, Ban, AlertTriangle, Pencil, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import DataTable from '@/components/shared/DataTable';
import FormGrid from '@/components/layout/FormGrid';
import FormRow from '@/components/layout/FormRow';
import LineItemsEditor from '@/components/invoices/LineItemsEditor';
import { toast } from 'sonner';
import { format } from 'date-fns';
import DateInput from '@/components/shared/DateInput';
import DualDateDisplay from '@/components/shared/DualDateDisplay';
import { checkoutSalesInvoice, cancelSalesInvoice, loadItemsMap, loadSettings } from '@/lib/glPostingService';
import { loadActiveTaxTypes, computeTotalTax } from '@/lib/taxService';
import { useSajiloSync } from '@/hooks/useSajiloSync';
import { usePermissions, useAuth } from '@/lib/AuthContext';
import SearchableSelect from '@/components/shared/SearchableSelect';
import VoucherLink from '@/components/shared/VoucherLink';
import { generateVectorPDF } from '@/utils/pdfGenerator';
import { downloadPDF } from '@/utils/pdf-engine/generator';
import { Mail, Download } from 'lucide-react';
import FileUpload from '@/components/shared/FileUpload';

const emptySI = {
  invoice_number: '', customer_id: '', customer_name: '', sales_order_id: '', godown_id: '',
  invoice_date: format(new Date(), 'yyyy-MM-dd'),
  due_date: format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd'),
  payment_mode: 'Credit', cash_bank_account_id: '', cash_bank_account_name: '',
  status: 'Draft', payment_status: 'Unpaid',
  goods_subtotal: 0, sundry_charges_total: 0, total_tax_amount: 0, grand_total: 0,
  notes: '', line_items: []
};

export default function SalesInvoices() {
  const { hasAccess } = usePermissions();
  const { activeCompany, mainGodownId, activeGodowns, activeFiscalYear } = useAuth();
  const canCreate = hasAccess('sales_invoices', 'create');
  const canEdit = hasAccess('sales_invoices', 'edit');
  const canReverse = hasAccess('sales_invoices', 'reverse');

  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [taxTypes, setTaxTypes] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewDetail, setViewDetail] = useState(null);
  const [form, setForm] = useState(emptySI);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [showNegativeStockWarning, setShowNegativeStockWarning] = useState(false);
  const [negativeStockItems, setNegativeStockItems] = useState([]);

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

  // Promise-based confirm modal state
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', resolve: null });

  const showConfirmModal = (message) => {
    return new Promise((resolve) => {
      setConfirmModal({ isOpen: true, message, resolve });
    });
  };

  const handleConfirmAction = (isConfirmed) => {
    if (confirmModal.resolve) confirmModal.resolve(isConfirmed);
    setConfirmModal({ isOpen: false, message: '', resolve: null });
  };

  const loadData = async () => {
    Promise.all([
      sajilo.entities.SalesInvoice.list('-created_date', 50),
      sajilo.entities.BusinessPartner.filter({ is_active: true }),
      sajilo.entities.SalesOrder.filter({ fulfillment_status: 'Confirmed' }),
      sajilo.entities.CompanySettings.list(),
      sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 500),
      loadActiveTaxTypes(),
      sajilo.entities.Godown.filter({ status: 'Active' }),
    ]).then(([inv, cs, sos, sett, accs, txTypes, gds]) => {
      setInvoices(inv);
      setCustomers(cs.filter(c => c.is_customer || c.treat_as_customer));
      setSalesOrders(sos);
      setSettings(sett.length > 0 ? sett[0] : {});
      setAccounts(accs);
      setTaxTypes(txTypes || []);
      setGodowns(gds || []);
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
        sajilo.entities.SalesInvoice.filter({ invoice_number: viewId }).then(res => {
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

  const handleDownloadPDF = async (invoice) => {
    toast.loading('Generating PDF...', { id: 'pdf-gen' });
    try {
      const templates = await sajilo.entities.DocumentTemplate.filter({ document_type: 'Sales Invoice' });
      const defaultTemplate = templates.find(t => t.is_default) || templates[0];
      const layoutConfig = defaultTemplate ? defaultTemplate.layout_config : {};

      let customerDetails = { name: invoice.customer_name };
      if (invoice.customer_id) {
        const custData = await sajilo.entities.BusinessPartner.get(invoice.customer_id);
        if (custData) {
          customerDetails = {
            ...custData,
            phone: custData.phone || custData.contact_number // Map contact_number to phone for PDF generator
          };
        }
      }

      const pdfData = {
        ...invoice,
        date: invoice.invoice_date,
        reference_number: invoice.invoice_number,
        company: activeCompany || settings || { name: 'Sajilo ERP' },
        customer: customerDetails,
        subtotal: invoice.goods_subtotal,
        tax_total: invoice.total_tax_amount,
        total: invoice.grand_total,
      };

      await downloadPDF(pdfData, layoutConfig, `Invoice_${invoice.invoice_number}.pdf`);
      toast.success('PDF generated successfully!', { id: 'pdf-gen' });
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate PDF', { id: 'pdf-gen' });
    }
  };


  useSajiloSync(['BusinessPartner', 'SalesOrder', 'CompanySettings'], loadData);

  const fetchInvoices = async () => {
    const data = await sajilo.entities.SalesInvoice.list('-created_date', 50);
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

  const getSafeDefaultDate = () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (activeFiscalYear) {
      if (today > activeFiscalYear.end_date) return activeFiscalYear.end_date;
      if (today < activeFiscalYear.start_date) return activeFiscalYear.start_date;
    }
    return today;
  };

  const openNew = () => {
    const isAuto = !settings || settings.invoice_numbering_method !== 'Manual';
    const invNumber = isAuto ? generateInvoiceNumber() : '';
    const safeDate = getSafeDefaultDate();
    
    setForm({ 
      ...emptySI, 
      id: crypto.randomUUID(), 
      invoice_number: invNumber, 
      godown_id: mainGodownId || '', 
      invoice_date: safeDate,
      due_date: format(new Date(new Date(safeDate).getTime() + 30 * 86400000), 'yyyy-MM-dd'),
      _isNew: true 
    });
    setDupWarning(false);
    setPendingPostStatus(null);
    setShowForm(true);
  };

  const openEdit = (row) => {
    setForm({ ...emptySI, ...row, _isNew: false });
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

  const handleSave = async (postStatus = 'Draft', skipStockCheck = false) => {
    if (form.payment_mode === 'Credit' && !form.customer_name) { toast.error('Select a customer'); return; }
    if (['Cash', 'Bank'].includes(form.payment_mode) && !form.cash_bank_account_id) { toast.error('Select a Cash/Bank ledger account'); return; }
    if (!form.invoice_number) { toast.error('Invoice number is required'); return; }
    if (!form.grand_total || form.grand_total <= 0) { toast.error('Total amount cannot be empty or zero'); return; }
    if (settings?.enable_godown_management && !form.godown_id) { toast.error('Godown / Location is required'); return; }
    if (form.line_items.length === 0) { toast.error('Add at least one item'); return; }

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

    if (postStatus === 'Posted' && settings?.negative_stock_policy === 'WARN_AND_ALLOW' && !skipStockCheck) {
      try {
        const itemIds = form.line_items.map(l => l.item_id).filter(Boolean);
        if (itemIds.length > 0) {
          const { data: stockData } = await sajilo.auth.supabase.rpc('get_current_stock_rpc', {
            p_company_id: sajilo.getCompanyId(),
            p_godown_id: form.godown_id,
            p_item_ids: itemIds
          });
          
          if (stockData) {
            const stockMap = stockData.reduce((acc, curr) => ({ ...acc, [curr.item_id]: curr.quantity }), {});
            const negativeItems = [];
            for (const item of form.line_items) {
              if (!item.item_id) continue;
              const currentStock = stockMap[item.item_id] || 0;
              if (currentStock - (Number(item.quantity) || 0) < 0) {
                negativeItems.push(item.item_name);
              }
            }
            if (negativeItems.length > 0) {
              setPendingPostStatus(postStatus);
              setNegativeStockItems(negativeItems.map(name => ({ name, deficit: '...' })));
              setShowNegativeStockWarning(true);
              return;
            }
          }
        }
      } catch (err) {
        console.error("Stock check failed:", err);
      }
    }

    if (postStatus === 'Posted') {
      const itemIds = form.line_items.map(l => l.item_id).filter(Boolean);
      if (itemIds.length > 0) {
        const { data: itemsData } = await sajilo.auth.supabase.from('Item').select('id, is_physical, current_unit_cost, weighted_average_cost, item_name').in('id', itemIds);
        if (itemsData) {
          const itemsMap = itemsData.reduce((acc, item) => ({ ...acc, [item.id]: item }), {});
          const zeroCostItems = form.line_items.filter(line => {
            const itemInfo = itemsMap[line.item_id];
            if (!itemInfo || !itemInfo.is_physical) return false;
            const cost = Number(itemInfo.current_unit_cost || itemInfo.weighted_average_cost || 0);
            return cost === 0;
          });

          if (zeroCostItems.length > 0) {
            const itemNames = zeroCostItems.map(i => i.item_name).join(', ');
            const isConfirmed = await showConfirmModal(`Warning: The following items have a recorded purchase cost of Rs. 0: [${itemNames}]. This will result in a 100% profit margin for these items. Are you sure you want to proceed?`);
            if (!isConfirmed) {
              return; // Abort checkout entirely
            }
          }
        }
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
      const isAuto = settings && settings.invoice_numbering_method !== 'Manual';

      if (postStatus === 'Posted') {
        const idempotencyKey = crypto.randomUUID();
        const [itemsMap, glSettings] = await Promise.all([loadItemsMap(form.line_items.map(l => l.item_id)), loadSettings()]);
        
        const result = await checkoutSalesInvoice({ ...data, id: form.id }, itemsMap, glSettings, idempotencyKey);
        docId = result.invoice_id || form.id;

        if (form._isNew && isAuto) {
          const next = (settings.invoice_next_number || 1) + 1;
          await sajilo.entities.CompanySettings.update(settings.id, { invoice_next_number: next });
          setSettings(s => ({ ...s, invoice_next_number: next }));
        }
      } else {
        // Standard Draft upsert
        if (!form._isNew && invoices.find(i => i.id === form.id)) {
          await sajilo.entities.SalesInvoice.update(form.id, payload);
          toast.success('Invoice updated as draft');
        } else {
          const created = await sajilo.entities.SalesInvoice.create({ ...payload, id: form.id });
          docId = created.id;
          
          if (isAuto) {
            const next = (settings.invoice_next_number || 1) + 1;
            await sajilo.entities.CompanySettings.update(settings.id, { invoice_next_number: next });
            setSettings(s => ({ ...s, invoice_next_number: next }));
          }
          toast.success('Invoice saved as draft');
        }
      }

      // Native Vector PDF cache generation
      try {
        const fullDocId = docId || form.id;
        const fullDoc = { ...data, id: fullDocId, invoice_number: form.invoice_number };
        const partner = customers.find(c => c.id === form.customer_id);
        
        await generateVectorPDF(
          fullDoc,
          'SalesInvoice',
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
    await sajilo.entities.SalesInvoice.update(inv.id, { payment_status: newStatus });
    toast.success(`Invoice marked as ${newStatus}`);
    fetchInvoices();
  };

  // ── CANCEL (Atomic cancellation via PostgreSQL RPC) ──
  const handleConfirmCancel = async () => {
    if (!cancelReason.trim()) { toast.error('Please provide a cancellation reason'); return; }
    setCancelling(true);
    const inv = cancelTarget;

    try {
      await cancelSalesInvoice(inv.id, cancelReason);
      
      // Instantly update local React state to reflect the cancelled status without refreshing
      setInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: 'Cancelled', payment_status: 'Unpaid', cancellation_reason: cancelReason, cancelled_date: format(new Date(), 'yyyy-MM-dd') } : i));
      
      toast.success('Invoice cancelled — all transactions reversed & GL updated');
      setCancelTarget(null);
      setCancelReason('');
    } catch (err) {
      // Error handled by cancelSalesInvoice service
    } finally {
      setCancelling(false);
    }
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
    : filterStatus === 'Paid' ? i.payment_status === 'Paid' && i.status === 'Posted'
    : filterStatus === 'Rejected' ? i.status === 'Rejected'
    : i.status === filterStatus
  );

  const columns = [
    { key: 'invoice_number', label: 'Invoice #', render: (val, row) => (
      <VoucherLink voucherNumber={val}>
        <span className={`cursor-pointer font-mono font-semibold ${row.status === 'Cancelled' ? 'line-through text-muted-foreground' : row.status === 'Rejected' ? 'text-orange-500 line-through' : 'text-primary'}`}>{val}</span>
      </VoucherLink>
    )},
    { key: 'customer_name', label: 'Customer', render: (val, row) => {
      let displayName = val;
      if (!displayName && row.notes) {
        const match = row.notes.match(/Payment Mode: (?:Cash|Bank) \((.+?)\)/);
        if (match) displayName = match[1];
      }
      return <span className={row.status === 'Cancelled' || row.status === 'Rejected' ? 'text-muted-foreground' : ''}>{displayName || '—'}</span>;
    }},
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
          {row.status === 'Posted' && (
            <Button variant="ghost" size="icon" className={row.payment_status === 'Paid' ? 'text-amber-500' : 'text-emerald-500'} title={`Mark as ${row.payment_status === 'Paid' ? 'Unpaid' : 'Paid'}`} onClick={() => togglePaymentStatus(row)}>
              {row.payment_status === 'Paid' ? <RotateCcw className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            </Button>
          )}
          {(row.status === 'Draft' || row.status === 'Posted') && canEdit && (
            <Button variant="ghost" size="icon" className="text-primary print:hidden" title="Edit Invoice" onClick={() => openEdit(row)}>
              <Pencil className="w-4 h-4" />
            </Button>
          )}
          {(row.status === 'Draft' || row.status === 'Posted') && canReverse && (
            <Button variant="ghost" size="icon" className="text-destructive print:hidden" title="Cancel Invoice (reverse transactions)" onClick={() => { setCancelTarget(row); setCancelReason(''); }}>
              <XCircle className="w-4 h-4" />
            </Button>
          )}
          {row.status === 'Draft' && (
            <Button variant="ghost" size="icon" className="text-orange-500 print:hidden" title="Reject Invoice Number (no transactions)" onClick={() => { setRejectTarget(row); setRejectReason(''); }}>
              <Ban className="w-4 h-4" />
            </Button>
          )}
        </div>
      )
    }
  ];

  const isMissingGL = settings && (!settings.gl_accounts_receivable_id || !settings.gl_vat_payable_id);

  return (
    <div>
      {isMissingGL && (
        <div className="mb-4 bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold">Action Required: Missing Global Configuration</h4>
            <p className="text-sm mt-1">Default Accounts Receivable or VAT Payable GL mappings are missing. Please configure them in Company Settings before generating invoices.</p>
          </div>
        </div>
      )}

      <PageHeader
        title="Sales Invoices"
        subtitle="Create and manage customer invoices and track payments"
        action={canCreate && !isMissingGL ? openNew : undefined}
        actionLabel={canCreate ? "New Invoice" : undefined}
        actionIcon={canCreate ? Plus : undefined}
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
          { key: 'Rejected', label: 'Rejected' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === f.key ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            {f.label}
            {f.key === 'Cancelled' && <span className="ml-1.5 text-xs bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-full px-1.5">{invoices.filter(i => i.status === 'Cancelled').length}</span>}
            {f.key === 'Rejected' && <span className="ml-1.5 text-xs bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-full px-1.5">{invoices.filter(i => i.status === 'Rejected').length}</span>}
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4 pb-24">
            {/* LEFT COLUMN */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-card rounded-2xl border border-stone-200 p-5 shadow-sm">
                <h3 className="font-semibold text-lg text-foreground mb-4">Customer & invoice context</h3>
                <FormGrid>
                  <FormRow fullWidth>
                    <Label>Payment Mode</Label>
                    <div className="flex gap-2 mt-1">
                      {['Credit', 'Cash', 'Bank'].map(mode => (
                        <Button 
                          key={mode} 
                          type="button"
                          variant={form.payment_mode === mode ? 'default' : 'outline'}
                          onClick={() => setForm(f => ({ ...f, payment_mode: mode, cash_bank_account_id: '', cash_bank_account_name: '', customer_id: '', customer_name: '' }))}
                          className="flex-1 rounded-xl"
                        >
                          {mode}
                        </Button>
                      ))}
                    </div>
                  </FormRow>
                  <FormRow fullWidth>
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
                        <span className="flex items-center text-xs text-muted-foreground bg-muted px-2 rounded-xl border border-border whitespace-nowrap">Auto</span>
                      )}
                    </div>
                    {settings?.invoice_numbering_method === 'Manual' && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Manual mode — {settings?.invoice_duplicate_handling === 'Warn' ? 'Duplicate numbers will trigger a warning' : 'Duplicate numbers are blocked'}
                      </p>
                    )}
                  </FormRow>
                  
                  {form.payment_mode === 'Credit' ? (
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
                        onCreateNew={() => window.open('/sales/customers/new', '_blank')}
                        createNewText="New Customer"
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
                      <SelectTrigger className="mt-1 border-dashed border-primary/50 text-primary rounded-xl">
                        <SelectValue placeholder="📋 Fetch from SO..." />
                      </SelectTrigger>
                      <SelectContent>
                        {salesOrders.map(so => (
                          <SelectItem key={so.id} value={so.id}>{so.order_number} — {so.customer_name}</SelectItem>
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
                    <DateInput label="Invoice Date" value={form.invoice_date} onChange={v => setForm(f => ({...f, invoice_date: v}))} className="mt-1" min={activeFiscalYear?.start_date} max={activeFiscalYear?.end_date} />
                  </div>
                  <div>
                    <DateInput label="Due Date" value={form.due_date} onChange={v => setForm(f => ({...f, due_date: v}))} className="mt-1" />
                  </div>
                  <div>
                    <Label>Sundry Charges (NPR)</Label>
                    <Input type="number" value={form.sundry_charges_total} onChange={e => {
                      const sc = Number(e.target.value);
                      setForm(f => ({ ...f, sundry_charges_total: sc, grand_total: (f.goods_subtotal || 0) + (f.total_tax_amount || 0) + sc }));
                    }} className="mt-1" />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Input value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} placeholder="Optional" className="mt-1" />
                  </div>
                </FormGrid>
              </div>

              <div className="bg-card rounded-2xl border border-stone-200 p-5 shadow-sm">
                <h3 className="font-semibold text-lg text-foreground mb-4">Line Items</h3>
                <LineItemsEditor value={form.line_items} onChange={handleLineChange} taxTypes={taxTypes} hideTotals={true} />
              </div>

              <div className="bg-card rounded-2xl border border-stone-200 p-5 shadow-sm">
                <h3 className="font-semibold text-lg text-foreground mb-4">Attachments</h3>
                <FileUpload 
                  companyId={activeCompany?.id || sajilo.getCompanyId()} 
                  moduleName="SalesInvoice" 
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
                    <span className="font-semibold">NPR {(form.goods_subtotal || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground font-medium">VAT Amount</span>
                    <span className="font-semibold">NPR {(form.total_tax_amount || 0).toLocaleString()}</span>
                  </div>
                  {form.sundry_charges_total > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground font-medium">Charges</span>
                      <span className="font-semibold text-orange-600">NPR {(form.sundry_charges_total || 0).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-xl font-bold border-t border-stone-100 pt-4 mt-4">
                    <span className="text-foreground">Invoice Total</span>
                    <span className="text-foreground">NPR {(form.grand_total || 0).toLocaleString()}</span>
                  </div>
                  <div className="pt-4 flex items-center gap-2 text-muted-foreground text-xs justify-center">
                    <span className="flex-1 border-t border-stone-200"></span>
                    No linked source document
                    <span className="flex-1 border-t border-stone-200"></span>
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
              <Button type="button" variant="ghost" className="rounded-xl print:hidden" onClick={() => setShowForm(false)} disabled={saving}>Cancel</Button>
              <Button type="button" variant="outline" className="rounded-xl border-primary text-primary hover:bg-primary/10 print:hidden" onClick={(e) => {
                e.preventDefault();
                handleSave('Draft');
              }} disabled={saving}>Save Draft</Button>
              <Button type="button" className="rounded-xl font-bold shadow-sm px-6 print:hidden" onClick={(e) => {
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
                Invoice {viewDetail?.invoice_number}
                <StatusBadge status={viewDetail?.status} />
              </div>
              {viewDetail && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs print:hidden" onClick={() => handleDownloadPDF(viewDetail)}>
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Download PDF
                  </Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs print:hidden" onClick={() => navigate(`/email/compose?module=SalesInvoice&id=${viewDetail.id}`)}>
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
                <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium">{viewDetail.customer_name}</span></div>
                <div><span className="text-muted-foreground">Date:</span> <span className="font-medium"><DualDateDisplay date={viewDetail.invoice_date} /></span></div>
                <div><span className="text-muted-foreground">Created:</span> <span className="font-medium">{viewDetail.created_at ? new Date(viewDetail.created_at).toLocaleString() : '-'}</span></div>
                <div><span className="text-muted-foreground">Due Date:</span> <span className="font-medium"><DualDateDisplay date={viewDetail.due_date} /></span></div>
                <div><span className="text-muted-foreground">Payment:</span> <StatusBadge status={viewDetail.payment_status} /></div>
                <div><span className="text-muted-foreground">Subtotal:</span> <span className="font-medium">NPR {Number(viewDetail.goods_subtotal).toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Tax:</span> <span className="font-medium">NPR {Number(viewDetail.total_tax_amount).toLocaleString()}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Grand Total:</span> <span className="font-bold text-primary text-base"> NPR {Number(viewDetail.grand_total).toLocaleString()}</span></div>
              </div>
              {viewDetail.notes && <p className="text-sm text-muted-foreground border-t pt-3">{viewDetail.notes}</p>}
              {viewDetail.status === 'Cancelled' && (
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center gap-1"><XCircle className="w-4 h-4" /> Cancelled</p>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-1">{viewDetail.cancellation_reason}</p>
                  <p className="text-xs text-red-400 mt-1">Date: {viewDetail.cancelled_date}</p>
                </div>
              )}
              {viewDetail.status === 'Rejected' && (
                <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-lg p-3">
                  <p className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-1"><Ban className="w-4 h-4" /> Rejected (Number Voided)</p>
                  <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">{viewDetail.rejection_reason}</p>
                  <p className="text-xs text-orange-400 mt-1">Date: {viewDetail.rejected_date}</p>
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
                  companyId={activeCompany?.id || sajilo.getCompanyId()} 
                  moduleName="SalesInvoice" 
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
              <XCircle className="w-5 h-5" /> Cancel Invoice {cancelTarget?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
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
            <Button variant="destructive" disabled={cancelling || !cancelReason.trim()} onClick={handleConfirmCancel} className="print:hidden">
              {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── REJECT DIALOG ── */}
      <Dialog open={!!rejectTarget} onOpenChange={() => setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <Ban className="w-5 h-5" /> Reject Invoice Number {rejectTarget?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-lg p-3 text-sm text-orange-700 dark:text-orange-400">
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
            <Button className="bg-orange-600 hover:bg-orange-700 text-white print:hidden" disabled={rejecting || !rejectReason.trim()} onClick={handleConfirmReject}>
              {rejecting ? 'Rejecting...' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DUPLICATE WARNING DIALOG (Manual mode, Warn) ── */}
      <Dialog open={dupWarning} onOpenChange={() => { setDupWarning(false); setPendingPostStatus(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="w-5 h-5" /> Duplicate Invoice Number
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            Invoice number <span className="font-mono font-semibold text-foreground">"{form.invoice_number}"</span> already exists in the system. Do you want to proceed anyway?
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDupWarning(false); setPendingPostStatus(null); }}>Go Back</Button>
            <Button className="bg-yellow-600 hover:bg-yellow-700 text-white print:hidden" onClick={() => handleSave(pendingPostStatus)}>
              Proceed Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* ── NEGATIVE STOCK WARNING DIALOG ── */}
      <Dialog open={!!showNegativeStockWarning} onOpenChange={() => { setShowNegativeStockWarning(false); setPendingPostStatus(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="w-5 h-5" /> Negative Stock Warning
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>This transaction will result in negative stock for the following items:</p>
            <ul className="list-disc pl-5 space-y-1 text-red-600 font-medium">
              {negativeStockItems.map((n, idx) => (
                <li key={idx}>{n.name} (Shortfall: {n.deficit})</li>
              ))}
            </ul>
            {hasAccess('inventory', 'override_negative_stock') ? (
              <p className="mt-4 font-semibold text-foreground">Do you wish to proceed and allow negative stock?</p>
            ) : (
              <p className="mt-4 font-bold text-red-600">You do not have permission to override negative stock. Please contact an Inventory Manager.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNegativeStockWarning(false); setPendingPostStatus(null); }}>Cancel</Button>
            {hasAccess('inventory', 'override_negative_stock') && (
              <Button className="bg-red-600 hover:bg-red-700 text-white print:hidden" onClick={() => { setShowNegativeStockWarning(false); handleSave(pendingPostStatus, true); }}>
                Acknowledge & Proceed
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PROMISE-BASED CONFIRM DIALOG ── */}
      <Dialog open={confirmModal.isOpen} onOpenChange={(open) => !open && handleConfirmAction(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="w-5 h-5" /> Zero Cost Warning
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-stone-700">
            {confirmModal.message}
          </div>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 border-t pt-4">
            <Button variant="outline" onClick={() => handleConfirmAction(false)}>
              Cancel
            </Button>
            <Button className="bg-orange-600 hover:bg-orange-700 text-white print:hidden" onClick={() => handleConfirmAction(true)}>
              Proceed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}