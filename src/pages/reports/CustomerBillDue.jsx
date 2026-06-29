import { useState, useEffect } from 'react';
import { sajilo, supabase } from '@/api/sajiloClient';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import { FileText, DollarSign, Eye, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SearchableSelect from '@/components/shared/SearchableSelect';
import { toast } from 'sonner';
import { postFinancialVoucher } from '@/lib/glPostingService';
import VoucherLink from '@/components/shared/VoucherLink';

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

export default function CustomerBillDue() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cashAccounts, setCashAccounts] = useState([]);

  // Quick Payment Modal State
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [payForm, setPayForm] = useState({ date: new Date().toISOString().split('T')[0], amount: 0, account_id: '', reference: '' });
  const [saving, setSaving] = useState(false);

  // View Allocation Modal State
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  // Reconciliation Engine State
  const [reconModalOpen, setReconModalOpen] = useState(false);
  const [unallocatedVouchers, setUnallocatedVouchers] = useState([]);
  const [stagedKnockoffs, setStagedKnockoffs] = useState([]);
  const [selectedReconBill, setSelectedReconBill] = useState('');
  const [selectedReconVoucher, setSelectedReconVoucher] = useState('');
  const [reconAmount, setReconAmount] = useState(0);

  const [contactFilter, setContactFilter] = useState('');
  const [partners, setPartners] = useState([]);


  const [allocations, setAllocations] = useState([]);

  useEffect(() => {
    load();
    loadAccounts();
  }, []);

  async function loadAccounts() {
    const res = await sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 1000);
    const cash = res.filter(a => a.ledger_type === 'Sub Ledger' && a.account_type === 'Asset' && (
      (a.account_subtype || '').toLowerCase().includes('cash') ||
      (a.account_name || '').toLowerCase().includes('cash') ||
      (a.account_name || '').toLowerCase().includes('bank') ||
      (a.account_name || '').toLowerCase().includes('petty')
    ));
    setCashAccounts(cash);
  }

  async function load() {
    setLoading(true);
    const { data: invoices } = await supabase
      .from('SalesInvoice')
      .select('*')
      .eq('status', 'Posted')
      .neq('payment_status', 'Paid')
      .order('invoice_date', { ascending: true });

    const formatted = (invoices || []).map((inv, idx) => {
      const due = inv.grand_total - (inv.paid_amount || 0);
      let daysOverDue = 0;
      if (inv.due_date) {
        const diffTime = new Date().getTime() - new Date(inv.due_date).getTime();
        daysOverDue = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
      }
      return { ...inv, sn: idx + 1, due, daysOverDue };
    });
    setData(formatted);
    setLoading(false);
  }

  const openPayModal = (bill) => {
    setSelectedBill(bill);
    setPayForm({ date: new Date().toISOString().split('T')[0], amount: bill.due, account_id: '', reference: '' });
    setPayModalOpen(true);
  };

  const handlePay = async () => {
    if (!payForm.account_id) return toast.error('Select a Cash/Bank account');
    if (payForm.amount <= 0 || payForm.amount > selectedBill.due) return toast.error('Invalid amount');
    setSaving(true);
    try {
      const compSettings = await sajilo.entities.CompanySettings.list();
      const settings = compSettings[0] || {};
      
      const arId = selectedBill.receivable_account_id || settings.gl_accounts_receivable_id;
      if (!arId) throw new Error("AR Account not mapped in settings or invoice");

      const targetAccount = cashAccounts.find(a => a.id === payForm.account_id);

      // 1. Create Financial Voucher
      const voucher_number = `RV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
      const allocations = [{
        invoice_id: selectedBill.id, invoice_number: selectedBill.invoice_number, 
        invoice_date: selectedBill.invoice_date, total: selectedBill.grand_total, 
        due: selectedBill.due, allocated_amount: Number(payForm.amount)
      }];

      const voucher = await sajilo.entities.FinancialVoucher.create({
        voucher_type: 'Receipt',
        voucher_date: payForm.date,
        voucher_number,
        contact_name: selectedBill.customer_name,
        payment_mode: 'Bank Transfer',
        reference_no: payForm.reference,
        narration: `Receipt against Invoice ${selectedBill.invoice_number}`,
        total_amount: Number(payForm.amount),
        status: 'Posted',
        bill_allocations: JSON.stringify(allocations)
      });

      // 2. Post to GL
      const lines = [
        { account_id: payForm.account_id, debit: Number(payForm.amount), credit: 0, narration: 'Amount Received' },
        { account_id: arId, debit: 0, credit: Number(payForm.amount), narration: `Against ${selectedBill.invoice_number}` }
      ];
      
      const idempotencyKey = crypto.randomUUID();
      const linesToPost = lines.map(e => ({ account_id: e.account_id, debit_amount: e.debit, credit_amount: e.credit, description: e.narration }));
      await postFinancialVoucher({ ...voucher, lines: linesToPost }, false, idempotencyKey);

      // 3. Update Invoice Paid Amount
      const newPaid = (selectedBill.paid_amount || 0) + Number(payForm.amount);
      const newStatus = newPaid >= selectedBill.grand_total ? 'Paid' : 'Partial Paid';
      await supabase.from('SalesInvoice').update({ paid_amount: newPaid, payment_status: newStatus }).eq('id', selectedBill.id);

      toast.success('Payment Received & Allocated');
      setPayModalOpen(false);
      load();
    } catch(e) {
      toast.error(e.message || 'Payment failed');
    } finally {
      setSaving(false);
    }
  };

  const viewAllocations = async (bill) => {
    // Find all FinancialVouchers that contain this bill in allocations
    // For simplicity since JSONB querying is complex, we just fetch Receipts for this customer and filter locally
    const { data: receipts } = await supabase.from('FinancialVoucher').select('voucher_number, voucher_date, total_amount, bill_allocations').eq('voucher_type', 'Receipt').eq('status', 'Posted').eq('contact_name', bill.customer_name);
    const related = [];
    (receipts || []).forEach(r => {
      if (!r.bill_allocations) return;
      try {
        const parsed = typeof r.bill_allocations === 'string' ? JSON.parse(r.bill_allocations) : r.bill_allocations;
        const alloc = parsed.find(a => a.invoice_id === bill.id);
        if (alloc) related.push({ voucher: r.voucher_number, date: r.voucher_date, amount: alloc.allocated_amount });
      } catch(e) {}
    });
    setAllocations(related);
    setSelectedBill(bill);
    setAllocModalOpen(true);
  };

  
  const openReconModal = async () => {
    setReconModalOpen(true);
    const vType = 'Receipt';
    const { data: fv } = await supabase.from('FinancialVoucher')
      .select('*')
      .in('voucher_type', ['Receipt', 'Payment', 'Journal'])
      .eq('status', 'Posted');
      
    const { data: glj } = await supabase.from('GeneralLedgerJournal')
      .select('*, entries:GeneralLedgerLine(*)')
      .eq('status', 'Posted');
      
    const mappedGlj = (glj || []).map(g => ({
       ...g,
       total_amount: g.total_debit,
       voucher_number: g.voucher_no,
       voucher_type: 'Journal',
       is_gl_journal: true
    }));
    
    const vouchers = [...(fv || []), ...mappedGlj];
      
    const { data: pData } = await supabase.from('BusinessPartner').select('id, name').eq('is_customer', true);
    setPartners(pData || []);
    setContactFilter('');

    
    const unallocated = (vouchers || []).map(v => {
      let allocSum = 0;
      if (v.bill_allocations) {
        try {
          const arr = typeof v.bill_allocations === 'string' ? JSON.parse(v.bill_allocations) : v.bill_allocations;
          arr.forEach(a => allocSum += Number(a.allocated_amount || 0));
        } catch(e){}
      }
      const remain = v.total_amount - allocSum;
      return { ...v, remain };
    }).filter(v => v.remain > 0);
    
    setUnallocatedVouchers(unallocated);
    setStagedKnockoffs([]);
    setSelectedReconBill('');
    setSelectedReconVoucher('');
    setReconAmount(0);
  };

  const handleStage = () => {
    if(!selectedReconBill || !selectedReconVoucher || reconAmount <= 0) return toast.error('Invalid selection');
    const bill = data.find(d => d.id === selectedReconBill);
    const voucher = unallocatedVouchers.find(v => v.id === selectedReconVoucher);
    if(!bill || !voucher) return;
    
    if (reconAmount > bill.due || reconAmount > voucher.remain) return toast.error('Amount exceeds due or remaining balance');

    setStagedKnockoffs([...stagedKnockoffs, {
      invoice_id: bill.id, invoice_number: bill.invoice_number,
      voucher_id: voucher.id, voucher_number: voucher.voucher_number,
      allocated_amount: Number(reconAmount)
    }]);
    
    // Decrease locally for further staging
    bill.due -= Number(reconAmount);
    voucher.remain -= Number(reconAmount);
    setSelectedReconBill('');
    setSelectedReconVoucher('');
    setReconAmount(0);
  };

  const commitKnockoffs = async () => {
    if (stagedKnockoffs.length === 0) return;
    setSaving(true);
    try {
      const compSettings = await sajilo.entities.CompanySettings.list();
      const payload = {
        p_company_id: compSettings[0]?.company_id || sajilo.getCompanyId(),
        p_type: 'Customer',
        p_allocations: stagedKnockoffs.map(s => ({ invoice_id: s.invoice_id, voucher_id: s.voucher_id, allocated_amount: s.allocated_amount }))
      };
      const { error } = await supabase.rpc('rpc_retroactive_bill_knockoff', payload);
      if (error) throw error;
      toast.success('Advances Settled Successfully');
      setReconModalOpen(false);
      load();
    } catch(e) {
      toast.error(e.message || 'Settlement failed');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: 'sn', label: 'S.N.' },
    { key: 'customer_name', label: 'Customer' },
    { key: 'invoice_number', label: 'Invoice No' },
    { key: 'invoice_date', label: 'Invoice Date', isDate: true },
    { key: 'due_date', label: 'Due Date', isDate: true },
    { key: 'daysOverDue', label: 'Days Over Due', render: v => <span className={v > 0 ? "text-red-600 font-bold" : ""}>{v}</span> },
    { key: 'grand_total', label: 'Bill Total', render: v => fmt(v) },
    { key: 'paid_amount', label: 'Payment', render: v => fmt(v) },
    { key: 'due', label: 'Balance Due', render: v => <span className="font-bold">{fmt(v)}</span> },
    { key: 'actions', label: 'Action', render: (_, row) => (
      <div className="flex gap-2">
        <Button size="sm" onClick={() => openPayModal(row)}><DollarSign className="w-4 h-4 mr-1"/> Receive Payment</Button>
        <Button size="sm" variant="outline" onClick={() => viewAllocations(row)}><Eye className="w-4 h-4 mr-1"/> View Allocation</Button>
      </div>
    )}
  ];

  return (
    <div>
      <PageHeader title="Customer Bill Due" subtitle="Track and receive payments for outstanding customer invoices" icon={FileText}  action={openReconModal} actionLabel="Settle Advances" actionIcon={Activity} />
      <DataTable columns={columns} data={data} searchKey="customer_name" loading={loading} />

      {/* Pay Modal */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Receive Payment for {selectedBill?.invoice_number}</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Date</Label>
              <Input type="date" value={payForm.date} onChange={e => setPayForm({...payForm, date: e.target.value})} className="mt-1" />
            </div>
            <div>
              <Label>Deposit To (Cash/Bank) *</Label>
              <SearchableSelect 
                options={cashAccounts.map(a => ({ value: a.id, label: `${a.account_name} (${a.account_type})` }))}
                value={payForm.account_id}
                onChange={v => setPayForm({...payForm, account_id: v})}
                className="mt-1"
                placeholder="Select Account"
              />
            </div>
            <div>
              <Label>Amount to Receive</Label>
              <Input type="number" min={0.01} max={selectedBill?.due} value={payForm.amount} onChange={e => setPayForm({...payForm, amount: e.target.value})} className="mt-1 font-bold text-lg" />
              <p className="text-xs text-muted-foreground mt-1">Maximum: {fmt(selectedBill?.due)}</p>
            </div>
            <div>
              <Label>Reference No (Optional)</Label>
              <Input value={payForm.reference} onChange={e => setPayForm({...payForm, reference: e.target.value})} className="mt-1" placeholder="Cheque / Transaction ID" />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setPayModalOpen(false)}>Cancel</Button>
              <Button onClick={handlePay} disabled={saving}>Confirm Payment</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Allocation Modal */}
      <Dialog open={allocModalOpen} onOpenChange={setAllocModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Allocations for {selectedBill?.invoice_number}</DialogTitle></DialogHeader>
          <div className="mt-4">
            {allocations.length === 0 ? <p className="text-muted-foreground text-sm">No payment allocations found.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left py-2">Date</th><th className="text-left py-2">Voucher</th><th className="text-right py-2">Amount</th></tr></thead>
                <tbody className="divide-y">
                  {allocations.map(a => (
                    <tr key={a.voucher}>
                      <td className="py-2">{a.date}</td>
                      <td className="py-2"><VoucherLink voucherNumber={a.voucher}><span className="text-primary hover:underline">{a.voucher}</span></VoucherLink></td>
                      <td className="text-right py-2">{fmt(a.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex justify-end pt-4"><Button onClick={() => setAllocModalOpen(false)}>Close</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reconciliation Engine Modal */}
      <Dialog open={reconModalOpen} onOpenChange={setReconModalOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Retroactive Settlement Engine</DialogTitle></DialogHeader>
          <div className="mt-4">
            <Label>Filter by Customer</Label>
            <SearchableSelect 
              options={partners.map(p => ({ value: p.name, label: p.name }))}
              value={contactFilter}
              onChange={v => { setContactFilter(v); setSelectedReconBill(''); setSelectedReconVoucher(''); }}
              placeholder="All Customers"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="border border-border p-3 rounded">
              <Label>Select Open Invoice</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mt-1" 
                      value={selectedReconBill} onChange={e => setSelectedReconBill(e.target.value)}>
                <option value="">-- Choose Invoice --</option>
                {data.filter(d => d.due > 0 && (!contactFilter || d.customer_name === contactFilter)).map(d => (
                  <option key={d.id} value={d.id}>{d.invoice_number} (Due: {fmt(d.due)})</option>
                ))}
              </select>
            </div>
            <div className="border border-border p-3 rounded">
              <Label>Select Unallocated Advance/Voucher</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mt-1" 
                      value={selectedReconVoucher} onChange={e => setSelectedReconVoucher(e.target.value)}>
                <option value="">-- Choose Voucher --</option>
                {unallocatedVouchers.filter(v => v.remain > 0 && (!contactFilter || (v.contact_name === contactFilter) || (v.entries && JSON.stringify(v.entries).includes(contactFilter)))).map(v => (
                  <option key={v.id} value={v.id}>{v.voucher_number} (Unallocated: {fmt(v.remain)})</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex items-end gap-3 mt-4">
            <div className="flex-1">
              <Label>Amount to Knock-off</Label>
              <Input type="number" min={0} value={reconAmount} onChange={e => setReconAmount(e.target.value)} className="mt-1 font-bold text-lg" />
            </div>
            <Button onClick={() => {
              const b = data.find(d => d.id === selectedReconBill);
              const v = unallocatedVouchers.find(x => x.id === selectedReconVoucher);
              if (b && v) setReconAmount(Math.min(b.due, v.remain));
            }} variant="secondary">Max</Button>
            <Button onClick={handleStage}>Stage Pair</Button>
          </div>

          <div className="mt-6 border-t pt-4">
            <h4 className="font-semibold text-sm mb-2">Staged Knock-offs</h4>
            {stagedKnockoffs.length === 0 ? <p className="text-xs text-muted-foreground">No items staged.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b"><th className="text-left py-2">Invoice</th><th className="text-left py-2">Voucher</th><th className="text-right py-2">Allocated</th></tr></thead>
                <tbody>
                  {stagedKnockoffs.map((s, i) => (
                    <tr key={i} className="border-b last:border-0"><td className="py-2">{s.invoice_number}</td><td className="py-2">{s.voucher_number}</td><td className="text-right py-2">{fmt(s.allocated_amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setReconModalOpen(false)}>Cancel</Button>
              <Button onClick={commitKnockoffs} disabled={saving || stagedKnockoffs.length === 0}>Commit Knock-offs</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
