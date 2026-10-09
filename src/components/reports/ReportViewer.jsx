/**
 * ReportViewer — Modal shell.
 * Each report renderer manages its own isolated filter state.
 * Print layout is governed by the global @media print stylesheet injected here.
 */
import { X, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BusinessHeader from '@/components/reports/BusinessHeader';
import ReportExportActions from '@/components/reports/ReportExportActions';
import PartnerStatement from '@/components/reports/PartnerStatement';
import ProfitLossReport from '@/components/reports/ProfitLossReport';
import FinancialReportTable from '@/components/reports/FinancialReportTable';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { exportFlatXLSX } from '@/lib/reports/reportExcelExport';
import { sajilo, supabase } from '@/api/sajiloClient';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { generateReportVectorPDF } from '@/utils/reportPdfEngine';
import { format } from 'date-fns';
import SearchableSelect from '@/components/shared/SearchableSelect';
import VoucherLink from '@/components/shared/VoucherLink';
import CommunicationModal from '@/components/shared/CommunicationModal';
import { Mail } from 'lucide-react';
import { useDateFormat } from '@/lib/DateFormatContext';
import { adToBS, formatBS } from '@/lib/nepaliDate';
import { useAmountFormatter } from '@/hooks/useAmountFormatter';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function useFmtNPR() {
  const { formatNumber } = useAmountFormatter();
  return (n) => {
    const num = Number(n || 0);
    if (num === 0) return '—';
    const absNum = Math.abs(num);
    const formatted = `NPR ${formatNumber(absNum)}`;
    return num < 0 ? `(${formatted})` : formatted;
  };
}
// downloadCSV replaced by exportFlatXLSX — kept as no-op shim to avoid refactor of every call site
async function downloadCSV(filename, headers, rows, footer) {
  try {
    return await exportFlatXLSX({
      headers,
      rows,
      footer,
      reportTitle: filename.replace(/\.(xlsx|csv)$/i, '').replace(/_/g, ' '),
      filename: filename.endsWith('.xlsx') ? filename : filename.replace(/\.csv$/i, '.xlsx'),
    });
  } catch (err) {
    console.error('[XLSX export error]', err);
    throw err;
  }
}

function inRange(dateStr, from, to) {
  if (!dateStr) return false;
  return dateStr >= from && dateStr <= to;
}

export const DEFAULT_FILTERS = {
  fromDate: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
  toDate:   format(new Date(), 'yyyy-MM-dd'),
  showZeroBalance:    false,
  expandAll:          false,
  showOpeningBalance: true,
  showClosingBalance: true,
  showTransactions:   true,
  showBsDate:         false,
};

const filterCache = {};
export function useCachedFilters(key, defaultFilters) {
  const [filters, setFilters] = useState(() => filterCache[key] || defaultFilters);
  useEffect(() => { filterCache[key] = filters; }, [filters, key]);
  return [filters, setFilters];
}

const stateCache = {};
export function useCachedState(key, defaultState) {
  const [state, setState] = useState(() => (stateCache[key] !== undefined ? stateCache[key] : defaultState));
  useEffect(() => { stateCache[key] = state; }, [state, key]);
  return [state, setState];
}

// ── Print Stylesheet ──────────────────────────────────────────────────────────
const PRINT_STYLE = `
@media print {
  @page { margin: 10mm; size: A4 landscape; }

  /* Release modal constraints to allow normal page pagination */
  .report-modal-container, .table-scroll-container, .fixed.inset-0 {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    position: static !important;
  }

  thead { display: table-header-group !important; }
  tfoot { display: table-footer-group !important; }

  /* ── Table layout ── */
  table {
    width: 100% !important;
    border-collapse: collapse !important;
  }
  th, td {
    padding: 3pt 5pt !important;
    white-space: nowrap !important;
    vertical-align: middle !important;
    font-size: 8pt !important;
    font-family: 'Calibri', Arial, sans-serif !important;
  }
  tbody tr { page-break-inside: avoid !important; }
  tfoot tr { page-break-inside: avoid !important; }
  thead th {
    background: #1e293b !important;
    color: #ffffff !important;
    font-weight: 700 !important;
    font-size: 7.5pt !important;
  }
  tfoot td {
    background: #e2e8f0 !important;
    font-weight: 700 !important;
    border-top: 2pt solid #64748b !important;
  }
  tr.print-group-row { background: #f1f5f9 !important; font-weight: 700 !important; }
  .text-right, .tabular-nums { text-align: right !important; }
  .print-hide { display: none !important; }
  .print\\:hidden { display: none !important; }
}
`;

// ── Shared: Simple flat ReportTable ──────────────────────────────────────────
function extractText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node.props && node.props.children) return extractText(node.props.children);
  if (node.props && node.props.voucherNumber) return node.props.voucherNumber;
  return '';
}

