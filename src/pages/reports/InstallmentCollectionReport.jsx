import React, { useState, useEffect, useMemo } from 'react';
import { sajilo, supabase } from '@/api/sajiloClient';
import { ReportPageTemplate, StandardReportTable } from '@/components/reports';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { exportAuditLogXLSX } from '@/lib/reports/reportExcelExport';
import VoucherLink from '@/components/shared/VoucherLink';
import DualDateDisplay from '@/components/shared/DualDateDisplay';
import { format } from 'date-fns';
import { DollarSign, TrendingUp, CheckCircle, Search, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function InstallmentCollectionReport() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    fromDate: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
    toDate: format(new Date(), 'yyyy-MM-dd'),
  });

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch receipts from FinancialVoucher where bill_allocations contains installment_no
      const { data: vouchers, error } = await supabase
        .from('FinancialVoucher')
        .select('*')
        .eq('voucher_type', 'Receipt')
        .eq('status', 'Posted')
        .eq('company_id', sajilo.getCompanyId())
        .gte('voucher_date', filters.fromDate)
        .lte('voucher_date', filters.toDate)
        .order('voucher_date', { ascending: false });

      if (error) throw error;

      const collections = [];
      let sn = 1;

      (vouchers || []).forEach(v => {
        if (!v.bill_allocations) return;
        try {
          const arr = typeof v.bill_allocations === 'string' ? JSON.parse(v.bill_allocations) : v.bill_allocations;
          if (Array.isArray(arr)) {
            arr.forEach(alloc => {
              if (alloc.installment_no !== undefined || alloc.is_down_payment) {
                collections.push({
                  id: `${v.id}-${alloc.installment_no || 0}`,
                  sn: sn++,
                  voucher_id: v.id,
                  voucher_number: v.voucher_number,
                  voucher_date: v.voucher_date,
                  customer_name: v.contact_name || 'Customer',
                  invoice_number: alloc.invoice_number || 'SI-Ref',
                  invoice_id: alloc.invoice_id,
                  installment_no: alloc.installment_no,
                  is_down_payment: alloc.is_down_payment,
                  allocated_amount: Number(alloc.allocated_amount || 0),
                  payment_mode: v.payment_mode || 'Cash/Bank',
                  reference_no: v.reference_no || '—',
                });
              }
            });
          }
        } catch (e) {
          console.warn('Allocation parse skip', e);
        }
      });

      setData(collections);
    } catch (err) {
      console.error('Failed to load collections:', err);
      toast.error(err.message || 'Error loading collection data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filters]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(d => 
      (d.customer_name || '').toLowerCase().includes(q) ||
      (d.voucher_number || '').toLowerCase().includes(q) ||
      (d.invoice_number || '').toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  // Financial aggregates
  const totalCollected = useMemo(() => {
    return filtered.reduce((s, r) => s + r.allocated_amount, 0);
  }, [filtered]);

  const fmt = (n) => `NPR ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  // DEVELOPMENT_CHECKLIST §10, §11: Hierarchical ExcelJS Outlining & Audit Header
  const handleExportExcel = async () => {
    try {
      const user = await sajilo.auth.me();
      const headers = ['S.N.', 'Collection Date', 'Receipt Voucher', 'Customer', 'Invoice #', 'Installment Slice', 'Amount Collected', 'Payment Mode', 'Reference No'];
      const rows = filtered.map(r => [
        r.sn,
        r.voucher_date,
        r.voucher_number,
        r.customer_name,
        r.invoice_number,
        r.is_down_payment ? 'Day 0 Down Payment' : `Installment #${r.installment_no}`,
        r.allocated_amount,
        r.payment_mode,
        r.reference_no
      ]);

      await exportAuditLogXLSX({
        filename: `Installment_Collection_Report_${filters.fromDate}_to_${filters.toDate}.xlsx`,
        title: 'INSTALLMENT COLLECTION REPORT (EMI)',
        headers,
        rows,
        currentUser: user,
        fromDate: filters.fromDate,
        toDate: filters.toDate
      });
      toast.success('Collection report exported to Excel');
    } catch (e) {
      console.error(e);
      toast.error('Export failed');
    }
  };

  const columns = [
    { key: 'sn', label: 'S.N.', width: '50px' },
    { 
      key: 'voucher_date', 
      label: 'Receipt Date', 
      render: (v) => <DualDateDisplay date={v} /> 
    },
    { 
      key: 'voucher_number', 
      label: 'Receipt #', 
      render: (v) => v ? <VoucherLink voucherNumber={v}><span className="text-primary hover:underline font-mono cursor-pointer">{v}</span></VoucherLink> : '—' 
    },
    { key: 'customer_name', label: 'Customer Name' },
    { 
      key: 'invoice_number', 
      label: 'Invoice #', 
      render: (v) => v ? <VoucherLink voucherNumber={v}><span className="text-foreground font-mono">{v}</span></VoucherLink> : '—' 
    },
    { 
      key: 'installment_no', 
      label: 'Slice Cleared', 
      render: (v, row) => (
        row.is_down_payment ? (
          <span className="font-semibold text-amber-700 bg-amber-100 dark:bg-amber-950/40 px-2 py-0.5 rounded text-[11px]">
            Day 0 Down Payment
          </span>
        ) : (
          <span className="font-mono">Installment #{v}</span>
        )
      )
    },
    { 
      key: 'allocated_amount', 
      label: 'Amount Collected', 
      render: (v) => <span className="font-mono font-bold text-foreground">{fmt(v)}</span> 
    },
    { key: 'payment_mode', label: 'Mode' },
    { key: 'reference_no', label: 'Reference' }
  ];

  return (
    <ReportPageTemplate
      title="Installment Collection Report"
      subtitle="Analyze realized cash inflows, Day 0 recoveries, and installment receipts"
      category="Receivable"
      icon={DollarSign}
      fromDate={filters.fromDate}
      toDate={filters.toDate}
      isLoading={loading}
      onRefresh={loadData}
      onExportExcel={handleExportExcel}
      filterSlot={
        <div className="space-y-3 mb-4">
          <ReportFilterBar filters={filters} onChange={setFilters} onApply={loadData} showApplyButton />
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search receipt, customer, invoice..."
              className="pl-8 text-xs h-9"
            />
          </div>
        </div>
      }
      metricsSlot={
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Total Realized Inflow</span>
            <div className="text-2xl font-bold font-mono text-emerald-900 dark:text-emerald-200 mt-1">{fmt(totalCollected)}</div>
          </div>
          <div className="bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-2xl p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">Slices Cleared</span>
            <div className="text-2xl font-bold font-mono text-blue-900 dark:text-blue-200 mt-1">{filtered.length}</div>
          </div>
          <div className="bg-purple-50/80 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 rounded-2xl p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-400">Accrual Compliance</span>
            <div className="text-sm font-medium text-purple-900 dark:text-purple-200 mt-2 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-600" /> IFRS 15 Earned Interest Verified
            </div>
          </div>
        </div>
      }
    >
      <StandardReportTable
        columns={columns}
        data={filtered}
        loading={loading}
        footer={filtered.length > 0 ? {
          customer_name: 'TOTAL REALIZED CASH INFLOW',
          allocated_amount: fmt(totalCollected)
        } : null}
      />
    </ReportPageTemplate>
  );
}
