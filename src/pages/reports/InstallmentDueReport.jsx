import React, { useState, useEffect, useMemo } from 'react';
import { sajilo, supabase } from '@/api/sajiloClient';
import { ReportPageTemplate, StandardReportTable } from '@/components/reports';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { exportFlatXLSX, exportAuditLogXLSX } from '@/lib/reports/reportExcelExport';
import { generateReportVectorPDF } from '@/utils/reportPdfEngine';
import VoucherLink from '@/components/shared/VoucherLink';
import DualDateDisplay from '@/components/shared/DualDateDisplay';
import ReschedulePaymentModal from '@/components/invoices/ReschedulePaymentModal';
import DueDateHistoryDrawer from '@/components/invoices/DueDateHistoryDrawer';
import { allocateInstallmentReceipt } from '@/lib/invoiceDueDateService';
import { format } from 'date-fns';
import { 
  Calendar, Clock, DollarSign, AlertTriangle, 
  History, CheckCircle2, ChevronRight, Search 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/shared/SearchableSelect';
import DateInput from '@/components/shared/DateInput';
import { toast } from 'sonner';

export default function InstallmentDueReport() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    fromDate: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
    toDate: format(new Date(Date.now() + 90 * 86400000), 'yyyy-MM-dd'),
  });

  // Action Modals State
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [payTarget, setPayTarget] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payAccount, setPayAccount] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payDate, setPayDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [accounts, setAccounts] = useState([]);
  const [savingPayment, setSavingPayment] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('InvoiceInstallment')
        .select('*')
        .eq('company_id', sajilo.getCompanyId())
        .eq('is_deleted', false)
        .neq('status', 'Paid')
        .order('due_date', { ascending: true });

      const { data: installments, error } = await query;
      if (error) throw error;

      const today = new Date().toISOString().split('T')[0];

      const formatted = (installments || []).map((item, idx) => {
        const balance = Math.max(0, Number(item.total_amount) - Number(item.paid_amount || 0));
        let overdueDays = 0;
        if (item.due_date && item.due_date < today) {
          const diff = new Date(today).getTime() - new Date(item.due_date).getTime();
          overdueDays = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
        }

        return {
          ...item,
          sn: idx + 1,
          balance,
          overdueDays,
          isOverdue: overdueDays > 0,
        };
      });

      setData(formatted);
    } catch (err) {
      console.error('Error loading installments:', err);
      toast.error(err.message || 'Failed to load installment due list');
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const accs = await sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 500);
      const cash = accs.filter(a => a.ledger_type === 'Sub Ledger' && (
        (a.account_subtype || '').toLowerCase().includes('cash') ||
        (a.account_name || '').toLowerCase().includes('cash') ||
        (a.account_name || '').toLowerCase().includes('bank')
      ));
      setAccounts(cash);
      if (cash.length > 0 && !payAccount) setPayAccount(cash[0].id);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
    loadAccounts();
  }, []);

  // Filtered dataset
  const filtered = useMemo(() => {
    return data.filter(item => {
      // Status filter
      if (statusFilter === 'Overdue' && !item.isOverdue) return false;
      if (statusFilter === 'Pending' && (item.isOverdue || item.status === 'Rescheduled')) return false;
      if (statusFilter === 'Rescheduled' && item.status !== 'Rescheduled') return false;
      if (statusFilter === 'Day0' && !item.is_down_payment) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (item.partner_name || '').toLowerCase().includes(q);
        const matchesInv = (item.invoice_number || '').toLowerCase().includes(q);
        if (!matchesName && !matchesInv) return false;
      }

      return true;
    });
  }, [data, statusFilter, searchQuery]);

  // Executive KPIs
  const kpis = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const sevenDays = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];

    const overdueSum = data.filter(d => d.isOverdue).reduce((s, d) => s + d.balance, 0);
    const next7DaysSum = data.filter(d => !d.isOverdue && d.due_date >= today && d.due_date <= sevenDays).reduce((s, d) => s + d.balance, 0);
    const thisMonthSum = data.filter(d => !d.isOverdue && d.due_date >= today && d.due_date <= endOfMonth).reduce((s, d) => s + d.balance, 0);
    const rescheduledCount = data.filter(d => d.revision_count > 0).length;

    return { overdueSum, next7DaysSum, thisMonthSum, rescheduledCount };
  }, [data]);

  const fmt = (n) => `NPR ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  const handleOpenPay = (item) => {
    setPayTarget(item);
    setPayAmount(item.balance.toString());
    setPayDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleExecutePayment = async () => {
    if (!payAccount) return toast.error('Select a Cash/Bank account');
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return toast.error('Enter a valid payment amount');

    setSavingPayment(true);
    try {
      const voucherNum = `RV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

      // 1. Create Financial Voucher
      const voucher = await sajilo.entities.FinancialVoucher.create({
        voucher_type: 'Receipt',
        voucher_date: payDate,
        voucher_number: voucherNum,
        contact_name: payTarget.partner_name,
        payment_mode: 'Bank Transfer',
        reference_no: payReference,
        narration: `EMI Installment #${payTarget.installment_no} Receipt for Invoice ${payTarget.invoice_number}`,
        total_amount: amt,
        status: 'Posted',
        source_account_id: payAccount,
        bill_allocations: JSON.stringify([{
          invoice_id: payTarget.invoice_id,
          installment_no: payTarget.installment_no,
          allocated_amount: amt
        }])
      });

      // 2. Execute Atomic Waterfall Allocation with Bound Interest Micro-Journal
      await allocateInstallmentReceipt({
        p_company_id: sajilo.getCompanyId(),
        p_invoice_id: payTarget.invoice_id,
        p_receipt_voucher_id: voucher.id,
        p_receipt_amount: amt,
        p_voucher_number: voucherNum,
        p_receipt_date: payDate
      });

      toast.success('Installment payment collected and allocated');
      setPayTarget(null);
      loadData();
    } catch (e) {
      console.error(e);
      toast.error(e.message || 'Payment failed');
    } finally {
      setSavingPayment(false);
    }
  };

  const columns = [
    { key: 'sn', label: 'S.N.', width: '50px' },
    { key: 'partner_name', label: 'Customer' },
    { 
      key: 'invoice_number', 
      label: 'Invoice #', 
      render: (v) => v ? <VoucherLink voucherNumber={v}><span className="text-primary hover:underline font-mono cursor-pointer">{v}</span></VoucherLink> : '—' 
    },
    { 
      key: 'installment_no', 
      label: 'Slice #', 
      render: (v, row) => (
        row.is_down_payment ? (
          <span className="font-semibold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 rounded text-[11px]">
            Inst #0 (Down Payment)
          </span>
        ) : (
          <span className="font-mono font-medium">Inst #{v}</span>
        )
      )
    },
    { 
      key: 'due_date', 
      label: 'Due Date', 
      render: (v) => <DualDateDisplay date={v} /> 
    },
    { 
      key: 'overdueDays', 
      label: 'Overdue', 
      render: (v) => (
        v > 0 ? (
          <span className="font-bold text-red-600 bg-red-100 dark:bg-red-950/40 px-2 py-0.5 rounded text-[11px]">
            {v} Days Late
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">Current</span>
        )
      )
    },
    { 
      key: 'total_amount', 
      label: 'EMI Total', 
      render: (v) => <span className="font-mono font-medium">{fmt(v)}</span> 
    },
    { 
      key: 'paid_amount', 
      label: 'Paid', 
      render: (v) => <span className="font-mono text-muted-foreground">{fmt(v)}</span> 
    },
    { 
      key: 'balance', 
      label: 'Balance Due', 
      render: (v) => <span className="font-mono font-bold text-foreground">{fmt(v)}</span> 
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="default" className="h-7 text-xs px-2.5" onClick={() => handleOpenPay(row)}>
            <DollarSign className="w-3.5 h-3.5 mr-1" /> Pay
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs px-2" title="Reschedule Due Date" onClick={() => setRescheduleTarget(row)}>
            <Calendar className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" title="Revision History" onClick={() => setHistoryTarget(row)}>
            <History className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        </div>
      )
    }
  ];

  return (
    <ReportPageTemplate
      title="Installment Due Report (EMI)"
      subtitle="Track periodic payment maturities, Day 0 down payment arrears, and overdue EMI slices"
      category="Receivable"
      icon={Calendar}
      isLoading={loading}
      onRefresh={loadData}
      filterSlot={
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            {[
              { key: 'all', label: 'All Due' },
              { key: 'Overdue', label: 'Overdue' },
              { key: 'Day0', label: 'Day 0 Down Payments' },
              { key: 'Pending', label: 'Current' },
              { key: 'Rescheduled', label: 'Rescheduled' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === f.key ? 'bg-primary text-white shadow-xs' : 'bg-card border border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer or invoice..."
              className="pl-8 text-xs h-9"
            />
          </div>
        </div>
      }
      metricsSlot={
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">Total Overdue EMI</span>
            <div className="text-xl font-bold font-mono text-red-900 dark:text-red-200 mt-1">{fmt(kpis.overdueSum)}</div>
          </div>
          <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Due in Next 7 Days</span>
            <div className="text-xl font-bold font-mono text-amber-900 dark:text-amber-200 mt-1">{fmt(kpis.next7DaysSum)}</div>
          </div>
          <div className="bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-2xl p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">Due This Month</span>
            <div className="text-xl font-bold font-mono text-blue-900 dark:text-blue-200 mt-1">{fmt(kpis.thisMonthSum)}</div>
          </div>
          <div className="bg-purple-50/80 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 rounded-2xl p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-400">Rescheduled Slices</span>
            <div className="text-xl font-bold font-mono text-purple-900 dark:text-purple-200 mt-1">{kpis.rescheduledCount} <span className="text-xs font-normal">slices</span></div>
          </div>
        </div>
      }
    >
      <StandardReportTable
        columns={columns}
        data={filtered}
        loading={loading}
        footer={filtered.length > 0 ? {
          partner_name: 'TOTAL OUTSTANDING',
          total_amount: fmt(filtered.reduce((s, r) => s + (r.total_amount || 0), 0)),
          paid_amount: fmt(filtered.reduce((s, r) => s + (r.paid_amount || 0), 0)),
          balance: fmt(filtered.reduce((s, r) => s + (r.balance || 0), 0))
        } : null}
      />

      {/* QUICK RECEIVE PAYMENT MODAL */}
      <Dialog open={!!payTarget} onOpenChange={() => setPayTarget(null)}>
        <DialogContent className="max-w-md z-40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" /> Collect Installment Payment
            </DialogTitle>
          </DialogHeader>
          {payTarget && (
            <div className="space-y-4 mt-2">
              <div className="bg-muted/40 p-3 rounded-xl border border-border text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="font-semibold">{payTarget.partner_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice:</span>
                  <span className="font-mono font-semibold">{payTarget.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Installment Slice:</span>
                  <span className="font-medium">
                    {payTarget.is_down_payment ? 'Inst #0 (Down Payment)' : `Inst #${payTarget.installment_no}`}
                  </span>
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium">Receipt Date</Label>
                <DateInput value={payDate} onChange={setPayDate} className="mt-1" />
              </div>

              <div>
                <Label className="text-xs font-medium">Deposit Account (Bank/Cash) *</Label>
                <Select value={payAccount} onValueChange={setPayAccount}>
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue placeholder="Select Account" />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    {accounts.map(acc => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.account_name} ({acc.account_code || 'Cash/Bank'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-medium">Amount to Collect (NPR) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="mt-1 font-mono font-bold text-base"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Slice Due: {fmt(payTarget.balance)} (Surplus automatically waterfalls to next slice)
                </p>
              </div>

              <div>
                <Label className="text-xs font-medium">Payment Reference / Cheque No</Label>
                <Input
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  placeholder="e.g. Cheque #44210 or Fonepay TXN"
                  className="mt-1 text-xs"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button>
                <Button onClick={handleExecutePayment} disabled={savingPayment}>
                  {savingPayment ? 'Processing...' : 'Confirm Receipt'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* RESCHEDULE PAYMENT MODAL */}
      <ReschedulePaymentModal
        isOpen={!!rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        invoice={rescheduleTarget ? { id: rescheduleTarget.invoice_id, invoice_number: rescheduleTarget.invoice_number, customer_name: rescheduleTarget.partner_name, company_id: rescheduleTarget.company_id } : null}
        installment={rescheduleTarget}
        allInstallments={data.filter(d => d.invoice_id === rescheduleTarget?.invoice_id)}
        onSuccess={loadData}
      />

      {/* REVISION AUDIT DRAWER */}
      <DueDateHistoryDrawer
        isOpen={!!historyTarget}
        onClose={() => setHistoryTarget(null)}
        invoice={historyTarget ? { id: historyTarget.invoice_id, invoice_number: historyTarget.invoice_number, customer_name: historyTarget.partner_name } : null}
        installment={historyTarget}
      />
    </ReportPageTemplate>
  );
}
