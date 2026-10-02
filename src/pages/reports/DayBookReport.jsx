import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase, sajilo } from '@/api/sajiloClient';
import { useDateFormat } from '@/lib/DateFormatContext';
import { format } from 'date-fns';
import { ArrowLeft, BookOpen, Printer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BSDatePicker } from '@/components/reports/ReportFilterBar';
import { VoucherTextLinkifier } from '@/components/shared/VoucherLink';
import { toast } from 'sonner';

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
  const navigate = useNavigate();
  const { formatDate } = useDateFormat();
  const companyId = sajilo.getCompanyId();

  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Strict tenant scoping via robust queryKey
  const { data, error, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['day-book', companyId, date],
    queryFn: () => fetchDayBookData(companyId, date),
    staleTime: 60 * 1000,
    enabled: false, // Wait for manual Generation
  });

  const openingBal = data?.opening_cash || 0;
  const closingBal = data?.closing_cash || 0;
  const debits = data?.debits || [];
  const credits = data?.credits || [];

  // Zip the arrays to the max length for the dual column layout
  const maxRows = Math.max(debits.length, credits.length);
  
  // Calculate Totals
  const leftCashTotal = debits.reduce((sum, r) => sum + (r.cash_amount || 0), 0);
  const leftAmtTotal  = debits.reduce((sum, r) => sum + (r.non_cash_amount || 0), 0);
  const rightCashTotal = credits.reduce((sum, r) => sum + (r.cash_amount || 0), 0);
  const rightAmtTotal  = credits.reduce((sum, r) => sum + (r.non_cash_amount || 0), 0);
  
  // ── Overdraft & Balance Routing Logic ──
  
  // Step 1: Route Opening Balance
  const leftOpeningBal = openingBal > 0 ? openingBal : 0;
  const rightOpeningBal = openingBal < 0 ? Math.abs(openingBal) : 0;

  // Step 2: Route Closing Balance (to force the ledger to balance)
  const leftClosingBal = closingBal < 0 ? Math.abs(closingBal) : 0;
  const rightClosingBal = closingBal >= 0 ? closingBal : 0;

  // Step 3: Compute Grand Totals safely
  const grandLeftCash = leftCashTotal + leftOpeningBal + leftClosingBal;
  const grandRightCash = rightCashTotal + rightOpeningBal + rightClosingBal;

  return (
    <div className="flex flex-col gap-5 p-6 pb-24 max-w-[1400px] mx-auto print:p-2 print:pb-0">
      
      {/* ── Screen Header ── */}
      <div className="print:hidden flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/reports')} className="rounded-xl">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary" /> Day Book
            </h2>
            <p className="text-sm text-muted-foreground">All transactions for a single date</p>
          </div>
        </div>
        <Button onClick={() => window.print()} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
          <Printer className="w-4 h-4 mr-2" /> Print
        </Button>
      </div>

      {/* ── Filter Bar ── */}
      <div className="print:hidden bg-card border border-border rounded-xl p-4 flex flex-wrap items-end gap-5">
        <BSDatePicker label="Date" adValue={date} onChange={setDate} />
        <Button onClick={() => refetch()} disabled={isLoading || isFetching} className="self-end rounded-lg">
          <RefreshCw className={`w-4 h-4 mr-2 ${(isLoading || isFetching) ? 'animate-spin' : ''}`} />
          Generate
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-200 font-mono text-sm">
          <strong>Error loading Day Book:</strong><br />
          {error.message || JSON.stringify(error)}
        </div>
      )}

      {/* ── Table ── */}
      {data && (
        <div className="bg-card border border-border rounded-xl overflow-hidden font-mono text-sm">
          {/* Print Title */}
          <div className="hidden print:block text-center py-3 border-b border-border">
            <p className="text-lg font-bold">Day Book</p>
            <p className="text-xs text-muted-foreground">Date: {formatDate(date)}</p>
          </div>

          <div className="overflow-x-auto" role="region" aria-label="Day Book table" tabIndex={0}>
            {/* Added print-exact-colors to preserve visual hierarchy styling during print/PDF generation */}
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
                <tr className="bg-[var(--background)] text-[var(--foreground)]">
                  {openingBal >= 0 ? (
                    <>
                      <td className="px-3 py-1.5 font-bold sticky left-0 bg-[var(--background)] z-10">Opening Balance</td>
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5 text-right font-bold">{leftOpeningBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5 border-r-2 border-border"></td>
                      <td colSpan={4}></td>
                    </>
                  ) : (
                    <>
                      <td colSpan={4} className="border-r-2 border-border sticky left-0 bg-[var(--background)] z-10"></td>
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
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No transactions found</td>
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
                          <p className="text-[10px] text-muted-foreground">(<VoucherTextLinkifier text={`No: ${left?.voucher_number || ''}`} />)</p>
                        </>}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{left ? (VOUCHER_TYPE_ABBR[left.voucher_type] || left.voucher_type) : ''}</td>
                      <td className="px-3 py-1.5 text-right">{left?.cash_amount > 0 ? left.cash_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>
                      <td className="px-3 py-1.5 text-right border-r-2 border-border">{left?.non_cash_amount > 0 ? left.non_cash_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>

                      {/* Right Side */}
                      <td className="px-3 py-1.5">
                        {right && <>
                          <p className="font-medium truncate max-w-[200px]">{right?.account_name || ''}</p>
                          <p className="text-[10px] text-muted-foreground">(<VoucherTextLinkifier text={`No: ${right?.voucher_number || ''}`} />)</p>
                        </>}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{right ? (VOUCHER_TYPE_ABBR[right.voucher_type] || right.voucher_type) : ''}</td>
                      <td className="px-3 py-1.5 text-right">{right?.cash_amount > 0 ? right.cash_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>
                      <td className="px-3 py-1.5 text-right">{right?.non_cash_amount > 0 ? right.non_cash_amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : ''}</td>
                    </tr>
                  );
                })}

                {/* ── Sub Total ── */}
                <tr className="bg-[var(--background)]/50 font-semibold border-t-2 border-border text-[var(--foreground)]">
                  <td className="px-3 py-2 text-right sticky left-0 bg-[var(--background)] z-10">Total</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">{leftCashTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right border-r-2 border-border">{leftAmtTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right">Total</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">{rightCashTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right">{rightAmtTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>

                {/* ── Closing Balance ── */}
                <tr className="bg-[var(--background)] text-[var(--foreground)]">
                  {closingBal < 0 ? (
                    <>
                      <td className="px-3 py-1.5 font-bold sticky left-0 bg-[var(--background)] z-10">Closing Balance (Overdrawn)</td>
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5 text-right font-bold text-red-600">{leftClosingBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5 border-r-2 border-border"></td>
                      <td colSpan={4}></td>
                    </>
                  ) : (
                    <>
                      <td colSpan={4} className="border-r-2 border-border sticky left-0 bg-[var(--background)] z-10"></td>
                      <td className="px-3 py-1.5 font-bold">Closing Balance</td>
                      <td className="px-3 py-1.5"></td>
                      <td className="px-3 py-1.5 text-right font-bold">{rightClosingBal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5"></td>
                    </>
                  )}
                </tr>

                {/* ── Grand Total ── */}
                <tr className="bg-[var(--background)] text-[var(--foreground)] font-bold border-t-2 border-border">
                  <td className="px-3 py-2 text-right sticky left-0 bg-[var(--background)] z-10">Grand Total</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">{grandLeftCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right border-r-2 border-border">{leftAmtTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right">Grand Total</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-right">{grandRightCash.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2 text-right">{rightAmtTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