function ReportTable({ title, subtitle, headers, rows, footer, onExport, onEmail, onPrintPdf, fromDate, toDate }) {
  const handlePrint = async () => {
    if (onPrintPdf) {
       await onPrintPdf();
       return;
    }
    // Auto-generate PDF for SimpleReports
    const pdfRows = rows.map(r => r.map(extractText));
    const pdfFooter = footer ? footer.map(extractText) : undefined;
    
    await generateReportVectorPDF({
      title: title || 'Report',
      subtitle,
      fromDate,
      toDate,
      columns: headers,
      data: pdfRows,
      footer: pdfFooter,
      filename: `${(title || 'report').replace(/\s+/g, '_')}.pdf`
    });
  };

  const rightCols = new Set([headers.length - 1, headers.length - 2]); // last 2 cols = numeric

  return (
    <div className="space-y-3">
      <BusinessHeader reportTitle={title} fromDate={fromDate} toDate={toDate} subtitle={subtitle} />
      <div className="flex justify-end gap-2 items-center print:hidden">
        {onEmail && (
          <button onClick={onEmail}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-blue-300 dark:border-blue-500/30 rounded-lg bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 transition-colors">
            <Mail className="w-3.5 h-3.5" /> Email Report
          </button>
        )}
        <ReportExportActions
          onExportExcel={onExport}
          onExportPdf={handlePrint}
        />
      </div>
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="table-scroll-container overflow-x-auto" tabIndex={0} role="region" aria-label="Report data">
          <table className="table-fluid-grid text-sm print:text-[10pt]">
            <thead className="cell-density bg-slate-100 dark:bg-slate-500/20 border-b-2 border-border sticky top-0 z-10 shadow-sm">
              <tr>
                {headers.map((h, i) => {
                  const isNum = rightCols.has(i);
                  const stickyClasses = i === 0 ? 'sticky left-0 top-0 z-30 bg-slate-100 dark:bg-[#1e293b] border-r border-border md:border-r-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : '';
                  return (
                    <th key={i} scope="col" className={`cell-density font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider ${isNum ? 'amount-cell tabular-nums' : 'text-align-left'} ${stickyClasses}`}>
                      {h}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0
                ? <tr><td colSpan={headers.length} className="cell-density text-center text-muted-foreground text-sm">No data found for the selected period.</td></tr>
                : rows.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/20 print:hover:bg-transparent print:break-inside-avoid print:bg-white print:text-black">
                    {row.map((cell, j) => {
                      const isNum = rightCols.has(j);
                      const stickyClasses = j === 0 ? 'sticky left-0 bg-card z-20 border-r border-border md:border-r-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : '';
                      return (
                        <td key={j} className={`cell-density print:text-[10pt] ${isNum ? 'amount-cell tabular-nums' : 'text-align-left'} ${stickyClasses}`} {...(j === 0 ? { scope: "row" } : {})}>
                          {cell}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
            {footer && (
              <tfoot className="bg-slate-100 dark:bg-slate-500/20 border-t-2 border-slate-400 font-semibold">
                <tr>
                  {footer.map((cell, j) => {
                    const isNum = rightCols.has(j);
                    const stickyClasses = j === 0 ? 'sticky left-0 bg-slate-100 dark:bg-[#1e293b] z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' : '';
                    return (
                      <td key={j} className={`cell-density print:text-[10pt] font-bold ${isNum ? 'amount-cell tabular-nums' : 'text-align-left'} ${stickyClasses}`}>
                        {cell}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="px-3 py-1 border-t border-border text-xs text-muted-foreground print:hidden">{rows.length} record(s)</div>
      </div>
    </div>
  );
}

// ── Trial Balance (hierarchical, decentralized filters + partner drill-down) ───
function TrialBalanceReport({ initialData, initialFromDate, initialToDate, initialColumnState }) {
  const [filters, setFilters] = useCachedFilters('trial_balance', {
    ...DEFAULT_FILTERS,
    fromDate: initialFromDate,
    toDate:   initialToDate,
    ...(initialColumnState || {}),
  });
  const [accounts,    setAccounts]    = useState([]);
  const [partnerRows, setPartnerRows] = useState({});  // { [groupId]: AccountRow[] }
  const [company,     setCompany]     = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [exportProgress, setExportProgress] = useState(null); // { current, total }
  const [hasLoaded,   setHasLoaded]   = useState(false);  // track if user has clicked Apply

  // Identify AR / AP control accounts — match by account_type + keyword
  const isARGroup = (account) =>
    account?.account_type === 'Asset' &&
    ['receivable', 'debtor'].some(p => account?.account_name?.toLowerCase().includes(p));
  const isAPGroup = (account) =>
    account?.account_type === 'Liability' &&
    ['payable', 'creditor'].some(p => account?.account_name?.toLowerCase().includes(p)) &&
    // Exclude tax payable, rent payable etc. — must specifically be trade/accounts payable
    ['accounts payable', 'trade payable', 'creditor'].some(p => account?.account_name?.toLowerCase().includes(p));

  // allAccounts ref — populated after load, used inside loadPartners
  const allAccountsRef = useRef([]);

  const load = useCallback(async () => {
    setLoading(true);
    setHasLoaded(true);
    setPartnerRows({}); // reset partner data on each reload
    try {
      const [{ fetchReportData }, settings] = await Promise.all([
        import('@/lib/reportDataFetcher'),
        sajilo.entities.CompanySettings.list()
      ]);
      if (settings.length > 0) setCompany(settings[0]);

      const data = await fetchReportData('trial_balance', filters.fromDate, filters.toDate);
      
      // Synthesize group nodes by account_type to restore hierarchical grouping
      const enrichedAccounts = [];
      const types = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense', 'COGS'];
      const sortOrder = { 'Asset': 1, 'Liability': 2, 'Equity': 3, 'Revenue': 4, 'COGS': 5, 'Expense': 6 };
      
      types.forEach(type => {
        enrichedAccounts.push({
          id: `VIRTUAL_${type}`,
          account_code: String(sortOrder[type] || 99), // Used for sorting at the root level
          account_name: type.toUpperCase(),
          account_type: type,
          ledger_type: 'Group Ledger',
          parent_account_id: null,
          opening_debit: 0, opening_credit: 0,
          current_debit: 0, current_credit: 0,
          closing_debit: 0, closing_credit: 0,
        });
      });
      
      data.forEach(a => {
        // Map common variations of type
        let mappedType = a.account_type;
        if (['Income', 'Other Income'].includes(a.account_type)) mappedType = 'Revenue';
        if (['Expenses', 'OPEX', 'Operating Expense', 'Other Expense'].includes(a.account_type)) mappedType = 'Expense';
        if (['Cost of Sales', 'Cost of Goods Sold'].includes(a.account_type)) mappedType = 'COGS';

        if (mappedType && types.includes(mappedType)) {
          enrichedAccounts.push({
            ...a,
            parent_account_id: `VIRTUAL_${mappedType}`
          });
        } else {
          // Unmatched falls to root
          enrichedAccounts.push(a);
        }
      });
      
      setAccounts(enrichedAccounts);
    } catch (err) {
      console.error('[TrialBalance load error]', err);
    }
    setLoading(false);
  }, [filters.fromDate, filters.toDate]);

  // Partner drill-down disabled: partners are natively in the GL as Sub Ledgers.

  // Do NOT auto-load — wait for user to click Apply
  // useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <ReportFilterBar filters={filters} onChange={setFilters} onApply={load} showApplyButton />
      </div>
      {!hasLoaded ? (
        <div className="py-16 text-center space-y-3">
          <div className="text-4xl">📊</div>
          <p className="text-sm font-semibold text-foreground">Select your date range and click <span className="text-primary">Apply</span> to generate the Trial Balance.</p>
          <p className="text-xs text-muted-foreground">Accounts are loaded only after you apply filters to avoid unnecessary delays.</p>
        </div>
      ) : loading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading accounts…</div>
      ) : (
        <>
          <BusinessHeader reportTitle="Trial Balance" fromDate={filters.fromDate} toDate={filters.toDate} subtitle={`As of ${filters.toDate}`} />
          <FinancialReportTable
            accounts={accounts}
            columnState={filters}
            filename="trial_balance.xlsx"
            companyName={company?.company_name}
            reportTitle="Trial Balance"
            fromDate={filters.fromDate}
            toDate={filters.toDate}
            partnerRows={{}}
            onGroupExpand={() => {}}
          />
        </>
      )}
    </div>
  );
}

// ── Generic partner report (AR / AP) with metadata column picker ──────────────

function CashFlowReport({ initialFromDate, initialToDate }) {
  const { displayBsDate } = useDateFormat();
  const fmtNPR = useFmtNPR();

  const [filters, setFilters] = useCachedFilters('cash_flow', { ...DEFAULT_FILTERS, showBsDate: displayBsDate, fromDate: initialFromDate, toDate: initialToDate });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const [hasLoaded, setHasLoaded] = useCachedState('cash_flow_hasLoaded', false);

  const load = useCallback(async () => {
    setHasLoaded(true);
    setLoading(true);
    try {
      const { fetchReportData } = await import('@/lib/reportDataFetcher');
      const data = await fetchReportData('cash_flow', filters.fromDate, filters.toDate);
      setData(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [filters.fromDate, filters.toDate]);

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <ReportFilterBar filters={filters} onChange={setFilters} onApply={load} showApplyButton />
      </div>
      {!hasLoaded ? (
        <div className="py-16 text-center space-y-3">
          <div className="text-4xl">📊</div>
          <p className="text-sm font-semibold text-foreground">Select your date range and click <span className="text-primary">Apply</span> to generate.</p>
        </div>
      ) : loading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading Cash Flow...</div>
      ) : !data ? (
        <div className="py-10 text-center text-muted-foreground text-sm">No data found.</div>
      ) : (
        <ReportTable
          title="Cash Flow Summary (Direct Method)"
          fromDate={filters.fromDate}
          toDate={filters.toDate}
          headers={['Date', ...(filters.showBsDate ? ['Date (BS)'] : []), 'Type', 'Voucher #', 'Description', 'Amount (NPR)']}
          rows={data.details.map(d => [
            d.date, 
            ...(filters.showBsDate ? [d.bs_date_formatted] : []),
            d.type, 
            <VoucherLink voucherNumber={d.ref}><span className="cursor-pointer text-primary">{d.ref}</span></VoucherLink>, 
            d.desc, 
            fmtNPR(d.amount)
          ])}
          footer={['', ...(filters.showBsDate ? [''] : []), '', '', 'NET CASH FLOW', fmtNPR(data.netCashFlow)]}
          onExport={async () => {
            const columns = ['Date', ...(filters.showBsDate ? ['Date (BS)'] : []), 'Type', 'Voucher #', 'Description', 'Amount (NPR)'];
            const excelRows = (data?.details || []).map(d => [
              d.date,
              ...(filters.showBsDate ? [d.bs_date_formatted || ''] : []),
              d.type,
              d.ref || '',
              d.desc || '',
              d.amount || 0,
            ]);
            const excelFooter = ['', ...(filters.showBsDate ? [''] : []), '', '', 'NET CASH FLOW', data?.netCashFlow || 0];
            await exportFlatXLSX({
              filename: `Cash_Flow_Summary_${filters.fromDate}_${filters.toDate}.xlsx`,
              reportTitle: 'Cash Flow Summary (Direct Method)',
              fromDate: filters.fromDate,
              toDate: filters.toDate,
              headers: columns,
              rows: excelRows,
              footer: excelFooter,
            });
          }}
          onPrintPdf={async () => {
            const columns = ['Date', ...(filters.showBsDate ? ['Date (BS)'] : []), 'Type', 'Voucher #', 'Description', 'Amount (NPR)'];
            const pdfData = data.details.map(d => [
              d.date,
              ...(filters.showBsDate ? [d.bs_date_formatted] : []),
              d.type,
              d.ref, // Extract raw string instead of JSX
              d.desc,
              fmtNPR(d.amount)
            ]);
            const footerData = ['', ...(filters.showBsDate ? [''] : []), '', '', 'NET CASH FLOW', fmtNPR(data.netCashFlow)];
            
            await generateReportVectorPDF({
              title: "Cash Flow Summary (Direct Method)",
              fromDate: filters.fromDate,
              toDate: filters.toDate,
              columns,
              data: pdfData,
              footer: footerData,
              filename: 'Cash_Flow_Summary.pdf'
            });
          }}
        />
      )}
    </div>
  );
}



function PartnerSummaryReport({ title, mode, reportId, initialFromDate, initialToDate }) {
  const fmtNPR = useFmtNPR();

  const [filters, setFilters] = useCachedFilters(`partner_summary_${reportId}`, { ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate });
  const [data, setData] = useCachedState(`partner_summary_data_${reportId}`, []);
  const [partners, setPartners] = useCachedState(`partner_summary_partners_${reportId}`, []);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useCachedState(`partner_summary_hasLoaded_${reportId}`, false);
  const [metaCols, setMetaCols] = useState({ phone: false, tax_id: false, address: false });

  const isAR = mode === 'ar';

  const load = useCallback(async () => {
    setLoading(true); setHasLoaded(true);
    try {
      const [reportData, partnerData] = await Promise.all([
        fetchReportData(reportId, filters.fromDate, filters.toDate),
        sajilo.entities.BusinessPartner.filter({ [isAR ? 'is_customer' : 'is_vendor']: true })
      ]);
      setData(reportData);
      setPartners(partnerData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [filters.fromDate, filters.toDate, reportId, isAR]);

  // useEffect(() => { load(); }, [load]);

  const partnerMap = {};
  partners.forEach(p => { partnerMap[p.name] = p; });

  let baseHeaders = [];
  let rowMapper = () => [];
  let footerBuilder = null;
  
  if (reportId.includes('aging_summary')) {
    // Fetcher returns pivot objects: {customer, current, 30d, 60d, '60d+', total} for AR
    //                                {vendor, current, 30d, 60d, '60d+', total} for AP
    baseHeaders = [isAR ? 'Customer' : 'Supplier', 'Current (NPR)', '1-30 Days (NPR)', '31-60 Days (NPR)', '60+ Days (NPR)', 'Total (NPR)'];
    rowMapper = (r, meta) => [
      r.customer || r.vendor || 'Unknown',
      fmtNPR(r.current || 0),
      fmtNPR(r['30d']  || 0),
      fmtNPR(r['60d']  || 0),
      fmtNPR(r['60d+'] || 0),
      fmtNPR(r.total   || 0),
      ...meta
    ];
    footerBuilder = (rows) => ['TOTAL',
      fmtNPR(rows.reduce((s, r) => s + (r.current || 0), 0)),
      fmtNPR(rows.reduce((s, r) => s + (r['30d']  || 0), 0)),
      fmtNPR(rows.reduce((s, r) => s + (r['60d']  || 0), 0)),
      fmtNPR(rows.reduce((s, r) => s + (r['60d+'] || 0), 0)),
      fmtNPR(rows.reduce((s, r) => s + (r.total   || 0), 0)),
    ];
  } else if (reportId === 'customer_balance') {
    baseHeaders = ['Customer', 'Total Invoiced (NPR)', 'Total Paid (NPR)', 'Balance (NPR)'];
    rowMapper = (r, meta) => [r.customer, fmtNPR(r.total_invoiced), fmtNPR(r.total_paid), fmtNPR(r.balance), ...meta];
    footerBuilder = (rows) => ['TOTAL', '', '', fmtNPR(rows.reduce((s, r) => s + (r.balance || 0), 0))];
  } else if (reportId === 'vendor_balance') {
    baseHeaders = ['Supplier', 'Total Billed (NPR)', 'Total Paid (NPR)', 'Balance (NPR)'];
    rowMapper = (r, meta) => [r.vendor, fmtNPR(r.total_billed), fmtNPR(r.total_paid), fmtNPR(r.balance), ...meta];
    footerBuilder = (rows) => ['TOTAL', '', '', fmtNPR(rows.reduce((s, r) => s + (r.balance || 0), 0))];
  } else if (reportId === 'debtor_statement' || reportId === 'vendor_statement') {
     // fallback if mapped here
     baseHeaders = ['Partner', 'Balance'];
     rowMapper = (r, meta) => [r.name, r.balance, ...meta];
  }

  const metaHeaders = [
    ...(metaCols.phone   ? ['Contact No.'] : []),
    ...(metaCols.tax_id  ? ['PAN/TAX ID']  : []),
    ...(metaCols.address ? ['Address']     : []),
  ];
  const headers = [...baseHeaders, ...metaHeaders];

  const tableRows = (data || []).map(r => {
    const pName = r.customer_name || r.vendor_name || r.customer || r.vendor || r.name;
    const partner = partnerMap[pName] || {};
    const meta = [
      ...(metaCols.phone   ? [partner.phone || '—'] : []),
      ...(metaCols.tax_id  ? [partner.tax_id_number || '—'] : []),
      ...(metaCols.address ? [partner.address || '—'] : []),
    ];
    return rowMapper(r, meta);
  });

  const metaCheckbox = (key, label) => (
    <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
      <input type="checkbox" checked={metaCols[key]} onChange={e => setMetaCols(p => ({ ...p, [key]: e.target.checked }))}
        className="rounded border-input" />
      {label}
    </label>
  );

  const extraOptions = (
    <div className="space-y-2">
      {metaCheckbox('phone',   'Contact Number')}
      {metaCheckbox('tax_id',  'PAN / TAX ID')}
      {metaCheckbox('address', 'Billing Address')}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <ReportFilterBar filters={filters} onChange={setFilters} onApply={load} showApplyButton extraOptions={extraOptions} />
      </div>
      {!hasLoaded ? (
        <div className="py-16 text-center space-y-3">
          <div className="text-4xl">📊</div>
          <p className="text-sm font-semibold text-foreground">Click <span className="text-primary">Apply</span> to generate.</p>
        </div>
      ) : loading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading...</div>
      ) : (
        <ReportTable
            title={title}
            fromDate={filters.fromDate}
            toDate={filters.toDate}
            headers={[...baseHeaders, ...metaHeaders]}
            rows={tableRows}
            footer={footerBuilder ? footerBuilder(data || []) : undefined}
            onExport={async () => {
              const excelRows = (data || []).map(r => {
                const pName = r.customer_name || r.vendor_name || r.customer || r.vendor || r.name;
                const partner = partnerMap[pName] || {};
                const meta = [
                  ...(metaCols.phone   ? [partner.phone || ''] : []),
                  ...(metaCols.tax_id  ? [partner.tax_id_number || ''] : []),
                  ...(metaCols.address ? [partner.address || ''] : []),
                ];
                if (reportId.includes('aging_summary')) {
                  return [
                    r.customer || r.vendor || 'Unknown',
                    r.current || 0,
                    r['30d'] || 0,
                    r['60d'] || 0,
                    r['60d+'] || 0,
                    r.total || 0,
                    ...meta,
                  ];
                } else if (reportId === 'customer_balance') {
                  return [r.customer || '', r.total_invoiced || 0, r.total_paid || 0, r.balance || 0, ...meta];
                } else if (reportId === 'vendor_balance') {
                  return [r.vendor || '', r.total_billed || 0, r.total_paid || 0, r.balance || 0, ...meta];
                }
                return rowMapper(r, meta);
              });

              const excelFooter = (() => {
                if (reportId.includes('aging_summary')) {
                  return ['TOTAL',
                    (data || []).reduce((s, r) => s + (r.current || 0), 0),
                    (data || []).reduce((s, r) => s + (r['30d'] || 0), 0),
                    (data || []).reduce((s, r) => s + (r['60d'] || 0), 0),
                    (data || []).reduce((s, r) => s + (r['60d+'] || 0), 0),
                    (data || []).reduce((s, r) => s + (r.total || 0), 0),
                  ];
                } else if (reportId === 'customer_balance' || reportId === 'vendor_balance') {
                  return ['TOTAL', '', '', (data || []).reduce((s, r) => s + (r.balance || 0), 0)];
                }
                return footerBuilder ? footerBuilder(data || []) : undefined;
              })();

              await exportFlatXLSX({
                filename: `${title.replace(/\s+/g, '_')}_${filters.fromDate}_${filters.toDate}.xlsx`,
                reportTitle: title,
                fromDate: filters.fromDate,
                toDate: filters.toDate,
                headers: [...baseHeaders, ...metaHeaders],
                rows: excelRows,
                footer: excelFooter,
              });
            }}
            onPrintPdf={() => {
              generateReportVectorPDF({
                title,
                fromDate: filters.fromDate,
                toDate: filters.toDate,
                columns: [...baseHeaders, ...metaHeaders],
                data: tableRows,
                footer: footerBuilder ? footerBuilder(data || []) : undefined,
                filename: `${title.replace(/\s+/g, '_')}.pdf`
              });
            }}
        />
      )}
    </div>
  );
}

function PartnerReport({ title, mode, initialFromDate, initialToDate }) {
  const { displayBsDate } = useDateFormat();
  const fmtNPR = useFmtNPR();

  const [filters,   setFilters]   = useCachedFilters(`partner_report_${mode}`, { ...DEFAULT_FILTERS, showBsDate: displayBsDate, fromDate: initialFromDate, toDate: initialToDate });
  const [partners,  setPartners]  = useCachedState(`partner_report_partners_${mode}`, []);
  const [invoices,  setInvoices]  = useCachedState(`partner_report_invoices_${mode}`, []);
  const [loading,   setLoading]   = useState(false);
  const [hasLoaded, setHasLoaded] = useCachedState(`partner_report_hasLoaded_${mode}`, false);
  const [metaCols,  setMetaCols]  = useState({ phone: false, tax_id: false, address: false });

  const isAR = mode === 'ar';

  const load = useCallback(async () => {
    setHasLoaded(true);
    setLoading(true);
    const [partnerData, invData] = await Promise.all([
      sajilo.entities.BusinessPartner.filter({ [isAR ? 'is_customer' : 'is_vendor']: true }),
      isAR
        ? sajilo.entities.SalesInvoice.list('-invoice_date', 2000)
        : sajilo.entities.PurchaseInvoice.list('-invoice_date', 2000),
    ]);
    setPartners(partnerData);
    setInvoices(invData.map(i => ({ ...i, bs_date_formatted: adToBS(i.invoice_date || i.bill_date) ? formatBS(adToBS(i.invoice_date || i.bill_date)) : '' })));
    setLoading(false);
  }, [isAR]);

  // Do NOT auto-load on mount
  // useEffect(() => { load(); }, []);

  const partnerMap = {};
  partners.forEach(p => { partnerMap[p.name] = p; });

  const rows = invoices
    .filter(i => i.status === 'Posted' && i.payment_status !== 'Paid')
    .filter(i => inRange(isAR ? i.invoice_date : (i.invoice_date || i.bill_date), filters.fromDate, filters.toDate));

  const baseHeaders = [isAR ? 'Customer' : 'Supplier', 'Invoice #', 'Date', ...(filters.showBsDate ? ['Date (BS)'] : []), 'Due Date', 'Amount (NPR)', 'Days Overdue', 'Status'];
  const metaHeaders = [
    ...(metaCols.phone   ? ['Contact No.'] : []),
    ...(metaCols.tax_id  ? ['PAN/TAX ID']  : []),
    ...(metaCols.address ? ['Address']     : []),
  ];
  const headers = [...baseHeaders, ...metaHeaders];

  const today = new Date().toISOString().slice(0, 10);
  const tableRows = rows.map(i => {
    const partnerName = isAR ? i.customer_name : i.vendor_name;
    const partner     = partnerMap[partnerName] || {};
    const date        = i.invoice_date || i.bill_date || '';
    const due         = i.due_date || date;
    const days        = due < today ? Math.floor((Date.now() - new Date(due)) / 86400000) : 0;
    const invoiceNum = i.invoice_number || i.bill_number;
    const base = [
      partnerName,
      invoiceNum ? <VoucherLink voucherNumber={invoiceNum}><span className="cursor-pointer text-primary hover:underline">{invoiceNum}</span></VoucherLink> : '—',
      date,
      ...(filters.showBsDate ? [i.bs_date_formatted] : []),
      due,
      fmtNPR(i.grand_total),
      days > 0 ? `${days} days` : 'Current',
      i.payment_status,
    ];
    const meta = [
      ...(metaCols.phone   ? [partner.phone            || '—'] : []),
      ...(metaCols.tax_id  ? [partner.tax_id_number    || '—'] : []),
      ...(metaCols.address ? [partner.address          || '—'] : []),
    ];
    return [...base, ...meta];
  });

  const handleExport = () => downloadCSV(
    `${mode}_aging.csv`,
    headers,
    tableRows.map(r => r.map(c => (typeof c === 'string' ? c : String(c ?? ''))))
  );

  const metaCheckbox = (key, label) => (
    <label key={key} className="flex items-center gap-2 text-xs cursor-pointer">
      <input type="checkbox" checked={metaCols[key]} onChange={e => setMetaCols(p => ({ ...p, [key]: e.target.checked }))}
        className="rounded border-input" />
      {label}
    </label>
  );

  const extraOptions = (
    <div className="space-y-2">
      {metaCheckbox('phone',   'Contact Number')}
      {metaCheckbox('tax_id',  'PAN / TAX ID')}
      {metaCheckbox('address', 'Billing Address')}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <ReportFilterBar filters={filters} onChange={setFilters} onApply={load} showApplyButton extraOptions={extraOptions} />
      </div>
      {!hasLoaded ? (
        <div className="py-16 text-center space-y-3">
          <div className="text-4xl">📊</div>
          <p className="text-sm font-semibold text-foreground">Select your date range and click <span className="text-primary">Apply</span> to generate this report.</p>
        </div>
      ) : loading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading {isAR ? 'receivables' : 'payables'}…</div>
      ) : (
        <ReportTable
            title={title}
            fromDate={filters.fromDate}
            toDate={filters.toDate}
            headers={headers}
            rows={tableRows}
            onExport={handleExport}
            onPrintPdf={() => {
              const pdfRows = rows.map(i => {
                const partnerName = isAR ? i.customer_name : i.vendor_name;
                const partner     = partnerMap[partnerName] || {};
                const date        = i.invoice_date || i.bill_date || '';
                const due         = i.due_date || date;
                const days        = due < today ? Math.floor((Date.now() - new Date(due)) / 86400000) : 0;
                const invoiceNum  = i.invoice_number || i.bill_number || '-';
                
                const base = [
                  partnerName,
                  invoiceNum, // Raw string instead of JSX
                  date,
                  ...(filters.showBsDate ? [i.bs_date_formatted] : []),
                  due,
                  fmtNPR(i.grand_total),
                  days > 0 ? `${days} days` : 'Current',
                  i.payment_status,
                ];
                const meta = [
                  ...(metaCols.phone   ? [partner.phone            || '-'] : []),
                  ...(metaCols.tax_id  ? [partner.tax_id_number    || '-'] : []),
                  ...(metaCols.address ? [partner.address          || '-'] : []),
                ];
                return [...base, ...meta];
              });

              generateReportVectorPDF({
                title,
                fromDate: filters.fromDate,
                toDate: filters.toDate,
                columns: headers,
                data: pdfRows,
                filename: `${title.replace(/\s+/g, '_')}.pdf`
              });
            }}
          />
      )}
    </div>
  );
}

// ── Profit & Loss (Multi-Step Enterprise Format) ────────────────────────────────
function BalanceSheetReport({ initialData, initialFromDate, initialToDate }) {
  const [filters, setFilters] = useCachedFilters('balance_sheet', { ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate, reportType: 'balance_sheet' });
  const [accounts, setAccounts] = useCachedState('balance_sheet_accounts', []);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useCachedState('balance_sheet_hasLoaded', false);

  const load = useCallback(async () => {
    setHasLoaded(true);
    setLoading(true);
    try {
      const { fetchReportData } = await import('@/lib/reportDataFetcher');
      const [allCoA, { accounts: rpcAccounts }] = await Promise.all([
        sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 2000),
        fetchReportData('balance_sheet', filters.fromDate, filters.toDate)
      ]);

      const balanceMap = {};
      rpcAccounts.forEach(a => { balanceMap[a.id] = a.closing_balance || 0; });

      // Merge balances natively for ALL levels (Sub Ledgers & Group Ledgers)
      const merged = allCoA
        .filter(a => ['Asset', 'Liability', 'Equity'].includes(a.account_type))
        .map(a => {
          return { ...a, closing_balance: balanceMap[a.id] || 0 };
        });

      // Inject Current Year Earnings natively into the tree
      const virtualEarnings = rpcAccounts.find(a => a.id === 'virtual-current-year-earnings');
      if (virtualEarnings) {
        // Find Equity root to nest under
        const equityRoot = merged.find(a => a.account_type === 'Equity' && a.ledger_type === 'Group Ledger' && !a.parent_account_id);
        merged.push({
          ...virtualEarnings,
          parent_account_id: equityRoot ? equityRoot.id : null
        });
      }

      setAccounts(merged);
    } catch (err) {
      console.error('[BalanceSheet load error]', err);
    }
    setLoading(false);
  }, [filters.fromDate, filters.toDate]);

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <ReportFilterBar filters={filters} onChange={setFilters} onApply={load} showApplyButton />
      </div>
      {!hasLoaded ? (
        <div className="py-16 text-center space-y-3">
          <div className="text-4xl">📊</div>
          <p className="text-sm font-semibold text-foreground">Select your date range and click <span className="text-primary">Apply</span> to generate the Balance Sheet.</p>
        </div>
      ) : loading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading accounts…</div>
      ) : (
        <>
          <BusinessHeader reportTitle="Balance Sheet" fromDate={filters.fromDate} toDate={filters.toDate} subtitle={`As of ${filters.toDate}`} />
          <FinancialReportTable
            accounts={accounts}
            columnState={{ ...filters, reportType: 'balance_sheet' }}
            filename="balance_sheet.xlsx"
            reportTitle="Balance Sheet"
            fromDate={filters.fromDate}
            toDate={filters.toDate}
          />
        </>
      )}
    </div>
  );
}

// ── Simple flat report with local filter ──────────────────────────────────────
function SimpleReport({ title, reportId, initialData, initialFromDate, initialToDate, renderFn }) {
  const { displayBsDate } = useDateFormat();
  const [filters,   setFilters]   = useCachedFilters(`simple_report_${reportId}`, { ...DEFAULT_FILTERS, showBsDate: displayBsDate, fromDate: initialFromDate, toDate: initialToDate });
  const [data,      setData]      = useCachedState(`simple_report_data_${reportId}`, initialData);
  const [loading,   setLoading]   = useState(false);
  const [hasLoaded, setHasLoaded] = useCachedState(`simple_report_hasLoaded_${reportId}`, !!initialData);

  const load = useCallback(async () => {
    setHasLoaded(true);
    setLoading(true);
    const { fetchReportData } = await import('@/lib/reportDataFetcher');
    const result = await fetchReportData(reportId, filters.fromDate, filters.toDate);
    setData(result);
    setLoading(false);
  }, [reportId, filters.fromDate, filters.toDate]);

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <ReportFilterBar filters={filters} onChange={setFilters} onApply={load} showApplyButton />
      </div>
      {!hasLoaded ? (
        <div className="py-16 text-center space-y-3">
          <div className="text-4xl">📊</div>
          <p className="text-sm font-semibold text-foreground">Select your date range and click <span className="text-primary">Apply</span> to generate this report.</p>
        </div>
      ) : loading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
      ) : (
        renderFn(data || [], filters.fromDate, filters.toDate, filters.showBsDate)
      )}
    </div>
  );
}
// ── Detail General Ledger (with Account Picker) ───────────────────────────────
function GeneralLedgerDetailReport({ initialFromDate, initialToDate }) {
  const { displayBsDate } = useDateFormat();
  const fmtNPR = useFmtNPR();
  const [filters,   setFilters]   = useCachedFilters('general_ledger_detail', { ...DEFAULT_FILTERS, showBsDate: displayBsDate, fromDate: initialFromDate, toDate: initialToDate, accountId: '' });
  const [accounts,  setAccounts]  = useState([]);
  const [lines,     setLines]     = useCachedState('general_ledger_detail_lines', []);
  const [summary,   setSummary]   = useCachedState('general_ledger_detail_summary', { ob: 0, cb: 0, obIsDr: true, cbIsDr: true });
  const [loading,   setLoading]   = useState(false);
  const [hasLoaded, setHasLoaded] = useCachedState('general_ledger_detail_hasLoaded', false);
  const [showCommModal, setShowCommModal] = useState(false);

  useEffect(() => {
    sajilo.entities.ChartOfAccount.filter({ is_active: true, ledger_type: 'Sub Ledger' }, 'account_name', 1000).then(res => {
      setAccounts(res);
      if (res.length > 0 && !filters.accountId) {
        setFilters(p => ({ ...p, accountId: res[0].id }));
      }
    });
  }, []);

  const load = useCallback(async () => {
    if (!filters.accountId) return;
    setHasLoaded(true);
    setLoading(true);
    try {
      const { fetchReportData } = await import('@/lib/reportDataFetcher');
      const data = await fetchReportData('ledger_detail', filters.fromDate, filters.toDate, { accountId: filters.accountId });
      
      const acc = accounts.find(a => a.id === filters.accountId);
      const isDebitNormal = acc?.normal_balance 
        ? acc.normal_balance === 'Debit' 
        : ['Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense'].includes(acc?.account_type);

      const dbRows = data || [];
      
      const obRow = dbRows.find(r => r.is_opening);
      let ob = 0, obIsDr = true;
      if (obRow) {
         ob = Math.abs(obRow.running_balance || 0);
         obIsDr = isDebitNormal ? (obRow.running_balance || 0) >= 0 : (obRow.running_balance || 0) < 0;
      }
      
      const validLines = dbRows.filter(r => !r.is_opening).map(l => {
        const balNum = Number(l.running_balance || 0);
        return {
          ...l,
          date: l.entry_date,
          bs_date_formatted: adToBS(l.entry_date) ? formatBS(adToBS(l.entry_date)) : '',
          dr: Number(l.debit_amount || 0),
          cr: Number(l.credit_amount || 0),
          bal: Math.abs(balNum),
          balIsDr: isDebitNormal ? balNum >= 0 : balNum < 0
        };
      });

      let cb = ob, cbIsDr = obIsDr;
      if (validLines.length > 0) {
         const lastLine = validLines[validLines.length - 1];
         cb = lastLine.bal;
         cbIsDr = lastLine.balIsDr;
      }

      setSummary({ ob, obIsDr, cb, cbIsDr });
      setLines(validLines);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [filters.accountId, filters.fromDate, filters.toDate, accounts]);

  const accPicker = (
    <div className="flex flex-col gap-1 min-w-[200px]">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Account</label>
      <SearchableSelect
        options={accounts.map(a => ({ value: a.id, label: `${a.account_name} (${a.account_code})` }))}
        value={filters.accountId}
        onChange={val => setFilters(p => ({ ...p, accountId: val }))}
        placeholder="Select Account..."
        className="h-8 bg-card text-xs"
      />
    </div>
  );

  const acc = accounts.find(a => a.id === filters.accountId);
  const title = `Detail General Ledger: ${acc ? acc.account_name : '...'}`;

  const tableRows = [
    // OB Row
    ['', ...(filters.showBsDate ? [''] : []), '', 'Opening Balance', '', '', fmtNPR(summary.ob) + (summary.obIsDr ? ' Dr' : ' Cr')],
    ...lines.map(l => {
      const displayVoucher = (l.voucher_no && l.voucher_no !== 'AUTO' && l.voucher_no !== 'REV-AUTO') ? l.voucher_no : (l.reference_number || '');
      return [
        l.date,
        ...(filters.showBsDate ? [l.bs_date_formatted] : []),
        displayVoucher ? <VoucherLink voucherNumber={displayVoucher}><span className="cursor-pointer text-primary">{displayVoucher}</span></VoucherLink> : '',
        l.description || 'Journal Entry',
        fmtNPR(l.dr),
        fmtNPR(l.cr),
        fmtNPR(l.bal) + (l.balIsDr ? ' Dr' : ' Cr')
      ];
    })
  ];

  const handleExport = () => downloadCSV('general_ledger_detail.csv',
    ['Date', ...(filters.showBsDate ? ['Date (BS)'] : []), 'Voucher #', 'Description', 'Debit', 'Credit', 'Balance'],
    [
      ['', ...(filters.showBsDate ? [''] : []), '', 'Opening Balance', '', '', fmtNPR(summary.ob) + (summary.obIsDr ? ' Dr' : ' Cr')],
      ...lines.map(l => {
        const displayVoucher = (l.voucher_no && l.voucher_no !== 'AUTO' && l.voucher_no !== 'REV-AUTO') ? l.voucher_no : (l.reference_number || '');
        return [
          l.date,
          ...(filters.showBsDate ? [l.bs_date_formatted] : []),
          displayVoucher,
          l.description || 'Journal Entry',
          fmtNPR(l.dr),
          fmtNPR(l.cr),
          fmtNPR(l.bal) + (l.balIsDr ? ' Dr' : ' Cr')
        ];
      })
    ]
  );

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <ReportFilterBar filters={filters} onChange={setFilters} onApply={load} showApplyButton extraOptions={accPicker} />
      </div>
      {!hasLoaded ? (
        <div className="py-16 text-center space-y-3">
          <div className="text-4xl">📊</div>
          <p className="text-sm font-semibold text-foreground">Select an account and click <span className="text-primary">Apply</span>.</p>
        </div>
      ) : loading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading ledger…</div>
      ) : (
        <>
          <ReportTable title={title} fromDate={filters.fromDate} toDate={filters.toDate}
            headers={['Date', ...(filters.showBsDate ? ['Date (BS)'] : []), 'Voucher #', 'Description', 'Debit (NPR)', 'Credit (NPR)', 'Balance (NPR)']}
            rows={tableRows}
            footer={['', ...(filters.showBsDate ? [''] : []), '', 'Closing Balance', fmtNPR(lines.reduce((s,l)=>s+l.dr,0)), fmtNPR(lines.reduce((s,l)=>s+l.cr,0)), fmtNPR(summary.cb) + (summary.cbIsDr ? ' Dr' : ' Cr')]}
            onExport={handleExport}
            onEmail={() => setShowCommModal(true)}
          />
          <CommunicationModal 
            open={showCommModal} 
            onOpenChange={setShowCommModal}
            module="GeneralLedger"
            referenceId={filters.accountId} // Treating the account ID as reference
            partnerId={null} // GL Statement usually isn't tied to a specific business partner in this context
            companyId={sajilo.getCompanyId()}
            payload={{
              reportTitle: title,
              fromDate: filters.fromDate,
              toDate: filters.toDate,
              linesCount: lines.length,
              closingBalance: summary.cb
            }}
          />
        </>
      )}
    </div>
  );
}

// ── Stock Ledger Statement Report ───────────────────────────────────────────────
function StockLedgerStatementReport({ initialFromDate, initialToDate }) {
  const { displayBsDate } = useDateFormat();
  const fmtNPR = useFmtNPR();
  const [filters,   setFilters]   = useCachedFilters('stock_ledger_detail', { ...DEFAULT_FILTERS, showBsDate: displayBsDate, fromDate: initialFromDate, toDate: initialToDate, itemId: '' });
  const [items,     setItems]     = useState([]);
  const [lines,     setLines]     = useCachedState('stock_ledger_detail_lines', []);
  const [loading,   setLoading]   = useState(false);
  const [hasLoaded, setHasLoaded] = useCachedState('stock_ledger_detail_hasLoaded', false);
  const [showCommModal, setShowCommModal] = useState(false);

  useEffect(() => {
    sajilo.entities.Item.filter({ is_physical: true }, 'item_name', 1000).then(res => {
      setItems(res);
      if (res.length > 0 && !filters.itemId) {
        setFilters(p => ({ ...p, itemId: res[0].id }));
      }
    });
  }, []);

  const load = useCallback(async () => {
    if (!filters.itemId) return;
    setHasLoaded(true);
    setLoading(true);
    try {
      const { fetchReportData } = await import('@/lib/reportDataFetcher');
      const data = await fetchReportData('stock_ledger_statement', filters.fromDate, filters.toDate, { itemId: filters.itemId });
      
      const dbRows = data || [];
      const formattedLines = dbRows.map(l => ({
        ...l,
        date: l.entry_date,
        bs_date_formatted: adToBS(l.entry_date) ? formatBS(adToBS(l.entry_date)) : '',
        qty_in: Number(l.quantity_in || 0),
        val_in: Number(l.total_amount_in || 0),
        qty_out: Number(l.quantity_out || 0),
        val_out: Number(l.total_amount_out || 0),
        qty_bal: Number(l.quantity_balance || 0),
        val_bal: Number(l.value_balance || 0),
      }));

      setLines(formattedLines);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [filters.itemId, filters.fromDate, filters.toDate, items]);

  const itemPicker = (
    <div className="flex flex-col gap-1 min-w-[200px]">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Item</label>
      <SearchableSelect
        options={items.map(a => ({ value: a.id, label: a.item_code ? `${a.item_name} (${a.item_code})` : a.item_name }))}
        value={filters.itemId}
        onChange={val => setFilters(p => ({ ...p, itemId: val }))}
        placeholder="Select Item..."
        className="h-8 bg-card text-xs"
      />
    </div>
  );

  const selectedItem = items.find(a => a.id === filters.itemId);
  const title = `Stock Ledger Statement: ${selectedItem ? selectedItem.item_name : '...'}`;

  const tableRows = lines.map(l => [
    l.date,
    ...(filters.showBsDate ? [l.bs_date_formatted] : []),
    l.transaction_type,
    l.voucher_no ? <VoucherLink voucherNumber={l.voucher_no}><span className="cursor-pointer text-primary">{l.voucher_no}</span></VoucherLink> : '',
    l.description,
    Number(l.qty_in).toLocaleString(),
    fmtNPR(l.val_in),
    Number(l.qty_out).toLocaleString(),
    fmtNPR(l.val_out),
    Number(l.qty_bal).toLocaleString(),
    fmtNPR(l.val_bal)
  ]);

  const handleExport = () => downloadCSV('stock_ledger_statement.csv',
    ['Date', ...(filters.showBsDate ? ['Date (BS)'] : []), 'Type', 'Voucher #', 'Description', 'Qty In', 'Val In', 'Qty Out', 'Val Out', 'Qty Balance', 'Value Balance'],
    lines.map(l => [
      l.date,
      ...(filters.showBsDate ? [l.bs_date_formatted] : []),
      l.transaction_type,
      l.voucher_no,
      l.description,
      Number(l.qty_in).toLocaleString(),
      fmtNPR(l.val_in),
      Number(l.qty_out).toLocaleString(),
      fmtNPR(l.val_out),
      Number(l.qty_bal).toLocaleString(),
      fmtNPR(l.val_bal)
    ])
  );

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <ReportFilterBar filters={filters} onChange={setFilters} onApply={load} showApplyButton extraOptions={itemPicker} />
      </div>
      {!hasLoaded ? (
        <div className="py-16 text-center space-y-3">
          <div className="text-4xl">📊</div>
          <p className="text-sm font-semibold text-foreground">Select an item and click <span className="text-primary">Apply</span>.</p>
        </div>
      ) : loading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading stock statement…</div>
      ) : (
        <>
          <ReportTable title={title} fromDate={filters.fromDate} toDate={filters.toDate}
            headers={['Date', ...(filters.showBsDate ? ['Date (BS)'] : []), 'Type', 'Voucher #', 'Description', 'Qty In', 'Val In', 'Qty Out', 'Val Out', 'Qty Balance', 'Value Balance']}
            rows={tableRows}
            onExport={handleExport}
            onEmail={() => setShowCommModal(true)}
          />
          <CommunicationModal 
            open={showCommModal} 
            onOpenChange={setShowCommModal}
            module="Inventory"
            referenceId={filters.itemId}
            partnerId={null}
            companyId={sajilo.getCompanyId()}
            payload={{
              reportTitle: title,
              fromDate: filters.fromDate,
              toDate: filters.toDate,
              linesCount: lines.length
            }}
          />
        </>
      )}
    </div>
  );
}



// ── Main ReportViewer ─────────────────────────────────────────────────────────
export default function ReportViewer({ reportId, data, fromDate, toDate, columnState, onClose }) {
  const { formatNumber } = useAmountFormatter();
  const fmtNPR = (n) => {
    const num = Number(n || 0);
    if (num === 0) return '—';
    const absNum = Math.abs(num);
    const formatted = `NPR ${formatNumber(absNum)}`;
    return num < 0 ? `(${formatted})` : formatted;
  };

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);

  useEffect(() => {
    window.onXlsxProgress = (current, total) => {
      if (current === null) {
        setExportProgress(null);
      } else {
        setExportProgress({ current, total });
      }
    };
    return () => {
      delete window.onXlsxProgress;
    };
  }, []);

  const handlePrint = useCallback(async () => {
    setIsPreparingPrint(true);
    try {
      let extraParams = {};
      if (reportId === 'ledger_detail') {
        extraParams = filterCache['general_ledger_detail'] || {};
      } else if (reportId === 'stock_ledger_statement') {
        extraParams = filterCache['stock_ledger_detail'] || {};
      } else if (reportId === 'debtor_statement') {
        extraParams = filterCache['partner_statement_ar_filters'] || {};
      } else if (reportId === 'vendor_statement') {
        extraParams = filterCache['partner_statement_ap_filters'] || {};
      }

      const payload = {
        p_company_id: sajilo.getCompanyId(),
        p_report_type: reportId,
        p_parameters: { fromDate, toDate, ...columnState, ...extraParams },
        p_export_format: 'browser_print'
      };

      const logPromise = supabase.rpc('log_report_generation', payload);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
      
      try {
        await Promise.race([logPromise, timeoutPromise]);
      } catch (err) {
        try {
          let queue = JSON.parse(localStorage.getItem('erp_failed_audit_logs') || '[]');
          queue.push({ ...payload, _queuedAt: Date.now(), _id: crypto.randomUUID() });
          if (queue.length > 200) queue = queue.slice(queue.length - 200);
          localStorage.setItem('erp_failed_audit_logs', JSON.stringify(queue));
        } catch (storageError) {
          console.error('Audit queue write failed - log entry lost:', storageError, payload);
        }
      }

      const originalTitle = document.title;
      const rTitle = reportId ? reportId.replace(/_/g, ' ').toUpperCase() : 'REPORT';
      document.title = `${rTitle}_${format(new Date(), 'yyyyMMdd_HHmmss')}`; 
      window.print();
      document.title = originalTitle;
    } finally {
      setIsPreparingPrint(false);
    }
  }, [reportId, fromDate, toDate, columnState]);

  const renderContent = () => {
    switch (reportId) {
      case 'ledger_detail':
        return <GeneralLedgerDetailReport initialFromDate={fromDate} initialToDate={toDate} />;

      case 'stock_ledger_statement':
        return <StockLedgerStatementReport initialFromDate={fromDate} initialToDate={toDate} />;

      case 'debtor_statement':
        return <PartnerStatement title="Customer Statement" mode="ar" initialFromDate={fromDate} initialToDate={toDate} />;

      case 'vendor_statement':
        return <PartnerStatement title="Vendor Statement" mode="ap" initialFromDate={fromDate} initialToDate={toDate} />;

      case 'trial_balance':
        return <TrialBalanceReport initialData={data} initialFromDate={fromDate} initialToDate={toDate} initialColumnState={columnState} />;

      case 'profit_loss':
        return <ProfitLossReport initialData={data} initialFromDate={fromDate} initialToDate={toDate} />;

      case 'balance_sheet':
        return <BalanceSheetReport initialData={data} initialFromDate={fromDate} initialToDate={toDate} />;

      case 'ar_aging':
        return <PartnerReport title="Customer Receivable Ageing" mode="ar" initialFromDate={fromDate} initialToDate={toDate} />;

      case 'ap_aging':
        return <PartnerReport title="Supplier Payable Ageing" mode="ap" initialFromDate={fromDate} initialToDate={toDate} />;

      
      case 'cash_flow':
        return <CashFlowReport initialFromDate={fromDate} initialToDate={toDate} />;

      case 'ar_aging_summary':
        return <PartnerSummaryReport title="Customer Ageing Summary" mode="ar" reportId={reportId} initialFromDate={fromDate} initialToDate={toDate} />;

      case 'ap_aging_summary':
        return <PartnerSummaryReport title="Supplier Ageing Summary" mode="ap" reportId={reportId} initialFromDate={fromDate} initialToDate={toDate} />;

      case 'customer_balance':
        return <PartnerSummaryReport title="Customer Receivable Summary" mode="ar" reportId={reportId} initialFromDate={fromDate} initialToDate={toDate} />;

      case 'vendor_balance':
        return <PartnerSummaryReport title="Supplier Payable Summary" mode="ap" reportId={reportId} initialFromDate={fromDate} initialToDate={toDate} />;
        
      case 'sales_by_customer_monthly':
        return <SimpleReport title="Sales By Customer Monthly" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Sales By Customer Monthly" fromDate={fd} toDate={td}
              headers={['Customer', 'Month', 'Revenue (NPR)']}
              rows={rows.map(r => [r.customer, r.month, fmtNPR(r.total)])}
              footer={['TOTAL', '', fmtNPR(rows.reduce((s, r) => s + (r.total || 0), 0))]}
              onExport={() => downloadCSV('sales_by_customer_monthly.xlsx', ['Customer', 'Month', 'Revenue (NPR)'], rows.map(r => [r.customer, r.month, r.total || 0]), ['TOTAL', '', rows.reduce((s, r) => s + (r.total || 0), 0)])}
            />
          )} />;

      case 'sales_by_item_monthly':
        return <SimpleReport title="Sales By Item Monthly" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Sales By Item Monthly" fromDate={fd} toDate={td}
              headers={['Item', 'Month', 'Qty Sold', 'Revenue (NPR)']}
              rows={rows.map(r => [r.item_name, r.month, r.qty_sold, fmtNPR(r.revenue)])}
              footer={['TOTAL', '', rows.reduce((s, r) => s + (r.qty_sold || 0), 0), fmtNPR(rows.reduce((s, r) => s + (r.revenue || 0), 0))]}
              onExport={() => downloadCSV('sales_by_item_monthly.xlsx', ['Item', 'Month', 'Qty Sold', 'Revenue (NPR)'], rows.map(r => [r.item_name, r.month, r.qty_sold || 0, r.revenue || 0]), ['TOTAL', '', rows.reduce((s, r) => s + (r.qty_sold || 0), 0), rows.reduce((s, r) => s + (r.revenue || 0), 0)])}
            />
          )} />;


      case 'gl_summary':
        return <SimpleReport title="General Ledger Summary" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="General Ledger Summary" fromDate={fd} toDate={td}
              headers={['Account Code', 'Account Name', 'Debit (NPR)', 'Credit (NPR)']}
              rows={rows.map(r => [r.account_code, r.account_name, fmtNPR(r.debit), fmtNPR(r.credit)])}
              footer={['', 'TOTAL', fmtNPR(rows.reduce((s,r)=>s+r.debit,0)), fmtNPR(rows.reduce((s,r)=>s+r.credit,0))]}
              onExport={() => downloadCSV('gl_summary.csv', ['Code','Account Name','Debit','Credit'], rows.map(r=>[r.account_code, r.account_name, r.debit?.toFixed(2), r.credit?.toFixed(2)]))}
            />
          )} />;

      case 'journal_report':
        return <SimpleReport title="Journal Report" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td, showBs) => (
            <ReportTable title="Journal Report" fromDate={fd} toDate={td}
              headers={['Date', ...(showBs ? ['Date (BS)'] : []), 'Voucher #', 'Memo', 'Lines', 'Total Amount (NPR)']}
              rows={rows.map(r => {
                const dateAd = (r.entry_date || '').substring(0, 10);
                const dateBs = adToBS(dateAd) ? formatBS(adToBS(dateAd)) : '';
                return [
                  dateAd,
                  ...(showBs ? [dateBs] : []),
                  <VoucherLink voucherNumber={r.voucher_no}><span className="cursor-pointer text-primary">{r.voucher_no}</span></VoucherLink>,
                  r.memo,
                  r.lines?.length || 0,
                  fmtNPR(r.total_amount || (r.lines || []).reduce((s, l) => s + (l.debit_amount || 0), 0))
                ];
              })}
              footer={['', ...(showBs ? [''] : []), '', '', 'TOTAL', fmtNPR(rows.reduce((s, r) => s + (r.total_amount || (r.lines || []).reduce((ls, l) => ls + (l.debit_amount || 0), 0)), 0))]}
              onExport={() => downloadCSV('journal_report.csv', ['Date', ...(showBs ? ['Date (BS)'] : []), 'Voucher #','Memo','Lines','Total Amount'], rows.map(r => {
                const dateAd = (r.entry_date || '').substring(0, 10);
                const dateBs = adToBS(dateAd) ? formatBS(adToBS(dateAd)) : '';
                return [dateAd, ...(showBs ? [dateBs] : []), r.voucher_no, r.memo, r.lines?.length || 0, (r.total_amount || 0)?.toFixed(2)];
              }))}
            />
          )} />;

      case 'txn_list':
        return <SimpleReport title="Transaction List" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td, showBs) => (
            <ReportTable title="Transaction List" fromDate={fd} toDate={td}
              headers={['Date', ...(showBs ? ['Date (BS)'] : []), 'Voucher #', 'Account', 'Description', 'Debit (NPR)', 'Credit (NPR)']}
              rows={rows.map(r => {
                const dateBs = adToBS(r.entry_date) ? formatBS(adToBS(r.entry_date)) : '';
                return [
                  r.entry_date, 
                  ...(showBs ? [dateBs] : []),
                  <VoucherLink voucherNumber={r.voucher_no}><span className="cursor-pointer text-primary">{r.voucher_no}</span></VoucherLink>, 
                  r.account_name, 
                  r.description || r.journal_memo, 
                  fmtNPR(r.debit_amount), 
                  fmtNPR(r.credit_amount)
                ];
              })}
              footer={['', ...(showBs ? [''] : []), '', '', 'TOTAL', fmtNPR(rows.reduce((s,r)=>s+(r.debit_amount||0),0)), fmtNPR(rows.reduce((s,r)=>s+(r.credit_amount||0),0))]}
              onExport={() => downloadCSV('txn_list.csv', ['Date', ...(showBs ? ['Date (BS)'] : []), 'Voucher','Account','Description','Debit','Credit'], rows.map(r => {
                const dateBs = adToBS(r.entry_date) ? formatBS(adToBS(r.entry_date)) : '';
                return [r.entry_date, ...(showBs ? [dateBs] : []), r.voucher_no, r.account_name, r.description || r.journal_memo, r.debit_amount?.toFixed(2), r.credit_amount?.toFixed(2)];
              }))}
            />
          )} />;

      case 'purchase_summary':
        return <SimpleReport title="Purchase Summary" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td, showBs) => (
            <ReportTable title="Purchase Summary" fromDate={fd} toDate={td}
              headers={['Bill #','Date', ...(showBs ? ['Date (BS)'] : []), 'Supplier','Status','Subtotal (NPR)','VAT (NPR)','Grand Total (NPR)']}
              rows={rows.map(r => {
                const dateBs = adToBS(r.invoice_date || r.bill_date) ? formatBS(adToBS(r.invoice_date || r.bill_date)) : '';
                const dateAd = (r.invoice_date || r.bill_date || '').split('T')[0].split('-').reverse().join('-');
                return [
                  <VoucherLink voucherNumber={r.invoice_number || r.bill_number}><span className="cursor-pointer text-primary">{r.invoice_number || r.bill_number}</span></VoucherLink>, 
                  dateAd, ...(showBs ? [dateBs] : []), r.customer_name || r.vendor_name, r.status, fmtNPR(r.goods_subtotal || r.subtotal), fmtNPR(r.total_tax_amount || r.vat_amount), fmtNPR(r.grand_total)
                ];
              })}
              footer={['','', ...(showBs ? [''] : []), '','TOTAL','', fmtNPR(rows.reduce((s,r)=>s+((r.total_tax_amount || r.vat_amount)||0),0)), fmtNPR(rows.reduce((s,r)=>s+(r.grand_total||0),0))]}
              onExport={() => downloadCSV('purchase_summary.csv',['Bill #','Date', ...(showBs ? ['Date (BS)'] : []), 'Supplier','Status','Subtotal','VAT','Grand Total'],rows.map(r => {
                const dateBs = adToBS(r.invoice_date || r.bill_date) ? formatBS(adToBS(r.invoice_date || r.bill_date)) : '';
                const dateAd = (r.invoice_date || r.bill_date || '').split('T')[0].split('-').reverse().join('-');
                return [r.invoice_number || r.bill_number, dateAd, ...(showBs ? [dateBs] : []), r.customer_name || r.vendor_name, r.status, (r.goods_subtotal || r.subtotal)?.toFixed(2), (r.total_tax_amount || r.vat_amount)?.toFixed(2), r.grand_total?.toFixed(2)];
              }))}
            />
          )} />;

      case 'purchase_by_vendor':
        return <SimpleReport title="Purchase by Supplier" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Purchase by Supplier" fromDate={fd} toDate={td}
              headers={['Supplier','Bill Count','Total Purchased (NPR)']}
              rows={rows.map(r => [r.vendor, r.count, fmtNPR(r.total)])}
              footer={['TOTAL','', fmtNPR(rows.reduce((s,r)=>s+(r.total||0),0))]}
              onExport={() => downloadCSV('purchase_by_vendor.csv',['Supplier','Bill Count','Total Purchased'],rows.map(r=>[r.vendor,r.count,r.total?.toFixed(2)]))}
            />
          )} />;

      case 'purchase_by_item':
        return <SimpleReport title="Purchase by Item" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Purchase by Item" fromDate={fd} toDate={td}
              headers={['Item Code','Item Name','Qty Bought','Cost (NPR)']}
              rows={rows.map(r => [r.item_code||'—', r.item_name, r.qty_bought, fmtNPR(r.cost)])}
              onExport={() => downloadCSV('purchase_by_item.csv',['Code','Item','Qty','Cost'],rows.map(r=>[r.item_code,r.item_name,r.qty_bought,r.cost?.toFixed(2)]))}
            />
          )} />;



      // Simple table reports — each gets its own filter bar via SimpleReport
      case 'sales_summary':
        return <SimpleReport title="Sales Summary" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td, showBs) => (
            <ReportTable title="Sales Summary" fromDate={fd} toDate={td}
              headers={['Invoice #','Date', ...(showBs ? ['Date (BS)'] : []), 'Customer','Status','Subtotal (NPR)','VAT (NPR)','Grand Total (NPR)']}
              rows={rows.map(r => {
                const dateBs = adToBS(r.invoice_date) ? formatBS(adToBS(r.invoice_date)) : '';
                const dateAd = (r.invoice_date || '').split('T')[0].split('-').reverse().join('-');
                return [
                  <VoucherLink voucherNumber={r.invoice_number}><span className="cursor-pointer text-primary">{r.invoice_number}</span></VoucherLink>,
                  dateAd, ...(showBs ? [dateBs] : []), r.customer_name, r.status, fmtNPR(r.goods_subtotal), fmtNPR(r.total_tax_amount), fmtNPR(r.grand_total)
                ];
              })}
              footer={['','', ...(showBs ? [''] : []), '','TOTAL','', fmtNPR(rows.reduce((s,r)=>s+(r.total_tax_amount||0),0)), fmtNPR(rows.reduce((s,r)=>s+(r.grand_total||0),0))]}
              onExport={() => downloadCSV('sales_summary.csv',['Invoice #','Date', ...(showBs ? ['Date (BS)'] : []), 'Customer','Status','Subtotal','VAT','Grand Total'],rows.map(r => {
                const dateBs = adToBS(r.invoice_date) ? formatBS(adToBS(r.invoice_date)) : '';
                const dateAd = (r.invoice_date || '').split('T')[0].split('-').reverse().join('-');
                return [r.invoice_number, dateAd, ...(showBs ? [dateBs] : []), r.customer_name, r.status, r.goods_subtotal?.toFixed(2), r.total_tax_amount?.toFixed(2), r.grand_total?.toFixed(2)];
              }))}
            />
          )} />;

      case 'sales_by_customer':
        return <SimpleReport title="Sales by Customer" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Sales by Customer" fromDate={fd} toDate={td}
              headers={['Customer','Invoice Count','Total Revenue (NPR)']}
              rows={rows.map(r => [r.customer, r.count, fmtNPR(r.total)])}
              footer={['TOTAL','', fmtNPR(rows.reduce((s,r)=>s+(r.total||0),0))]}
              onExport={() => downloadCSV('sales_by_customer.csv',['Customer','Invoice Count','Total Revenue'],rows.map(r=>[r.customer,r.count,r.total?.toFixed(2)]))}
            />
          )} />;

      case 'sales_by_item':
        return <SimpleReport title="Sales by Item" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Sales by Item" fromDate={fd} toDate={td}
              headers={['Item Code','Item Name','Qty Sold','Revenue (NPR)']}
              rows={rows.map(r => [r.item_code||'—', r.item_name, r.qty_sold, fmtNPR(r.revenue)])}
              onExport={() => downloadCSV('sales_by_item.csv',['Code','Item','Qty','Revenue'],rows.map(r=>[r.item_code,r.item_name,r.qty_sold,r.revenue?.toFixed(2)]))}
            />
          )} />;

      case 'pos_daily':
        return <SimpleReport title="POS Daily Report" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="POS Daily Report" fromDate={fd} toDate={td}
              headers={['Date','Sales Count','Total (NPR)']}
              rows={rows.map(r => [r.date, r.count, fmtNPR(r.total)])}
              footer={['TOTAL', rows.reduce((s,r)=>s+r.count,0), fmtNPR(rows.reduce((s,r)=>s+(r.total||0),0))]}
              onExport={() => downloadCSV('pos_daily.csv',['Date','Count','Total'],rows.map(r=>[r.date,r.count,r.total?.toFixed(2)]))}
            />
          )} />;

      case 'stock_by_location':
        return <SimpleReport title="Stock by Location" reportId="stock_by_location" initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, exp) => (
            <ReportTable title="Stock by Location" fromDate={fromDate} toDate={toDate}
              headers={['Item Code', 'Item Name', 'Category', 'UOM', 'Godown / Location', 'Qty', 'WAC (NPR)', 'Value (NPR)']}
              rows={rows.map(r => [r.item_code, r.item_name, r.category_name, r.unit_of_measure, r.godown_name, r.quantity_on_hand, fmtNPR(r.wac), fmtNPR(r.value)])}
              footer={['', '', '', '', 'Total', rows.reduce((s,r)=>s+Number(r.quantity_on_hand||0),0), '', fmtNPR(rows.reduce((s,r)=>s+Number(r.value||0),0))]}
              onExport={() => downloadCSV('stock_by_location.csv',['Code','Item','Category','UOM','Godown','Qty','WAC','Value'],rows.map(r=>[r.item_code,r.item_name,r.category_name,r.unit_of_measure,r.godown_name,r.quantity_on_hand,r.wac?.toFixed(2),r.value?.toFixed(2)]))}
            />
          )}
        />;

      case 'stock_summary':
      case 'item_valuation':
        return <SimpleReport title="Stock Summary" reportId="stock_summary" initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows) => (
            <ReportTable title="Stock Summary Report"
              headers={['Item Code','Item Name','Category','UOM','Qty on Hand','WAC (NPR)','Total Value (NPR)']}
              rows={rows.map(r => [r.item_code||'—', r.item_name, r.category_name||'—', r.unit_of_measure, r.quantity_on_hand, fmtNPR(r.wac), fmtNPR(r.value)])}
              footer={['','','','','','Total Inventory Value', fmtNPR(rows.reduce((s,r)=>s+(r.value||0),0))]}
              onExport={() => downloadCSV('stock_summary.csv',['Code','Item','Category','UOM','Qty','WAC','Value'],rows.map(r=>[r.item_code,r.item_name,r.category_name,r.unit_of_measure,r.quantity_on_hand,r.wac?.toFixed(2),r.value?.toFixed(2)]))}
            />
          )} />;

      case 'low_stock':
        return <SimpleReport title="Low Stock Report" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows) => (
            <ReportTable title="Low Stock / Reorder Report"
              headers={['Item Code','Item Name','Category','UOM','On Hand','Reorder Level','Shortage']}
              rows={rows.map(r => [r.item_code||'—', r.item_name, r.category_name||'—', r.unit_of_measure, r.quantity_on_hand, r.reorder_level, r.shortage])}
              onExport={() => downloadCSV('low_stock.csv',['Code','Item','Category','UOM','On Hand','Reorder','Shortage'],rows.map(r=>[r.item_code,r.item_name,r.category_name,r.unit_of_measure,r.quantity_on_hand,r.reorder_level,r.shortage]))}
            />
          )} />;

      case 'unpaid_invoices':
        return <SimpleReport title="Unpaid Sales Invoices" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows) => (
            <ReportTable title="Unpaid Sales Invoices"
              headers={['Invoice #','Date','Customer','Grand Total (NPR)','Payment Status']}
              rows={rows.map(r => [
                <VoucherLink voucherNumber={r.invoice_number}><span className="cursor-pointer text-primary">{r.invoice_number}</span></VoucherLink>, 
                (r.invoice_date || '').split('T')[0].split('-').reverse().join('-'), 
                r.customer_name, fmtNPR(r.grand_total), r.payment_status
              ])}
              footer={['','','TOTAL', fmtNPR(rows.reduce((s,r)=>s+(r.grand_total||0),0)), '']}
              onExport={() => downloadCSV('unpaid_invoices.csv',['Invoice','Date','Customer','Total','Status'],rows.map(r=>[r.invoice_number,(r.invoice_date || '').split('T')[0].split('-').reverse().join('-'),r.customer_name,r.grand_total?.toFixed(2),r.payment_status]))}
            />
          )} />;

      case 'unpaid_bills':
        return <SimpleReport title="Unpaid Purchase Invoices" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows) => (
            <ReportTable title="Unpaid Purchase Invoices"
              headers={['Invoice #','Date','Supplier','Grand Total (NPR)','Payment Status']}
              rows={rows.map(r => [
                <VoucherLink voucherNumber={r.invoice_number}><span className="cursor-pointer text-primary">{r.invoice_number}</span></VoucherLink>, 
                (r.invoice_date || '').split('T')[0].split('-').reverse().join('-'), 
                r.customer_name||r.vendor_name, fmtNPR(r.grand_total), r.payment_status
              ])}
              footer={['','','TOTAL', fmtNPR(rows.reduce((s,r)=>s+(r.grand_total||0),0)), '']}
              onExport={() => downloadCSV('unpaid_bills.csv',['Invoice','Date','Supplier','Total','Status'],rows.map(r=>[r.invoice_number,(r.invoice_date || '').split('T')[0].split('-').reverse().join('-'),r.customer_name||r.vendor_name,r.grand_total?.toFixed(2),r.payment_status]))}
            />
          )} />;

      case 'vat_sales':
      case 'vat_summary':
        return <SimpleReport title="Sales VAT Register" reportId="vat_sales" initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Sales VAT Register" fromDate={fd} toDate={td}
              headers={['Invoice #','Date','Customer','Subtotal (NPR)','VAT (NPR)','Grand Total (NPR)']}
              rows={rows.map(r => [
                <VoucherLink voucherNumber={r.invoice_number}><span className="cursor-pointer text-primary">{r.invoice_number}</span></VoucherLink>, 
                (r.invoice_date || '').split('T')[0].split('-').reverse().join('-'), 
                r.customer_name, fmtNPR(r.goods_subtotal), fmtNPR(r.total_tax_amount||r.vat_amount), fmtNPR(r.grand_total)
              ])}
              footer={['','','Total VAT','', fmtNPR(rows.reduce((s,r)=>s+(r.total_tax_amount||r.vat_amount||0),0)),'']}
              onExport={() => downloadCSV('sales_vat.csv',['Invoice','Date','Customer','Subtotal','VAT','Total'],rows.map(r=>[r.invoice_number,(r.invoice_date || '').split('T')[0].split('-').reverse().join('-'),r.customer_name,r.goods_subtotal?.toFixed(2),(r.total_tax_amount||r.vat_amount)?.toFixed(2),r.grand_total?.toFixed(2)]))}
            />
          )} />;

      case 'vat_purchases':
        return <SimpleReport title="Purchase VAT Register" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Purchase VAT Register" fromDate={fd} toDate={td}
              headers={['Invoice #','Date','Supplier','Subtotal (NPR)','VAT (NPR)','Grand Total (NPR)']}
              rows={rows.map(r => [
                <VoucherLink voucherNumber={r.invoice_number||r.bill_number}><span className="cursor-pointer text-primary">{r.invoice_number||r.bill_number}</span></VoucherLink>, 
                (r.invoice_date||r.bill_date || '').split('T')[0].split('-').reverse().join('-'), 
                r.customer_name||r.vendor_name, fmtNPR(r.goods_subtotal||r.subtotal), fmtNPR(r.vat_amount||r.total_tax_amount), fmtNPR(r.grand_total)
              ])}
              footer={['','','Total VAT','', fmtNPR(rows.reduce((s,r)=>s+(r.vat_amount||r.total_tax_amount||0),0)),'']}
              onExport={() => downloadCSV('purchase_vat.csv',['Invoice','Date','Supplier','Subtotal','VAT','Total'],rows.map(r=>[r.invoice_number||r.bill_number,(r.invoice_date||r.bill_date || '').split('T')[0].split('-').reverse().join('-'),r.customer_name||r.vendor_name,(r.goods_subtotal||r.subtotal)?.toFixed(2),(r.vat_amount||r.total_tax_amount)?.toFixed(2),r.grand_total?.toFixed(2)]))}
            />
          )} />;

      case 'sales_return_report':
        return <SimpleReport title="Sales Master Report" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Sales Master Report (All Invoices)" fromDate={fd} toDate={td}
              headers={['Invoice #','Date','Customer','Status','Subtotal (NPR)','VAT (NPR)','Grand Total (NPR)']}
              rows={rows.map(r => [
                <VoucherLink voucherNumber={r.invoice_number}><span className="cursor-pointer text-primary">{r.invoice_number}</span></VoucherLink>, 
                (r.invoice_date || '').split('T')[0].split('-').reverse().join('-'), 
                r.customer_name, r.status, fmtNPR(r.goods_subtotal || r.subtotal), fmtNPR(r.total_tax_amount || r.vat_amount), fmtNPR(r.grand_total)
              ])}
              footer={['','','','TOTAL','', fmtNPR(rows.reduce((s,r)=>s+(r.total_tax_amount||r.vat_amount||0),0)), fmtNPR(rows.reduce((s,r)=>s+(r.grand_total||0),0))]}
              onExport={() => downloadCSV('sales_master_report.csv',['Invoice #','Date','Customer','Status','Subtotal','VAT','Grand Total'],rows.map(r=>[r.invoice_number,(r.invoice_date || '').split('T')[0].split('-').reverse().join('-'),r.customer_name,r.status,(r.goods_subtotal||r.subtotal)?.toFixed(2),(r.total_tax_amount||r.vat_amount)?.toFixed(2),r.grand_total?.toFixed(2)]))}
            />
          )} />;

      case 'stock_movement':
        return <SimpleReport title="Stock Movement" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Stock Movement Report" fromDate={fd} toDate={td}
              headers={['Date','Ref #','Type','Item Code','Item Name','Qty In','Qty Out','Unit Cost (NPR)']}
              rows={rows.map(r => [
                (r.date || '').split('T')[0].split('-').reverse().join('-'), 
                <VoucherLink voucherNumber={r.ref}><span className="cursor-pointer text-primary">{r.ref}</span></VoucherLink>, 
                r.type, r.item_code, r.item_name, r.qty_in || '—', r.qty_out || '—', fmtNPR(r.unit_cost)
              ])}
              footer={['','','','','TOTAL', rows.reduce((s,r)=>s+(r.qty_in||0),0), rows.reduce((s,r)=>s+(r.qty_out||0),0), '']}
              onExport={() => downloadCSV('stock_movement.csv',['Date','Ref','Type','Code','Item','Qty In','Qty Out','Unit Cost'],rows.map(r=>[(r.date || '').split('T')[0].split('-').reverse().join('-'),r.ref,r.type,r.item_code,r.item_name,r.qty_in,r.qty_out,r.unit_cost?.toFixed(2)]))}
            />
          )} />;

      case 'tds_report':
        return <SimpleReport title="TDS Deduction Report" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="TDS Deduction Report" fromDate={fd} toDate={td}
              headers={['Employee','Pay Period','Gross Pay (NPR)','TDS Deducted (NPR)','Net Pay (NPR)']}
              rows={rows.map(r => [r.employee_name, r.pay_period, fmtNPR(r.gross_pay), fmtNPR(r.tds_amount), fmtNPR(r.net_pay)])}
              footer={['TOTAL','', fmtNPR(rows.reduce((s,r)=>s+(r.gross_pay||0),0)), fmtNPR(rows.reduce((s,r)=>s+(r.tds_amount||0),0)), fmtNPR(rows.reduce((s,r)=>s+(r.net_pay||0),0))]}
              onExport={() => downloadCSV('tds_report.csv',['Employee','Pay Period','Gross Pay','TDS','Net Pay'],rows.map(r=>[r.employee_name,r.pay_period,r.gross_pay?.toFixed(2),r.tds_amount?.toFixed(2),r.net_pay?.toFixed(2)]))}
            />
          )} />;

      case 'category_summary':
        return <SimpleReport title="Category-wise Summary" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows) => (
            <ReportTable title="Category-wise Summary"
              headers={['Category','Items','Total Qty','Total Value (NPR)']}
              rows={rows.map(r => [r.category, r.item_count, r.total_qty, fmtNPR(r.total_value)])}
              footer={['TOTAL', rows.reduce((s,r)=>s+(r.item_count||0),0), rows.reduce((s,r)=>s+(r.total_qty||0),0), fmtNPR(rows.reduce((s,r)=>s+(r.total_value||0),0))]}
              onExport={() => downloadCSV('category_summary.csv',['Category','Items','Qty','Value'],rows.map(r=>[r.category,r.item_count,r.total_qty,(r.total_value||0).toFixed(2)]))}
            />
          )} />;

      default:
        return <p className="text-muted-foreground text-sm py-8 text-center">Report viewer not yet available for this report type.</p>;
    }
  };

  return (
    <>
      {/* Export Progress Overlay */}
      {exportProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm print:hidden">
          <div className="bg-card p-6 rounded-xl shadow-2xl max-w-sm w-full text-center space-y-4">
            <h3 className="font-semibold text-lg">Exporting Spreadsheet...</h3>
            <p className="text-sm text-muted-foreground">
              Processing row {exportProgress.current.toLocaleString()} of {exportProgress.total.toLocaleString()}
            </p>
            <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-primary h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(100, Math.round((exportProgress.current / exportProgress.total) * 100))}%` }}
              ></div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-0 z-40 flex flex-col sm:items-center sm:justify-center bg-background sm:bg-black/40 sm:backdrop-blur-sm sm:p-4 report-modal-container">
        <div className="bg-card w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <p className="text-xs text-muted-foreground font-medium">
              Report Viewer — use filters inside each report to adjust the period
            </p>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          {/* Report Body */}
          <div className="flex-1 overflow-y-auto p-0 sm:p-5">
            {renderContent()}
          </div>
        </div>
      </div>
    </>
  );
}
