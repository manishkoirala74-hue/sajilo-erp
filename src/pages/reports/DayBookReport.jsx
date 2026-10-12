import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, sajilo } from '@/api/sajiloClient';
import { useDateFormat } from '@/lib/DateFormatContext';
import { format } from 'date-fns';
import { BookOpen, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BSDatePicker } from '@/components/reports/ReportFilterBar';
import VoucherLink from '@/components/shared/VoucherLink';
import { exportFlatXLSX } from '@/lib/reports/reportExcelExport';
import { toast } from 'sonner';
import { ReportPageTemplate } from '@/components/reports';

const VOUCHER_TYPE_ABBR = {
  Receipt:         'Rcpt',
  Payment:         'Pymt',
  Journal:         'Jrnl',
  Contra:          'Cntr',
  SalesInvoice:    'Sale',
  PurchaseInvoice: 'Purc',
};

// ── Fetcher ─────────────────────────────────────────────────────────────
const fetchDayBookData = async (companyId, date) => {
  if (!date) return null;
  const { data, error } = await supabase.rpc('get_day_book_rpc', {
    p_company_id: companyId,
    p_date: date,
  });
  if (error) throw error;
  return data;
};

export default function DayBookReport() {
  const { formatDate } = useDateFormat();
  const companyId = sajilo.getCompanyId();

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Strict tenant scoping via robust queryKey
  const { data, error, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['day-book', companyId, date],
    queryFn: () => fetchDayBookData(companyId, date),
    staleTime: 60 * 1000,
    enabled: false,
  });

  const openingBal = data?.opening_cash || 0;
  const closingBal = data?.closing_cash || 0;
  const debits = data?.debits || [];
  const credits = data?.credits || [];

  const maxRows = Math.max(debits.length, credits.length);
  
  const leftCashTotal = debits.reduce((sum, r) => sum + (r.cash_amount || 0), 0);
  const leftAmtTotal  = debits.reduce((sum, r) => sum + (r.non_cash_amount || 0), 0);
  const rightCashTotal = credits.reduce((sum, r) => sum + (r.cash_amount || 0), 0);
  const rightAmtTotal  = credits.reduce((sum, r) => sum + (r.non_cash_amount || 0), 0);
  
  const leftOpeningBal = openingBal > 0 ? openingBal : 0;
  const rightOpeningBal = openingBal < 0 ? Math.abs(openingBal) : 0;

  const leftClosingBal = closingBal < 0 ? Math.abs(closingBal) : 0;
  const rightClosingBal = closingBal >= 0 ? closingBal : 0;

  const grandLeftCash = leftCashTotal + leftOpeningBal + leftClosingBal;
  const grandRightCash = rightCashTotal + rightOpeningBal + rightClosingBal;

  const handleExportExcel = async () => {
    if (!data) {
      toast.info('Please generate the day book first.');
      return;
    }
    const headers = [
      'Dr - Particulars', 'Dr - Voucher #', 'Dr - Type', 'Dr - Cash Amt', 'Dr - Amount',
      'Cr - Particulars', 'Cr - Voucher #', 'Cr - Type', 'Cr - Cash Amt', 'Cr - Amount'
    ];

    const rows = [];
    if (openingBal >= 0) {
      rows.push(['Opening Balance', '', '', leftOpeningBal, '', '', '', '', '', '']);
    } else {
      rows.push(['', '', '', '', '', 'Opening Balance (Overdrawn)', '', '', rightOpeningBal, '']);
    }

    for (let i = 0; i < maxRows; i++) {
      const left = debits[i];
      const right = credits[i];
      rows.push([
        left?.account_name || '',
        left?.voucher_number || '',
        left ? (VOUCHER_TYPE_ABBR[left.voucher_type] || left.voucher_type) : '',
        left?.cash_amount || '',
        left?.non_cash_amount || '',
        right?.account_name || '',
        right?.voucher_number || '',
        right ? (VOUCHER_TYPE_ABBR[right.voucher_type] || right.voucher_type) : '',
        right?.cash_amount || '',
        right?.non_cash_amount || ''
      ]);
    }

    rows.push(['Total', '', '', leftCashTotal, leftAmtTotal, 'Total', '', '', rightCashTotal, rightAmtTotal]);

    if (closingBal < 0) {
      rows.push(['Closing Balance (Overdrawn)', '', '', leftClosingBal, '', '', '', '', '', '']);
    } else {
      rows.push(['', '', '', '', '', 'Closing Balance', '', '', rightClosingBal, '']);
    }

    const footer = ['Grand Total', '', '', grandLeftCash, leftAmtTotal, 'Grand Total', '', '', grandRightCash, rightAmtTotal];

    await exportFlatXLSX({
      filename: `Day_Book_${date}.xlsx`,
      reportTitle: `Day Book - ${date}`,
      fromDate: date,
      toDate: date,
      headers,
      rows,
      footer
    });
  };

  const handleExportPdf = () => {
    window.print();
  };

  return (
    <ReportPageTemplate
      title="Day Book"
      subtitle="Dual-column cash & ledger transaction journal for a selected single date"
      category="Accounting"
      icon={BookOpen}
      fromDate={date}
      toDate={date}
      isLoading={isLoading || isFetching}
      error={error}
      onRefresh={() => refetch()}
      onExportExcel={handleExportExcel}
      onExportPdf={handleExportPdf}
      filterSlot={
        <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-end gap-5 shadow-sm">
          <BSDatePicker label="Transaction Date" adValue={date} onChange={setDate} />
          <Button onClick={() => refetch()} disabled={isLoading || isFetching} className="self-end rounded-lg">
            <RefreshCw className={`w-4 h-4 mr-2 ${(isLoading || isFetching) ? 'animate-spin' : ''}`} />
            Generate Day Book
          </Button>
        </div>
      }
    >
      {data && (
        <div className="bg-card border border-border rounded-xl overflow-hidden font-mono text-sm shadow-sm">
          <div className="overflow-x-auto" role="region" aria-label="Day Book table" tabIndex={0}>
            <table className="w-full text-xs border-collapse min-w-[900px] print-exact-colors">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th colSpan={4} className="px-3 py-1.5 text-left font-bold border-r border-primary-foreground/30">◄ Receipts (Dr) ►</th>
                  <th colSpan={4} className="px-3 py-1.5 text-left font-bold">◄ Payments (Cr) ►</th>
                </tr>
                <tr className="bg-muted/50 border-b border-border text-muted-foreground">
                  <th className="px-3 py-2 text-left w-[22%] sticky left-0 bg-muted/50 z-10">Particulars</th>
                  <th className="px-3 py-2 text-left w-[6%]">Type</th>
                  <th className="px-3 py-2 text-right w-[10%]">Cash Amt</th>
                  <th className="px-3 py-2 text-right w-[10%] border-r-2 border-border">Amount</th>
                  <th className="px-3 py-2 text-left w-[22%]">Particulars</th>
                  <th className="px-3 py-2 text-left w-[6%]">Type</th>
                  <th className="px-3 py-2 text-right w-[10%]">Cash Amt</th>
                  <th className="px-3 py-2 text-right w-[10%]">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {/* ── Opening Balance ── */}
                <tr className="bg-muted/10">
                  {openingBal >= 0 ? (
                    <>
                      <td className="px-3 py-1.5 font-bold sticky left-0 bg-card z-10">Opening Balance</td>
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5 text-right font-bold">{leftOpeningBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5 border-r-2 border-border"></td>
                      <td colSpan={4}></td>
                    </>
                  ) : (
                    <>
                      <td colSpan={4} className="border-r-2 border-border sticky left-0 bg-card z-10"></td>
                      <td className="px-3 py-1.5 font-bold">Opening Balance (Overdrawn)</td>
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5 text-right font-bold text-red-600">{rightOpeningBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5"></td>
                    </>
                  )}
                </tr>

                {/* ── Transaction Zipped Rows ── */}
                {maxRows === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No transactions recorded for {formatDate(date)}</td>
                  </tr>
                ) : Array.from({ length: maxRows }).map((_, i) => {
                  const left = debits[i];
                  const right = credits[i];

                  return (
                    <tr key={`${date}-${left?.id || 'empty'}-${right?.id || 'empty'}-${i}`} className="hover:bg-muted/20">
                      {/* Left Side */}
                      <td className="px-3 py-1.5 sticky left-0 bg-card z-10">
                        {left && <>
                          <p className="font-medium truncate max-w-[200px]">{left?.account_name || ''}</p>
                          <p className="text-[10px] text-muted-foreground">(No: <VoucherLink voucherNumber={left?.voucher_number}>{left?.voucher_number}</VoucherLink>)</p>
                        </>}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{left ? (VOUCHER_TYPE_ABBR[left.voucher_type] || left.voucher_type) : ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{left?.cash_amount > 0 ? left.cash_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono border-r-2 border-border">{left?.non_cash_amount > 0 ? left.non_cash_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>

                      {/* Right Side */}
                      <td className="px-3 py-1.5">
                        {right && <>
                          <p className="font-medium truncate max-w-[200px]">{right?.account_name || ''}</p>
                          <p className="text-[10px] text-muted-foreground">(No: <VoucherLink voucherNumber={right?.voucher_number}>{right?.voucher_number}</VoucherLink>)</p>
                        </>}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{right ? (VOUCHER_TYPE_ABBR[right.voucher_type] || right.voucher_type) : ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{right?.cash_amount > 0 ? right.cash_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{right?.non_cash_amount > 0 ? right.non_cash_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>
                    </tr>
                  );
                })}

                {/* ── Sub Total ── */}
                <tr className="bg-muted/30 font-semibold border-t-2 border-border">
                  <td className="px-3 py-2 text-right sticky left-0 bg-card z-10">Total</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right font-mono">{leftCashTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right font-mono border-r-2 border-border">{leftAmtTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right">Total</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right font-mono">{rightCashTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right font-mono">{rightAmtTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>

                {/* ── Closing Balance ── */}
                <tr className="bg-muted/10">
                  {closingBal < 0 ? (
                    <>
                      <td className="px-3 py-1.5 font-bold sticky left-0 bg-card z-10">Closing Balance (Overdrawn)</td>
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5 text-right font-bold text-red-600 font-mono">{leftClosingBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5 border-r-2 border-border"></td>
                      <td colSpan={4}></td>
                    </>
                  ) : (
                    <>
                      <td colSpan={4} className="border-r-2 border-border sticky left-0 bg-card z-10"></td>
                      <td className="px-3 py-1.5 font-bold">Closing Balance</td>
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5 text-right font-bold font-mono">{rightClosingBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5"></td>
                    </>
                  )}
                </tr>

                {/* ── Grand Total ── */}
                <tr className="bg-muted/60 font-bold border-t-2 border-border">
                  <td className="px-3 py-2 text-right sticky left-0 bg-card z-10">Grand Total</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right font-mono">{grandLeftCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right font-mono border-r-2 border-border">{leftAmtTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right">Grand Total</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right font-mono">{grandRightCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right font-mono">{rightAmtTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ReportPageTemplate>
  );
}
