import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import DualDateDisplay from '@/components/shared/DualDateDisplay';
import { formatDualDateString } from '@/lib/nepaliDate';
import { toast } from 'sonner';
import { Plus, Eye, Trash2, RotateCcw, TriangleAlert , ListChecks} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SearchableSelect from '@/components/shared/SearchableSelect';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { useSajiloSync } from '@/hooks/useSajiloSync';
import { postFinancialVoucher } from '@/lib/glPostingService';
import { generateVectorPDF } from '@/utils/pdfGenerator';
import VoucherLink from '@/components/shared/VoucherLink';
import DateInput from '@/components/shared/DateInput';

const emptyVoucher = {
  voucher_type: 'Receipt', voucher_date: new Date().toISOString().split('T')[0],
  contact_name: '', payment_mode: 'Cash', reference_no: '', narration: '',
  total_amount: 0, status: 'Draft',
  source_account_id: '', source_account_name: '', source_account_code: '', source_account_type: '',
  entries: [{ account_name: '', account_code: '', account_type: '', debit: 0, credit: 0, narration: '' }]
};

const fmt = (n) => `NPR ${Number(n || 0).toLocaleString()}`;

export default function FinancialVouchers() {
  

  const [vouchers, setVouchers] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyVoucher);
  const [settings, setSettings] = useState({});
  const [billAllocations, setBillAllocations] = useState([]);
  const [partnerAccounts, setPartnerAccounts] = useState(new Set());
  const [activeAllocationRow, setActiveAllocationRow] = useState(null);
  const [pendingBillsModalOpen, setPendingBillsModalOpen] = useState(false);
  const [pendingBills, setPendingBills] = useState([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('All');

  // Delete / Reverse dialog state
  const [actionDialog, setActionDialog] = useState(null); // null | 'delete' | 'reverse'
  const [actionReason, setActionReason] = useState('');
  const [actionProcessing, setActionProcessing] = useState(false);

  useEffect(() => { fetchData(); }, []);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { activeCompany } = useAuth();

  useEffect(() => {
    const viewId = searchParams.get('view');
    if (viewId) {
      if (!viewOpen || selected?.voucher_number !== viewId) {
        sajilo.entities.FinancialVoucher.filter({ voucher_number: viewId }).then(res => {
          if (res.length > 0) {
            setSelected({ ...res[0], _isViewMode: true });
            setViewOpen(true);
          }
        });
      }
    } else if (searchParams.get('new') === '1') {
      (() => { setForm({ ...emptyVoucher, voucher_type: searchParams.get("type") || "Receipt" }); setOpen(true); })();
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  const closeViewDetail = () => {
    setViewOpen(false);
    setSelected(null);
    if (searchParams.get('view')) {
      if (location.state?.from) {
        navigate(location.state.from);
      } else {
        searchParams.delete('view');
        setSearchParams(searchParams, { replace: true });
      }
    }
  };

  useSajiloSync(['ChartOfAccount'], fetchData);

  async function fetchData() {
    setLoading(true);
    const [data, accounts, settingsData, partners] = await Promise.all([
      sajilo.entities.FinancialVoucher.list('-created_at', 200),
      sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 1000),
      sajilo.entities.CompanySettings.list(),
      sajilo.entities.BusinessPartner.list(),
    ]);
    setVouchers(data);
    setAllAccounts(accounts);
    
    const pIds = new Set();
    if (partners) {
      partners.forEach(p => {
        if (p.receivable_account_id) pIds.add(p.receivable_account_id);
        if (p.payable_account_id) pIds.add(p.payable_account_id);
      });
    }
    setPartnerAccounts(pIds);

    if (settingsData && settingsData.length > 0) setSettings(settingsData[0]);
    setLoading(false);
  };

  const cashAccounts = allAccounts.filter(a =>
    a.ledger_type === 'Sub Ledger' &&
    a.account_type === 'Asset' &&
    (
      (a.account_subtype || '').toLowerCase().includes('cash') ||
      (a.account_name || '').toLowerCase().includes('cash') ||
      (a.account_name || '').toLowerCase().includes('bank') ||
      (a.account_name || '').toLowerCase().includes('petty')
    )
  );

  const isPaymentType = form.voucher_type === 'Payment' || form.voucher_type === 'Receipt' || form.voucher_type === 'Contra';
  const paymentSourceAccounts = cashAccounts;
  const ledgerAccounts = allAccounts.filter(a => a.ledger_type === 'Sub Ledger');

  const targetAccounts = form.voucher_type === 'Contra' 
    ? cashAccounts 
    : (form.voucher_type === 'Payment' || form.voucher_type === 'Receipt')
      ? ledgerAccounts.filter(a => !cashAccounts.find(ca => ca.id === a.id))
      : ledgerAccounts;

  
  const openPendingBills = async (rowIndex) => {
    setActiveAllocationRow(rowIndex);
    setLoadingBills(true);
    setPendingBillsModalOpen(true);
    try {
      const table = form.voucher_type === 'Receipt' ? 'SalesInvoice' : 'PurchaseInvoice';
      const contactField = form.voucher_type === 'Receipt' ? 'customer_name' : 'supplier_name';
      
      let q = sajilo.auth.supabase.from(table).select('*').eq('status', 'Posted').neq('payment_status', 'Paid').eq('company_id', sajilo.getCompanyId());
      
      const accountName = form.entries[rowIndex]?.account_name;
      if (accountName) {
        q = q.ilike(contactField, `%${accountName}%`);
      } else if (form.contact_name) {
        // Fallback for compatibility
        q = q.ilike(contactField, `%${form.contact_name}%`);
      }
      const { data } = await q;
      setPendingBills(data || []);
    } catch(e) {
      toast.error('Failed to load pending bills');
    } finally {
      setLoadingBills(false);
    }
  };

  const handleBillAllocationChange = (invoice, amount) => {
    setBillAllocations(prev => {
      const exists = prev.find(p => p.invoice_id === invoice.id);
      if (amount <= 0) {
        return prev.filter(p => p.invoice_id !== invoice.id);
      }
      if (exists) {
        return prev.map(p => p.invoice_id === invoice.id ? { ...p, allocated_amount: amount } : p);
      }
      return [...prev, { invoice_id: invoice.id, invoice_number: invoice.invoice_number, invoice_date: invoice.invoice_date, total: invoice.grand_total, due: (invoice.grand_total - (invoice.paid_amount||0)), allocated_amount: amount }];
    });
  };

  const autoAllocate = () => {
    let remaining = form.total_amount || 0;
    const newAlloc = [];
    for (const bill of pendingBills) {
      if (remaining <= 0) break;
      const due = bill.grand_total - (bill.paid_amount || 0);
      const alloc = Math.min(due, remaining);
      newAlloc.push({
        invoice_id: bill.id, invoice_number: bill.invoice_number, invoice_date: bill.invoice_date,
        total: bill.grand_total, due: due, allocated_amount: alloc
      });
      remaining -= alloc;
    }
    setBillAllocations(newAlloc);
  };

  const handleEntry = (idx, field, val) => {
    setForm(prev => {
      const entries = [...prev.entries];
      entries[idx] = { ...entries[idx], [field]: (field === 'debit' || field === 'credit') ? parseFloat(val) || 0 : val };
      const total = entries.reduce((s, e) => s + (e.debit || 0), 0);
      return { ...prev, entries, total_amount: total };
    });
  };

  const addEntry = () => setForm({ ...form, entries: [...form.entries, { account_id: '', account_code: '', account_name: '', account_type: 'Asset', debit: 0, credit: 0, narration: '' }] });
  const removeEntry = (idx) => setForm({ ...form, entries: form.entries.filter((_, i) => i !== idx) });

  const genNumber = () => {
    const prefix = { Receipt: 'RV', Payment: 'PV', Journal: 'JV', Contra: 'CV' }[form.voucher_type] || 'VV';
    const year = new Date().getFullYear();
    const prefixStr = `${prefix}-${year}-`;
    let max = 0;
    vouchers.forEach(v => {
      if (v.voucher_number && v.voucher_number.startsWith(prefixStr)) {
        const numStr = v.voucher_number.replace(prefixStr, '');
        const num = parseInt(numStr, 10);
        if (!isNaN(num) && num > max) max = num;
      }
    });
    return `${prefixStr}${String(max + 1).padStart(3, '0')}`;
  };

  const save = async (status) => {
    setSaving(true);
    try {
      let finalEntries = [];
      const isPaymentTypeLocal = form.voucher_type === 'Payment' || form.voucher_type === 'Receipt' || form.voucher_type === 'Contra';
      
      if (isPaymentTypeLocal) {
        if (!form.source_account_id) throw new Error("Please select a Source Account.");
        
        let totalAmount = 0;
        const targetEntries = form.entries.filter(e => e.account_id).map(e => {
          const amt = e.debit || 0; // UI uses 'debit' for Amount field
          totalAmount += amt;
          return {
            ...e,
            debit: form.voucher_type === 'Receipt' ? 0 : amt, // Payment/Contra targets get Debited
            credit: form.voucher_type === 'Receipt' ? amt : 0 // Receipt targets get Credited
          };
        });
        
        if (targetEntries.length === 0) throw new Error("Please add at least one ledger entry.");
        if (totalAmount <= 0) throw new Error("Total amount must be greater than zero.");
        
        const sourceEntry = {
          account_id: form.source_account_id,
          account_name: form.source_account_name,
          account_code: form.source_account_code,
          account_type: form.source_account_type,
          debit: form.voucher_type === 'Receipt' ? totalAmount : 0, // Receipt: Bank Debited
          credit: form.voucher_type !== 'Receipt' ? totalAmount : 0, // Payment/Contra: Bank Credited
          narration: `Source account for ${form.voucher_type}`
        };
        
        finalEntries = [sourceEntry, ...targetEntries];
        form.total_amount = totalAmount;
      } else {
        // Journal Voucher
        finalEntries = form.entries.filter(e => e.account_id && (e.debit > 0 || e.credit > 0));
        if (finalEntries.length < 2) throw new Error("Journal voucher must have at least two entries.");
        
        const totDebit = finalEntries.reduce((s, e) => s + (e.debit || 0), 0);
        const totCredit = finalEntries.reduce((s, e) => s + (e.credit || 0), 0);
        if (Math.abs(totDebit - totCredit) > 0.01) throw new Error(`Unbalanced Journal! Debits: ${totDebit}, Credits: ${totCredit}`);
        form.total_amount = totDebit;
      }

      const payload = { ...form, entries: finalEntries, status, voucher_number: genNumber(), bill_allocations: (form.voucher_type === 'Receipt' || form.voucher_type === 'Payment') ? JSON.stringify(billAllocations) : null };
      delete payload.source_account_id;
      delete payload.source_account_name;
      delete payload.source_account_code;
      delete payload.source_account_type;

      const savedVoucher = await sajilo.entities.FinancialVoucher.create(payload);
      
      if (status === 'Posted') {
        const idempotencyKey = crypto.randomUUID();
        const linesToPost = payload.entries.map(e => ({
          account_id: e.account_id,
          debit_amount: e.debit || 0,
          credit_amount: e.credit || 0,
          description: e.narration || payload.narration || `Financial Voucher ${payload.voucher_number}`
        }));
        await postFinancialVoucher({ ...savedVoucher, lines: linesToPost }, false, idempotencyKey);
        
        // Update Paid Amounts for Invoices
        if ((form.voucher_type === 'Receipt' || form.voucher_type === 'Payment') && billAllocations.length > 0) {
          for (const alloc of billAllocations) {
            const table = form.voucher_type === 'Receipt' ? 'SalesInvoice' : 'PurchaseInvoice';
            try {
              // Fetch current
              const res = await sajilo.client.from(table).select('paid_amount, grand_total').eq('id', alloc.invoice_id).single();
              if (res.data) {
                const newPaid = (res.data.paid_amount || 0) + alloc.allocated_amount;
                const newStatus = newPaid >= res.data.grand_total ? 'Paid' : (newPaid > 0 ? 'Partial Paid' : 'Unpaid');
                await sajilo.client.from(table).update({ paid_amount: newPaid, payment_status: newStatus }).eq('id', alloc.invoice_id);
              }
            } catch(e) { console.error('Failed to update invoice payment status', e); }
          }
        }
      }

      // Native Vector PDF cache generation
      try {
        const partner = { name: savedVoucher.contact_name || '' };
        await generateVectorPDF(
          savedVoucher,
          'FinancialVoucher',
          null,
          partner,
          sajilo.getCompanyId()
        );
      } catch (pdfErr) {
        console.error('Vector PDF Gen error:', pdfErr);
      }

      toast.success(`Voucher ${status}`);
      setOpen(false);
      setForm(emptyVoucher);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete voucher ────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!selected) return;
    setActionProcessing(true);
    const user = await sajilo.auth.me();

    // Reverse GL lines first if voucher is Posted
    if (selected.status === 'Posted') {
      const idempotencyKey = crypto.randomUUID();
      await postFinancialVoucher({ id: selected.id, company_id: selected.company_id }, true, idempotencyKey);
    }

    // Log the deletion
    await sajilo.entities.FinancialVoucherDeleteLog.create({
      voucher_id: selected.id,
      voucher_number: selected.voucher_number,
      voucher_type: selected.voucher_type,
      voucher_date: selected.voucher_date,
      total_amount: selected.total_amount || 0,
      contact_name: selected.contact_name || '',
      action_type: 'Delete',
      performed_by: user?.email || 'unknown',
      reason: actionReason || 'Manual deletion',
      voucher_snapshot: selected,
    });

    await sajilo.entities.FinancialVoucher.delete(selected.id);
    toast.success(`Voucher ${selected.voucher_number} deleted and logged`);
    setActionDialog(null);
    setViewOpen(false);
    setSelected(null);
    setActionReason('');
    setActionProcessing(false);
    fetchData();
  };

  // ── Reverse voucher ───────────────────────────────────────────────────────
  const handleReverse = async () => {
    if (!selected) return;
    setActionProcessing(true);
    const user = await sajilo.auth.me();

    // Build reversal voucher with flipped debit/credit
    const reversalEntries = (selected.entries || []).map(e => ({
      ...e,
      debit: e.credit || 0,
      credit: e.debit || 0,
    }));

    const revPrefix = { Receipt: 'RV', Payment: 'PV', Journal: 'JV', Contra: 'CV' }[selected.voucher_type] || 'VV';
    const reversalNumber = `REV-${selected.voucher_number}`;
    const today = new Date().toISOString().split('T')[0];

    const reversalVoucher = await sajilo.entities.FinancialVoucher.create({
      voucher_type: selected.voucher_type,
      voucher_date: today,
      voucher_number: reversalNumber,
      contact_name: selected.contact_name || '',
      payment_mode: selected.payment_mode || 'Cash',
      reference_no: `REV-${selected.reference_no || selected.voucher_number}`,
      narration: `Reversal of ${selected.voucher_number}. ${actionReason || ''}`.trim(),
      total_amount: selected.total_amount || 0,
      status: 'Posted',
      entries: reversalEntries,
    });

    const idempotencyKey = crypto.randomUUID();
    const linesToPost = reversalEntries.map(e => ({
      account_id: e.account_id,
      debit_amount: e.debit || 0,
      credit_amount: e.credit || 0,
      description: e.narration || reversalVoucher.narration
    }));
    await postFinancialVoucher({ ...reversalVoucher, lines: linesToPost }, false, idempotencyKey);

    // Mark original as Cancelled
    await sajilo.entities.FinancialVoucher.update(selected.id, { status: 'Cancelled' });

    // Log the reversal
    await sajilo.entities.FinancialVoucherDeleteLog.create({
      voucher_id: selected.id,
      voucher_number: selected.voucher_number,
      voucher_type: selected.voucher_type,
      voucher_date: selected.voucher_date,
      total_amount: selected.total_amount || 0,
      contact_name: selected.contact_name || '',
      action_type: 'Reverse',
      reversal_voucher_number: reversalNumber,
      performed_by: user?.email || 'unknown',
      reason: actionReason || 'Manual reversal',
      voucher_snapshot: selected,
    });

    toast.success(`Voucher ${selected.voucher_number} reversed. Reversal entry: ${reversalNumber}`);
    setActionDialog(null);
    setViewOpen(false);
    setSelected(null);
    setActionReason('');
    setActionProcessing(false);
    fetchData();
  };

  // ── Post reversal GL journal ──────────────────────────────────────────────
  async function reverseGLLines(voucher, user, actionType) {
    const lines = (voucher.entries || [])
      .filter(e => e.account_id)
      .map(e => ({
        account_id: e.account_id,
        account_code: e.account_code || '',
        account_name: e.account_name || '',
        account_type: e.account_type || '',
        debit_amount: e.credit || 0,   // flip
        credit_amount: e.debit || 0,   // flip
        description: `${actionType} of voucher ${voucher.voucher_number}`,
      }));

    if (lines.length === 0) return;

    const today = new Date().toISOString().split('T')[0];
    const totalDebit = lines.reduce((s, l) => s + (l.debit_amount || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.credit_amount || 0), 0);

    const journal = await sajilo.entities.GeneralLedgerJournal.create({
      entry_date: today,
      description: `${actionType} of Financial Voucher ${voucher.voucher_number}`,
      reference_module: 'Treasury',
      source_document_id: voucher.id,
      source_document_type: 'FinancialVoucher',
      status: 'Posted',
      total_debit: totalDebit,
      total_credit: totalCredit,
      is_balanced: Math.abs(totalDebit - totalCredit) < 0.01,
    });

    await sajilo.entities.GeneralLedgerLine.bulkCreate(
      lines.map(l => ({ ...l, journal_id: journal.id }))
    );

    // Update ChartOfAccount balances
    for (const l of lines) {
      if (!l.account_id) continue;
      const results = await sajilo.entities.ChartOfAccount.filter({ id: l.account_id }, 'account_code', 1);
      const acc = results[0];
      if (!acc) continue;
      const delta = (l.debit_amount || 0) - (l.credit_amount || 0);
      const debitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(acc.account_type);
      const balanceChange = debitNormal ? delta : -delta;
      await sajilo.entities.ChartOfAccount.update(acc.id, { current_balance: Math.round(((acc.current_balance || 0) + balanceChange) * 100) / 100 });
    }
  }

  const filtered = filter === 'All' ? vouchers : vouchers.filter(v => v.voucher_type === filter || v.status === filter);

  const columns = [
    { key: 'voucher_number', label: 'Voucher #', render: (val) => (
      <VoucherLink voucherNumber={val}>
        <span className="font-mono font-medium text-primary cursor-pointer">{val}</span>
      </VoucherLink>
    ) },
    { key: 'voucher_type', label: 'Type', render: v => <StatusBadge status={v} /> },
    { key: 'voucher_date', label: 'Date', isDate: true },
    { key: 'contact_name', label: 'Contact' },
    { key: 'payment_mode', label: 'Mode' },
    { key: 'total_amount', label: 'Amount', render: v => fmt(v) },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (_, row) => (
      <Button size="sm" variant="ghost" onClick={() => { setSelected(row); setViewOpen(true); }}>
        <Eye className="w-4 h-4" />
      </Button>
    )}
  ];

  return (
    <div>
      <PageHeader
        title="Financial Vouchers"
        subtitle="Receipt, Payment, Journal & Contra entries"
        action={() => { setForm(emptyVoucher); setBillAllocations([]); setOpen(true); }}
        actionLabel="New Voucher"
        actionIcon={Plus}
      />

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {['All', 'Receipt', 'Payment', 'Contra', 'Cancelled'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'bg-primary text-white' : 'bg-card border border-border text-muted-foreground hover:bg-muted'}`}>
            {f}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} searchKey="contact_name" loading={loading} />

      {/* Form Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Financial Voucher</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Voucher Type *</Label>
                <Select value={form.voucher_type} onValueChange={v => setForm({ ...emptyVoucher, voucher_type: v, voucher_date: form.voucher_date })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Receipt">Receipt (Inflow)</SelectItem>
                    <SelectItem value="Payment">Payment (Outflow)</SelectItem>
                    <SelectItem value="Contra">Contra (Bank Transfer/Cash Dep)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date *</Label>
                <DateInput value={form.voucher_date} onChange={val => setForm({ ...form, voucher_date: val })} className="mt-1" />
              </div>
            </div>

            {isPaymentType && (
              <div className="grid grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border border-border">
                <div>
                  <Label>Payment Source / Dest *</Label>
                  <SearchableSelect
                    options={paymentSourceAccounts.map(a => ({ value: a.id, label: `${a.account_name} (${a.account_type})` }))}
                    value={form.source_account_id}
                    onChange={v => {
                      const a = allAccounts.find(x => x.id === v);
                      setForm({
                        ...form,
                        source_account_id: v,
                        source_account_name: a?.account_name,
                        source_account_code: a?.account_code,
                        source_account_type: a?.account_type,
                      });
                    }}
                    placeholder="Select Cash/Bank account"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Payment Mode</Label>
                  <Select value={form.payment_mode} onValueChange={v => setForm({ ...form, payment_mode: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Contact Name</Label>
                <Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} placeholder="Vendor, Customer, or Employee" className="mt-1" />
              </div>
              <div>
                <Label>Reference No / Cheque No</Label>
                <Input value={form.reference_no} onChange={e => setForm({ ...form, reference_no: e.target.value })} placeholder="Optional" className="mt-1" />
              </div>
              <div className="col-span-2">
                <Label>Narration / Memo</Label>
                <Input value={form.narration} onChange={e => setForm({ ...form, narration: e.target.value })} placeholder="Overall voucher description" className="mt-1" />
              </div>
            </div>

            


            {/* Entries table */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <Label>Ledger Entries *</Label>
                <Button variant="outline" size="sm" onClick={addEntry}><Plus className="w-4 h-4 mr-1" /> Add Row</Button>
              </div>
              <div className="border border-border rounded-lg overflow-x-auto">
                <table className="table-fluid-grid text-sm">
                  <thead className="cell-density bg-muted/50"><tr>
                    <th className="cell-density text-left w-2/5">Account</th>
                    {form.voucher_type === 'Journal' && <th className="cell-density text-right w-1/6">Debit</th>}
                    {form.voucher_type === 'Journal' && <th className="cell-density text-right w-1/6">Credit</th>}
                    {form.voucher_type !== 'Journal' && <th className="cell-density text-right w-1/5">Amount</th>}
                    <th className="cell-density text-left">Line Narration</th>
                    <th className="cell-density w-10"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-border">
                    {form.entries.map((e, i) => {
                      return (
                        <tr key={i}>
                          <td className="cell-density ">
                            <div className="flex items-center gap-1">
                              <div className="flex-1 min-w-[200px]">
                                <SearchableSelect
                                  options={targetAccounts.map(a => ({ value: a.id, label: `${a.account_name} (${a.account_type})` }))}
                                  value={e.account_id}
                                  onChange={v => {
                                    const a = allAccounts.find(x => x.id === v);
                                    handleEntry(i, 'account_id', v);
                                    handleEntry(i, 'account_name', a?.account_name);
                                    handleEntry(i, 'account_code', a?.account_code);
                                    handleEntry(i, 'account_type', a?.account_type);
                                  }}
                                  placeholder="Select account"
                                />
                              </div>
                              {(() => {
                                if (settings.enable_bill_wise_entry === false) return null;
                                if (form.voucher_type !== 'Receipt' && form.voucher_type !== 'Payment') return null;
                                if (!e.account_id) return null;
                                const showIcon = partnerAccounts.has(e.account_id);
                                if (showIcon) {
                                  return (
                                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0 text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors focus:ring-2 focus:ring-blue-500" onClick={() => openPendingBills(i)} title="Bill-Wise Allocation">
                                      <ListChecks className="w-4 h-4" />
                                    </Button>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </td>
                          {form.voucher_type === 'Journal' ? (
                            <>
                              <td className="cell-density "><Input type="number" min={0} value={e.debit || ''} onChange={ev => handleEntry(i, 'debit', ev.target.value)} disabled={e.credit > 0} className="text-right h-8" placeholder="0" /></td>
                              <td className="cell-density "><Input type="number" min={0} value={e.credit || ''} onChange={ev => handleEntry(i, 'credit', ev.target.value)} disabled={e.debit > 0} className="text-right h-8" placeholder="0" /></td>
                            </>
                          ) : (
                            <td className="cell-density ">
                              <Input type="number" min={0} value={e.debit || ''} onChange={ev => handleEntry(i, 'debit', ev.target.value)} className="text-right h-8 font-medium" placeholder="Amount" />
                            </td>
                          )}
                          <td className="cell-density ">
                            <Input value={e.narration || ''} onChange={ev => handleEntry(i, 'narration', ev.target.value)} className="h-8" placeholder="Line note" />
                          </td>
                          <td className="cell-density text-center">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeEntry(i)}><Trash2 className="w-4 h-4" /></Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-2 text-sm font-semibold text-foreground">
                Total Debit: {fmt(form.total_amount)}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="outline" onClick={() => save('Draft')} disabled={saving}>Save Draft</Button>
              <Button onClick={() => save('Posted')} disabled={saving}>Post Voucher</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      
      {/* Pending Bills Modal */}
      <Dialog open={pendingBillsModalOpen} onOpenChange={setPendingBillsModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Pending Bills</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex justify-between items-center text-sm">
              <div>Voucher Total: <strong>{fmt(form.total_amount)}</strong></div>
              <div>Allocated: <strong>{fmt(billAllocations.reduce((s, a) => s + a.allocated_amount, 0))}</strong></div>
              <Button size="sm" variant="outline" onClick={autoAllocate}>Auto Allocate (FIFO)</Button>
            </div>
            
            {loadingBills ? <div className="p-4 text-center">Loading...</div> : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="table-fluid-grid text-sm">
                  <thead className="cell-density bg-muted/50">
                    <tr>
                      <th className="cell-density text-left">Date</th>
                      <th className="cell-density text-left">Invoice #</th>
                      <th className="cell-density text-left">Contact</th>
                      <th className="cell-density text-right">Total</th>
                      <th className="cell-density text-right">Due</th>
                      <th className="cell-density text-right w-40 min-w-[150px]">Allocate Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pendingBills.length === 0 ? (
                      <tr><td colSpan="6" className="text-center py-4 text-muted-foreground">No pending bills found.</td></tr>
                    ) : (
                      pendingBills.map(bill => {
                        const due = bill.grand_total - (bill.paid_amount || 0);
                        const alloc = billAllocations.find(a => a.invoice_id === bill.id)?.allocated_amount || 0;
                        return (
                          <tr key={bill.id}>
                            <td className="cell-density">{bill.invoice_date}</td>
                            <td className="cell-density">{bill.invoice_number}</td>
                            <td className="cell-density">{bill.customer_name || bill.supplier_name}</td>
                            <td className="cell-density text-right">{fmt(bill.grand_total)}</td>
                            <td className="cell-density text-right">{fmt(due)}</td>
                            <td className="cell-density">
                              <Input 
                                type="number" min={0} max={due}
                                value={alloc || ''} 
                                onChange={e => handleBillAllocationChange(bill, Number(e.target.value))}
                                className="text-right h-8"
                                placeholder="0"
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
            
            <div className="flex justify-end gap-3 pt-2">
              <Button onClick={() => {
                setPendingBillsModalOpen(false);
                const totalAlloc = billAllocations.reduce((s, a) => s + a.allocated_amount, 0);
                if (totalAlloc > 0 && activeAllocationRow !== null) {
                  const entries = [...form.entries];
                  if (entries[activeAllocationRow]) {
                     entries[activeAllocationRow].debit = totalAlloc;
                  }
                  const total = entries.reduce((s, e) => s + (e.debit || 0), 0);
                  setForm(prev => ({ ...prev, entries, total_amount: total }));
                }
              }}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={closeViewDetail}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div>Voucher — {selected?.voucher_number}</div>
              {selected?._isViewMode && (
                <span className="text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded border border-blue-200 dark:border-blue-800">
                  View Mode
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 text-sm">
              <div id="voucher-content" className="space-y-4 p-4 bg-card">
                <div className="text-center border-b pb-4 mb-4">
                  <h2 className="text-lg font-bold uppercase">{selected.voucher_type} VOUCHER</h2>
                  <p className="text-sm text-muted-foreground">{selected.voucher_number}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><span className="text-muted-foreground">Type:</span> <strong>{selected.voucher_type}</strong></div>
                  <div><span className="text-muted-foreground">Date:</span> <strong><DualDateDisplay date={selected.voucher_date} /></strong></div>
                  <div><span className="text-muted-foreground">Contact:</span> <strong>{selected.contact_name || '—'}</strong></div>
                  <div><span className="text-muted-foreground">Created:</span> <strong>{selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'}</strong></div>
                  <div><span className="text-muted-foreground">Mode:</span> <strong>{selected.payment_mode}</strong></div>
                  <div><span className="text-muted-foreground">Ref No:</span> <strong>{selected.reference_no || '—'}</strong></div>
                  <div><span className="text-muted-foreground">Status:</span> <strong>{selected.status}</strong></div>
                </div>
                <div>
                  <p className="font-medium mb-2">Ledger Entries</p>
                  <table className="table-fluid-grid border rounded-lg overflow-hidden text-xs">
                    <thead className="cell-density bg-muted/50"><tr>
                      <th className="cell-density text-left">Account</th>
                      <th className="cell-density text-left">Type</th>
                      <th className="cell-density text-right">Debit</th>
                      <th className="cell-density text-right">Credit</th>
                    </tr></thead>
                    <tbody className="divide-y divide-border">
                      {(selected.entries || []).map((e, i) => (
                        <tr key={i}>
                          <td className="cell-density ">{e.account_name}</td>
                          <td className="cell-density ">{e.account_type}</td>
                          <td className="cell-density text-right">{fmt(e.debit)}</td>
                          <td className="cell-density text-right">{fmt(e.credit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-right font-semibold">Total: {fmt(selected.total_amount)}</div>
              </div>

              {/* Action buttons — only for non-cancelled vouchers */}
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    import('jspdf').then(({ jsPDF }) => {
                      import('jspdf-autotable').then(({ default: autoTable }) => {
                        const doc = new jsPDF('p', 'pt', 'a4');
                        const margin = 40;
                        const pageWidth = doc.internal.pageSize.getWidth();
                        
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(18);
                        doc.text('FINANCIAL VOUCHER', margin, margin + 10);
                        
                        doc.setFontSize(10);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(100, 100, 100);
                        doc.text(selected.voucher_number, margin, margin + 25);
                        
                        // Right side - Company Details
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(40, 40, 40);
                        const companyObj = activeCompany || settings || {};
                        const rightText = companyObj.name || companyObj.company_name || 'Company Name';
                        doc.text(rightText, pageWidth - margin - doc.getTextWidth(rightText), margin + 10);
                        
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(10);
                        doc.setTextColor(100, 100, 100);
                        let compY = margin + 22;
                        if (companyObj.address) {
                          doc.text(companyObj.address, pageWidth - margin - doc.getTextWidth(companyObj.address), compY);
                          compY += 12;
                        }
                        if (companyObj.email) {
                          doc.text(companyObj.email, pageWidth - margin - doc.getTextWidth(companyObj.email), compY);
                          compY += 12;
                        }
                        if (companyObj.phone) {
                          doc.text(companyObj.phone, pageWidth - margin - doc.getTextWidth(companyObj.phone), compY);
                          compY += 12;
                        }
                        if (companyObj.tax_number || companyObj.vat_number) {
                          const vatText = `VAT/TAX No: ${companyObj.tax_number || companyObj.vat_number}`;
                          doc.text(vatText, pageWidth - margin - doc.getTextWidth(vatText), compY);
                        }

                        doc.setTextColor(40, 40, 40);
                        
                        // Details
                        let currentY = Math.max(margin + 60, compY + 20);
                        doc.setFontSize(10);
                        // Note: Using settings?.display_bs_date if DateFormatContext is not easily available in this callback
                        const displayBs = settings?.display_bs_date || false;
                        const formattedDate = formatDualDateString(selected.voucher_date, displayBs);
                        doc.text(`Date: ${formattedDate}`, margin, currentY);
                        doc.text(`Type: ${selected.voucher_type}`, margin, currentY + 15);
                        if (selected.contact_name) {
                          doc.text(`Contact: ${selected.contact_name}`, margin, currentY + 30);
                        }
                        
                        currentY += 50;
                        
                        // Table
                        const tableRows = (selected.entries || []).map(e => [
                          e.account_name || '',
                          e.account_type || '',
                          Number(e.debit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }),
                          Number(e.credit || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })
                        ]);
                        
                        autoTable(doc, {
                          startY: currentY,
                          head: [['Account', 'Type', 'Debit', 'Credit']],
                          body: tableRows,
                          theme: 'grid',
                          headStyles: { fillColor: [59, 130, 246] }, // blue-500
                          columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } }
                        });
                        
                        // Totals
                        const finalY = doc.lastAutoTable.finalY + 20;
                        doc.setFont('helvetica', 'bold');
                        doc.text('Total:', pageWidth - margin - 150, finalY);
                        const totalStr = Number(selected.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
                        doc.text(totalStr, pageWidth - margin - doc.getTextWidth(totalStr), finalY);
                        
                        // Notes
                        if (selected.notes) {
                          doc.setFont('helvetica', 'normal');
                          doc.setTextColor(100, 100, 100);
                          doc.text('Notes:', margin, finalY + 30);
                          const splitNotes = doc.splitTextToSize(selected.notes, pageWidth - margin * 2);
                          doc.text(splitNotes, margin, finalY + 45);
                        }
                        
                        doc.save(`Voucher_${selected.voucher_number}.pdf`);
                      });
                    });
                  }}
                >
                  Download PDF
                </Button>
                {selected.status !== 'Cancelled' && !selected._isViewMode && (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-500/30 hover:bg-amber-50 dark:bg-amber-500/10"
                      onClick={() => { setActionReason(''); setActionDialog('reverse'); }}
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reverse Voucher
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-red-600 dark:text-red-400 border-red-300 dark:border-red-500/30 hover:bg-red-50 dark:bg-red-500/10"
                      onClick={() => { setActionReason(''); setActionDialog('delete'); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Voucher
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete / Reverse Confirmation Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={v => { if (!v) setActionDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${actionDialog === 'delete' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {actionDialog === 'delete' ? <Trash2 className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              {actionDialog === 'delete' ? 'Delete Voucher' : 'Reverse Voucher'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className={`flex items-start gap-2 rounded-lg p-3 border ${actionDialog === 'delete' ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20' : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'}`}>
              <TriangleAlert className={`w-4 h-4 mt-0.5 shrink-0 ${actionDialog === 'delete' ? 'text-red-500' : 'text-amber-500'}`} />
              <div className="text-sm">
                {actionDialog === 'delete' ? (
                  <p className="font-medium text-red-800 dark:text-red-300">
                    This will permanently delete <strong>{selected?.voucher_number}</strong> and reverse any GL postings. This action cannot be undone.
                  </p>
                ) : (
                  <p className="font-medium text-amber-800 dark:text-amber-300">
                    This will create a <strong>reversal entry</strong> (REV-{selected?.voucher_number}) with opposite debit/credit lines, and mark the original as Cancelled.
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label>Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                className="mt-1"
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder={actionDialog === 'delete' ? 'Reason for deletion…' : 'Reason for reversal…'}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActionDialog(null)} disabled={actionProcessing}>Cancel</Button>
              <Button
                variant={actionDialog === 'delete' ? 'destructive' : 'default'}
                className={actionDialog === 'reverse' ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
                onClick={actionDialog === 'delete' ? handleDelete : handleReverse}
                disabled={actionProcessing}
              >
                {actionProcessing
                  ? (actionDialog === 'delete' ? 'Deleting…' : 'Reversing…')
                  : (actionDialog === 'delete' ? 'Confirm Delete' : 'Confirm Reverse')
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}