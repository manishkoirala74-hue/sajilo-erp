import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Printer, ArrowDownRight, ArrowUpRight, Scale, Receipt, CheckCircle, AlertCircle } from 'lucide-react';
import BusinessHeader from '@/components/reports/BusinessHeader';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import ReportExportActions from '@/components/reports/ReportExportActions';
import VoucherLink from '@/components/shared/VoucherLink';
import { useAmountFormatter } from '@/hooks/useAmountFormatter';
import { useDateFormat } from '@/lib/DateFormatContext';
import { adToBS, formatBS } from '@/lib/nepaliDate';
import { sajilo } from '@/api/sajiloClient';
import { DEFAULT_FILTERS, useCachedFilters, useCachedState, useFmtNPR } from '@/components/reports/ReportViewer';
import { exportFlatXLSX } from '@/lib/reports/reportExcelExport';
import { generateReportVectorPDF } from '@/utils/reportPdfEngine';
import { REPORT_TYPOGRAPHY, REPORT_COLORS } from '@/config/reportTheme';

export default function VatSummaryReport({ initialFromDate, initialToDate }) {
  const { displayBsDate } = useDateFormat();
  const fmtNPR = useFmtNPR();
  const [filters, setFilters] = useCachedFilters('vat_summary', {
    ...DEFAULT_FILTERS,
    showBsDate: displayBsDate,
    fromDate: initialFromDate,
    toDate: initialToDate
  });

  const [data, setData] = useCachedState('vat_summary_data', null);
  const [loading, setLoading] = useState(false);
  const currentCompanyId = sajilo.getCompanyId();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { fetchReportData } = await import('@/lib/reportDataFetcher');
      const result = await fetchReportData('vat_summary', filters.fromDate, filters.toDate);
      setData(result);
    } catch (err) {
      console.error('Failed to load VAT summary report:', err);
    } finally {
      setLoading(false);
    }
  }, [filters.fromDate, filters.toDate]);

  useEffect(() => {
    load();
  }, [currentCompanyId, filters.fromDate, filters.toDate]);

  const sales = data?.sales_summary || { total_sales: 0, taxable_sales: 0, exempt_sales: 0, output_vat: 0, count: 0 };
  const purchases = data?.purchase_summary || { total_purchases: 0, taxable_purchases: 0, exempt_purchases: 0, input_vat: 0, count: 0 };
  const netVat = data?.net_vat_position ?? (sales.output_vat - purchases.input_vat);
  const ledger = data?.vat_ledger || { opening_balance: 0, total_debit: 0, total_credit: 0, closing_balance: 0, lines: [] };

  const isPayable = netVat > 0;
  const isRefundable = netVat < 0;

  // Export handlers
  const handleExportExcel = async () => {
    const summaryRows = [
      ['SALES & OUTPUT TAX', '', '', '', ''],
      ['Taxable Sales (13% VAT)', sales.taxable_sales.toFixed(2), '', '', ''],
      ['Exempt / Non-Taxable Sales', sales.exempt_sales.toFixed(2), '', '', ''],
      ['Total Output VAT Collected', sales.output_vat.toFixed(2), '', '', ''],
      ['Total Sales Revenue', sales.total_sales.toFixed(2), '', '', ''],
      ['', '', '', '', ''],
      ['PURCHASES & INPUT TAX', '', '', '', ''],
      ['Taxable Purchases (13% VAT)', purchases.taxable_purchases.toFixed(2), '', '', ''],
      ['Exempt / Non-Taxable Purchases', purchases.exempt_purchases.toFixed(2), '', '', ''],
      ['Total Input VAT Paid', purchases.input_vat.toFixed(2), '', '', ''],
      ['Total Purchases & Expenses', purchases.total_purchases.toFixed(2), '', '', ''],
      ['', '', '', '', ''],
      ['NET VAT POSITION (OUTPUT - INPUT)', '', '', netVat.toFixed(2), isPayable ? 'Payable to IRD' : 'Refund / Credit Claimable'],
      ['', '', '', '', ''],
      ['UNIFIED VAT LEDGER STATEMENT (ACCOUNT 2120)', '', '', '', ''],
      ['Date', 'Voucher #', 'Description', 'Debit (Input VAT)', 'Credit (Output VAT)']
    ];

    ledger.lines.forEach(l => {
      summaryRows.push([
        (l.date || '').split('T')[0],
        l.voucher_no || '',
        l.description || '',
        l.debit_amount > 0 ? l.debit_amount.toFixed(2) : '',
        l.credit_amount > 0 ? l.credit_amount.toFixed(2) : ''
      ]);
    });

    await exportFlatXLSX({
      headers: ['Description / Parameter', 'Amount (NPR)', 'Tax Breakdown', 'Net Amount', 'Status'],
      rows: summaryRows,
      reportTitle: 'VAT Summary Report',
      filename: `vat_summary_${filters.fromDate}_to_${filters.toDate}.xlsx`
    });
  };

  const handlePrintPdf = async () => {
    const columns = ['Parameter / Section', 'Taxable (NPR)', 'Exempt (NPR)', 'VAT (13%) (NPR)', 'Total (NPR)'];
    const rows = [
      ['Sales (Output Tax)', sales.taxable_sales.toLocaleString(), sales.exempt_sales.toLocaleString(), sales.output_vat.toLocaleString(), sales.total_sales.toLocaleString()],
      ['Purchases (Input Tax)', purchases.taxable_purchases.toLocaleString(), purchases.exempt_purchases.toLocaleString(), purchases.input_vat.toLocaleString(), purchases.total_purchases.toLocaleString()],
      ['Net VAT Position', '—', '—', Math.abs(netVat).toLocaleString(), isPayable ? 'Payable to IRD' : 'Refund / Credit Claimable']
    ];

    await generateReportVectorPDF({
      title: 'VAT Summary Report (भ्याट सारांश प्रतिवेदन)',
      subtitle: `Period: ${filters.fromDate} to ${filters.toDate}`,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      columns,
      data: rows,
      filename: `vat_summary_${filters.fromDate}_to_${filters.toDate}.pdf`
    });
  };

  return (
    <div className="space-y-5">
      <BusinessHeader 
        reportTitle="VAT Summary Report (भ्याट सारांश प्रतिवेदन)"
        fromDate={filters.fromDate}
        toDate={filters.toDate}
        subtitle="Unified Single-Ledger VAT Control (Nepal VAT Act 2052 / IRD Standard)"
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <ReportFilterBar 
          filters={filters}
          onChange={setFilters}
          onApply={load}
          showApplyButton={true}
        />
        <ReportExportActions 
          onExportExcel={handleExportExcel}
          onExportPdf={handlePrintPdf}
        />
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">
          Calculating unified VAT ledger and transaction registers…
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Top Executive KPI Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
            {/* Output VAT Card */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Output VAT (Sales)</span>
                <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-foreground tabular-nums">
                  {fmtNPR(sales.output_vat)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  From {sales.count} posted sales bills
                </p>
              </div>
            </div>

            {/* Input VAT Card */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Input VAT (Purchases)</span>
                <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <ArrowDownRight className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-foreground tabular-nums">
                  {fmtNPR(purchases.input_vat)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  From {purchases.count} posted purchase bills
                </p>
              </div>
            </div>

            {/* Net Position Card */}
            <div className={`border rounded-xl p-4 shadow-sm flex flex-col justify-between ${
              isPayable 
                ? 'bg-amber-50/50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20' 
                : isRefundable 
                  ? 'bg-emerald-50/50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' 
                  : 'bg-card border-border'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Net Position (Period)</span>
                <span className={`p-1.5 rounded-lg ${
                  isPayable ? 'bg-amber-100 text-amber-700' : isRefundable ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'
                }`}>
                  <Scale className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className={`text-xl font-bold tabular-nums ${
                  isPayable ? 'text-amber-700 dark:text-amber-400' : isRefundable ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground'
                }`}>
                  {fmtNPR(Math.abs(netVat))}
                </div>
                <div className="mt-1">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full inline-block ${
                    isPayable 
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300' 
                      : isRefundable 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300' 
                        : 'bg-slate-100 text-slate-800'
                  }`}>
                    {isPayable ? 'Net VAT Payable to IRD' : isRefundable ? 'Refund / Credit Claimable' : 'Balanced (Zero Tax)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Account 2120 Balance Card */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">VAT Ledger (A/C 2120)</span>
                <span className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <Receipt className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-foreground tabular-nums">
                  {fmtNPR(Math.abs(ledger.closing_balance))} {ledger.closing_balance < 0 ? 'Dr' : ledger.closing_balance > 0 ? 'Cr' : ''}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ledger.closing_balance < 0 ? 'Cumulative Tax Credit (Asset)' : ledger.closing_balance > 0 ? 'Cumulative Payable (Liability)' : 'Zero Balance'}
                </p>
              </div>
            </div>
          </div>

          {/* ── Section 1: VAT Return Computation Summary (Anusuchi 10 format) ── */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border bg-muted/40 flex items-center justify-between">
              <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary" />
                Tax Return Computation Summary (अनुसूची १० ढाँचा)
              </h4>
              <span className="text-xs text-muted-foreground">Standard VAT Rate: 13%</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground bg-muted/20">
                    <th className="px-4 py-2.5 text-left font-medium">Category / Transaction Type</th>
                    <th className="px-4 py-2.5 text-right font-medium">Taxable Amount (NPR)</th>
                    <th className="px-4 py-2.5 text-right font-medium">Exempt / Non-Taxable (NPR)</th>
                    <th className="px-4 py-2.5 text-right font-medium">VAT (13%) (NPR)</th>
                    <th className="px-4 py-2.5 text-right font-medium">Total Amount (NPR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Sales (Output Tax Collected)
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNPR(sales.taxable_sales)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNPR(sales.exempt_sales)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-blue-600 dark:text-blue-400">{fmtNPR(sales.output_vat)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtNPR(sales.total_sales)}</td>
                  </tr>
                  <tr className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                        Purchases (Input Tax Paid)
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNPR(purchases.taxable_purchases)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtNPR(purchases.exempt_purchases)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-indigo-600 dark:text-indigo-400">{fmtNPR(purchases.input_vat)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">{fmtNPR(purchases.total_purchases)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className={`border-t-2 border-border font-bold ${isPayable ? 'bg-amber-50/40 dark:bg-amber-500/10' : isRefundable ? 'bg-emerald-50/40 dark:bg-emerald-500/10' : 'bg-muted/30'}`}>
                    <td className="px-4 py-3 text-foreground">
                      Net VAT Liability for Selected Period
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">—</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">—</td>
                    <td className={`px-4 py-3 text-right tabular-nums text-base ${isPayable ? 'text-amber-700 dark:text-amber-400' : isRefundable ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground'}`}>
                      {fmtNPR(Math.abs(netVat))} {isPayable ? '(Payable)' : isRefundable ? '(Credit)' : ''}
                    </td>
                    <td className="px-4 py-3 text-right text-xs uppercase tracking-wider text-muted-foreground">
                      {isPayable ? 'Payable to IRD' : isRefundable ? 'Claim Refund / Carry Forward' : 'Zero Balance'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── Section 2: Unified VAT Control Ledger (Account 2120 Audit Trail) ── */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border bg-muted/40 flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600" />
                  General Ledger Audit Trail: {ledger.account_name} (Account 2120)
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Opening Balance: {fmtNPR(Math.abs(ledger.opening_balance))} {ledger.opening_balance < 0 ? 'Dr' : 'Cr'} • Net Debits: {fmtNPR(ledger.total_debit)} • Net Credits: {fmtNPR(ledger.total_credit)} • Closing Balance: {fmtNPR(Math.abs(ledger.closing_balance))} {ledger.closing_balance < 0 ? 'Dr' : 'Cr'}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold text-muted-foreground bg-muted/30 uppercase tracking-wider">
                    <th className="px-3 py-2 text-left">Date</th>
                    {filters.showBsDate && <th className="px-3 py-2 text-left">Date (BS)</th>}
                    <th className="px-3 py-2 text-left">Voucher #</th>
                    <th className="px-3 py-2 text-left">Module</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Debit (Input VAT)</th>
                    <th className="px-3 py-2 text-right">Credit (Output VAT)</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {ledger.lines.length === 0 ? (
                    <tr>
                      <td colSpan={filters.showBsDate ? 8 : 7} className="px-4 py-8 text-center text-muted-foreground text-xs">
                        No general ledger postings recorded for the VAT Control Account in this period.
                      </td>
                    </tr>
                  ) : (
                    ledger.lines.map((l, i) => {
                      const dateBs = adToBS(l.date) ? formatBS(adToBS(l.date)) : '';
                      const dateAd = (l.date || '').split('T')[0].split('-').reverse().join('-');
                      return (
                        <tr key={l.id || i} className="hover:bg-muted/10 transition-colors">
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{dateAd}</td>
                          {filters.showBsDate && <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{dateBs}</td>}
                          <td className="px-3 py-2 whitespace-nowrap font-mono font-medium">
                            <VoucherLink voucherNumber={l.voucher_no}>
                              <span className="text-primary hover:underline cursor-pointer">{l.voucher_no}</span>
                            </VoucherLink>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{l.module}</td>
                          <td className="px-3 py-2 text-foreground font-medium">{l.description}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-mono text-indigo-600 dark:text-indigo-400">
                            {l.debit_amount > 0 ? fmtNPR(l.debit_amount) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-mono text-blue-600 dark:text-blue-400">
                            {l.credit_amount > 0 ? fmtNPR(l.credit_amount) : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-mono font-semibold">
                            {fmtNPR(Math.abs(l.balance))} {l.balance < 0 ? 'Dr' : l.balance > 0 ? 'Cr' : ''}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {ledger.lines.length > 0 && (
                  <tfoot className="bg-muted/40 border-t border-border font-bold">
                    <tr>
                      <td colSpan={filters.showBsDate ? 5 : 4} className="px-3 py-2.5 text-foreground text-right">
                        TOTAL POSTINGS:
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-mono text-indigo-600 dark:text-indigo-400">
                        {fmtNPR(ledger.total_debit)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-mono text-blue-600 dark:text-blue-400">
                        {fmtNPR(ledger.total_credit)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-mono">
                        {fmtNPR(Math.abs(ledger.closing_balance))} {ledger.closing_balance < 0 ? 'Dr' : 'Cr'}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
