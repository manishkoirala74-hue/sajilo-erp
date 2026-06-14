/**
 * ReportViewer — Modal shell.
 * Each report renderer manages its own isolated filter state.
 * Print layout is governed by the global @media print stylesheet injected here.
 */
import { X, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import BusinessHeader from '@/components/reports/BusinessHeader';
import PartnerStatement from '@/components/reports/PartnerStatement';
import FinancialReportTable from '@/components/reports/FinancialReportTable';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { exportFlatXLSX } from '@/lib/reports/reportExcelExport';
import { sajilo } from '@/api/sajiloClient';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import SearchableSelect from '@/components/shared/SearchableSelect';
import VoucherLink from '@/components/shared/VoucherLink';
import CommunicationModal from '@/components/shared/CommunicationModal';
import { Mail } from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtNPR(n) {
  const num = Number(n || 0);
  if (num === 0) return '—';
  const absNum = Math.abs(num);
  const formatted = `NPR ${absNum.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return num < 0 ? `(${formatted})` : formatted;
}

// downloadCSV replaced by exportFlatXLSX — kept as no-op shim to avoid refactor of every call site
function downloadCSV(filename, headers, rows, footer) {
  try {
    exportFlatXLSX({ headers, rows, footer, reportTitle: filename.replace(/\.xlsx$/,'').replace(/_/g,' '), filename: filename.replace(/\.csv$/,'.xlsx') });
  } catch (err) {
    console.error('[XLSX export error]', err);
  }
}

function inRange(dateStr, from, to) {
  if (!dateStr) return false;
  return dateStr >= from && dateStr <= to;
}

const DEFAULT_FILTERS = {
  fromDate: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
  toDate:   format(new Date(), 'yyyy-MM-dd'),
  showZeroBalance:    false,
  expandAll:          false,
  showOpeningBalance: true,
  showClosingBalance: true,
  showTransactions:   true,
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
  /* Hide everything except the print portal */
  body * { visibility: hidden !important; }
  #sajilo-print-portal,
  #sajilo-print-portal * { visibility: visible !important; }

  @page { margin: 12mm 10mm; size: A4 landscape; }

  #sajilo-print-portal {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    background: white;
    font-family: 'Calibri', Arial, sans-serif;
    font-size: 9pt;
    color: #0f172a;
  }

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
  .report-no-print { display: none !important; }
}
`;

// ── Shared: Simple flat ReportTable ──────────────────────────────────────────
function ReportTable({ title, subtitle, headers, rows, footer, onExport, onEmail, fromDate, toDate }) {
  const rightCols = new Set([headers.length - 1, headers.length - 2]); // last 2 cols = numeric

  return (
    <div className="space-y-3">
      <BusinessHeader reportTitle={title} fromDate={fromDate} toDate={toDate} subtitle={subtitle} />
      <div className="report-no-print flex justify-end gap-2">
        {onEmail && (
          <button onClick={onEmail}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-blue-300 dark:border-blue-500/30 rounded-lg bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 transition-colors">
            <Mail className="w-3.5 h-3.5" /> Email Report
          </button>
        )}
        {onExport && (
          <button onClick={onExport}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-emerald-300 dark:border-emerald-500/30 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 transition-colors">
            ↓ Export Excel (.xlsx)
          </button>
        )}
      </div>
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="table-scroll-container">
          <table className="table-fluid-grid text-sm print:text-[10pt]">
            <thead className="cell-density bg-slate-100 dark:bg-slate-500/20 border-b-2 border-border">
              <tr>
                {headers.map((h, i) => {
                  const isNum = rightCols.has(i);
                  return (
                    <th key={i} className={`cell-density font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider ${isNum ? 'amount-cell' : 'text-align-left'}`}>
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
                  <tr key={i} className="hover:bg-muted/20 print:hover:bg-transparent">
                    {row.map((cell, j) => {
                      const isNum = rightCols.has(j);
                      return (
                        <td key={j} className={`cell-density print:text-[10pt] ${isNum ? 'amount-cell' : 'text-align-left'}`}>
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
                    return (
                      <td key={j} className={`cell-density print:text-[10pt] font-bold ${isNum ? 'amount-cell' : 'text-align-left'}`}>
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
      const [all, settings, journals, lines] = await Promise.all([
        sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 2000),
        sajilo.entities.CompanySettings.list(),
        sajilo.entities.GeneralLedgerJournal.filter({ status: 'Posted' }, 'entry_date', 10000),
        sajilo.entities.GeneralLedgerLine.list('', 50000)
      ]);
      allAccountsRef.current = all;
      if (settings.length > 0) setCompany(settings[0]);

      const journalMap = {};
      journals.forEach(j => { 
        journalMap[j.id] = j.entry_date ? j.entry_date.split('T')[0] : ''; 
      });
      
      const accountTotals = {};
      lines.forEach(l => {
        const date = journalMap[l.journal_id];
        if (!date) return;
        
        if (!accountTotals[l.account_id]) {
          accountTotals[l.account_id] = { cur_dr: 0, cur_cr: 0, ob_dr: 0, ob_cr: 0 };
        }
        
        if (date < filters.fromDate) {
          accountTotals[l.account_id].ob_dr += (l.debit_amount || 0);
          accountTotals[l.account_id].ob_cr += (l.credit_amount || 0);
        } else if (date >= filters.fromDate && date <= filters.toDate) {
          accountTotals[l.account_id].cur_dr += (l.debit_amount || 0);
          accountTotals[l.account_id].cur_cr += (l.credit_amount || 0);
        }
      });

      setAccounts(all.map(a => {
        const t = accountTotals[a.id] || { cur_dr: 0, cur_cr: 0, ob_dr: 0, ob_cr: 0 };
        const isDebitNormal = ['Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense'].includes(a.account_type);
        
        // Start from opening_balance
        const base_ob = Number(a.opening_balance || 0);
        const isBaseObDr = (a.opening_balance_type || (isDebitNormal ? 'Dr' : 'Cr')) === 'Dr';
        
        let base_ob_dr = 0, base_ob_cr = 0;
        if (isBaseObDr) base_ob_dr = base_ob; else base_ob_cr = base_ob;

        let total_ob_dr = base_ob_dr + (t.ob_dr || 0);
        let total_ob_cr = base_ob_cr + (t.ob_cr || 0);
        
        let ob_net_dr = total_ob_dr - total_ob_cr;
        let net_ob_dr = 0, net_ob_cr = 0;
        if (ob_net_dr >= 0) {
          net_ob_dr = ob_net_dr;
        } else {
          net_ob_cr = -ob_net_dr;
        }
        
        const cur_dr = t.cur_dr || 0;
        const cur_cr = t.cur_cr || 0;
        
        let cb_net_dr = ob_net_dr + cur_dr - cur_cr;
        let net_cb_dr = 0, net_cb_cr = 0;
        if (cb_net_dr >= 0) {
          net_cb_dr = cb_net_dr;
        } else {
          net_cb_cr = -cb_net_dr;
        }

        return {
          ...a,
          _isControlAccount:  false, // Disable partner drill-down since partners have native sub-ledgers
          opening_debit:  net_ob_dr,
          opening_credit: net_ob_cr,
          current_debit:  cur_dr,
          current_credit: cur_cr,
          closing_debit:  net_cb_dr,
          closing_credit: net_cb_cr,
        };
      }));
    } catch (err) {
      console.error('[TrialBalance load error]', err);
    }
    setLoading(false);
  }, []);

  // Partner drill-down disabled: partners are natively in the GL as Sub Ledgers.

  // Do NOT auto-load — wait for user to click Apply
  // useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="report-no-print">
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
  const [filters, setFilters] = useCachedFilters('cash_flow', { ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Direct Method Cashflow: Analyze Journals hitting Cash/Bank accounts
      const journals = await sajilo.entities.GeneralLedgerJournal.list('-entry_date', 5000);
      const lines = await sajilo.entities.GeneralLedgerLine.list('', 10000); // Need scalable way in future
      const accounts = await sajilo.entities.ChartOfAccount.list('', 1000);

      const cashAccounts = accounts.filter(a => a.account_type === 'Cash' || a.account_type === 'Bank');
      const cashAccIds = new Set(cashAccounts.map(a => a.id));

      let inflows = 0;
      let outflows = 0;
      const details = [];

      journals.filter(j => j.status === 'Posted' && j.entry_date >= filters.fromDate && j.entry_date <= filters.toDate).forEach(j => {
        const jLines = lines.filter(l => l.journal_id === j.id);
        const cashLines = jLines.filter(l => cashAccIds.has(l.account_id));
        if (cashLines.length === 0) return;

        // In Direct method, we look at the net change in cash for this journal
        const netCash = cashLines.reduce((s, l) => s + (l.debit_amount || 0) - (l.credit_amount || 0), 0);
        
        if (netCash > 0) {
          inflows += netCash;
          details.push({ date: j.entry_date, type: 'Inflow', ref: j.voucher_no, desc: j.description, amount: netCash });
        } else if (netCash < 0) {
          outflows += Math.abs(netCash);
          details.push({ date: j.entry_date, type: 'Outflow', ref: j.voucher_no, desc: j.description, amount: Math.abs(netCash) });
        }
      });

      setData({ inflows, outflows, netCashFlow: inflows - outflows, details });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [filters.fromDate, filters.toDate]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <div className="p-8 text-center">Loading Cashflow...</div>;

  return (
    <div className="space-y-4">
      <div className="report-no-print">
        <ReportFilterBar filters={filters} onChange={setFilters} onApply={load} showApplyButton />
      </div>
      <ReportTable
        title="Cash Flow Summary (Direct Method)"
        fromDate={filters.fromDate}
        toDate={filters.toDate}
        headers={['Date', 'Type', 'Voucher #', 'Description', 'Amount (NPR)']}
        rows={data.details.map(d => [
          d.date, 
          d.type, 
          <VoucherLink voucherNumber={d.ref}><span className="cursor-pointer text-primary">{d.ref}</span></VoucherLink>, 
          d.desc, 
          fmtNPR(d.amount)
        ])}
        footer={['', '', '', 'NET CASH FLOW', fmtNPR(data.netCashFlow)]}
        onExport={() => {}}
      />
    </div>
  );
}


function PartnerSummaryReport({ title, mode, reportId, initialFromDate, initialToDate }) {
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
  
  if (reportId.includes('aging_summary')) {
    baseHeaders = [isAR ? 'Customer' : 'Supplier', 'Bucket', 'Balance (NPR)'];
    rowMapper = (r, meta) => [r.customer_name || r.vendor_name || 'Unknown', r.bucket, fmtNPR(r.grand_total || r.balance), ...meta];
  } else if (reportId === 'customer_balance') {
    baseHeaders = ['Customer', 'Total Invoiced', 'Total Paid', 'Balance (NPR)'];
    rowMapper = (r, meta) => [r.customer, r.total_invoiced, r.total_paid, r.balance, ...meta];
  } else if (reportId === 'vendor_balance') {
    baseHeaders = ['Supplier', 'Total Billed', 'Total Paid', 'Balance (NPR)'];
    rowMapper = (r, meta) => [r.vendor, r.total_billed, r.total_paid, r.balance, ...meta];
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
      <div className="report-no-print">
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
            headers={headers}
            rows={tableRows}
            onExport={() => {}}
        />
      )}
    </div>
  );
}

function PartnerReport({ title, mode, initialFromDate, initialToDate }) {
  const [filters,   setFilters]   = useCachedFilters(`partner_report_${mode}`, { ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate });
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
    setInvoices(invData);
    setLoading(false);
  }, [isAR]);

  // Do NOT auto-load on mount
  // useEffect(() => { load(); }, []);

  const partnerMap = {};
  partners.forEach(p => { partnerMap[p.name] = p; });

  const rows = invoices
    .filter(i => i.status === 'Posted' && i.payment_status !== 'Paid')
    .filter(i => inRange(isAR ? i.invoice_date : (i.invoice_date || i.bill_date), filters.fromDate, filters.toDate));

  const baseHeaders = [isAR ? 'Customer' : 'Supplier', 'Invoice #', 'Date', 'Due Date', 'Amount (NPR)', 'Days Overdue', 'Status'];
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
    const base = [
      partnerName,
      i.invoice_number || i.bill_number || '—',
      date,
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
      <div className="report-no-print">
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
          />
      )}
    </div>
  );
}

// ── Profit & Loss (Multi-Step Enterprise Format) ────────────────────────────────
function ProfitLossReport({ initialData, initialFromDate, initialToDate }) {
  const [filters,   setFilters]   = useCachedFilters('profit_loss', { ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate, expandAll: true });
  const [data,      setData]      = useCachedState('profit_loss_data', initialData);
  const [loading,   setLoading]   = useState(false);
  const [hasLoaded, setHasLoaded] = useCachedState('profit_loss_hasLoaded', !!initialData);
  const [expanded,  setExpanded]  = useState({});

  const load = useCallback(async () => {
    setHasLoaded(true);
    setLoading(true);
    try {
      const { fetchReportData } = await import('@/lib/reportDataFetcher');
      const result = await fetchReportData('profit_loss', filters.fromDate, filters.toDate);
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

  try {
    const accounts = data?.accounts || [];
    const childrenMap = {};
    accounts.forEach(a => {
      if (a.parent_account_id) {
        if (!childrenMap[a.parent_account_id]) childrenMap[a.parent_account_id] = [];
        childrenMap[a.parent_account_id].push(a);
      }
    });

    const rollup = (account) => {
      let cb = Number(account.current_balance !== undefined ? account.current_balance : (account.balance || 0));
      let cob = Number(account.comparative_balance || 0);
      (childrenMap[account.id] || []).forEach(c => {
        const [child_cb, child_cob] = rollup(c);
        cb += child_cb;
        cob += child_cob;
      });
      account.rollup_current = cb;
      account.rollup_comparative = cob;
      return [cb, cob];
    };

    const sections = {
      revenue: { accounts: [], cur: 0, comp: 0 },
      sales_returns: { accounts: [], cur: 0, comp: 0 },
      opening_stock: { accounts: [], cur: 0, comp: 0 },
      purchases: { accounts: [], cur: 0, comp: 0 },
      closing_stock: { accounts: [], cur: 0, comp: 0 },
      cogs_other: { accounts: [], cur: 0, comp: 0 },
      opex_admin: { accounts: [], cur: 0, comp: 0 },
      opex_selling: { accounts: [], cur: 0, comp: 0 },
      non_op_income: { accounts: [], cur: 0, comp: 0 },
      finance_cost: { accounts: [], cur: 0, comp: 0 },
      tax: { accounts: [], cur: 0, comp: 0 }
    };

    accounts.forEach(a => {
      if (!a.parent_account_id) {
        const name = (a.account_name || '').toLowerCase();
        
        if (a.account_type === 'Revenue' || a.account_type === 'Income') {
          if (name.includes('return') || name.includes('allowance') || name.includes('discount')) {
            sections.sales_returns.accounts.push(a);
          } else if (name.includes('interest') || name.includes('dividend') || name.includes('other') || a.account_subtype === 'Other Income') {
            sections.non_op_income.accounts.push(a);
          } else {
            sections.revenue.accounts.push(a);
          }
        } 
        else if (a.account_type === 'Expense' || a.account_type === 'Expenses' || a.account_type === 'Cost of Sales') {
          if (a.account_type === 'Cost of Sales' || name.includes('cogs') || name.includes('cost of goods') || name.includes('purchase') || name.includes('stock') || name.includes('inventory')) {
            if (name.includes('opening')) sections.opening_stock.accounts.push(a);
            else if (name.includes('purchase') && !name.includes('return')) sections.purchases.accounts.push(a);
            else if (name.includes('closing')) sections.closing_stock.accounts.push(a);
            else sections.cogs_other.accounts.push(a);
          } else if (name.includes('interest') || name.includes('bank charge') || name.includes('finance')) {
            sections.finance_cost.accounts.push(a);
          } else if (name.includes('tax') && !name.includes('property')) {
            sections.tax.accounts.push(a);
          } else if (name.includes('sell') || name.includes('market') || name.includes('advertis') || name.includes('commission') || name.includes('freight out')) {
            sections.opex_selling.accounts.push(a);
          } else {
            sections.opex_admin.accounts.push(a);
          }
        }
      }
    });

    Object.values(sections).forEach(s => {
      s.accounts.forEach(a => rollup(a));
      s.cur = s.accounts.reduce((sum, a) => sum + a.rollup_current, 0);
      s.comp = s.accounts.reduce((sum, a) => sum + a.rollup_comparative, 0);
    });

    const net_sales_cur = sections.revenue.cur - Math.abs(sections.sales_returns.cur);
    const net_sales_comp = sections.revenue.comp - Math.abs(sections.sales_returns.comp);
    
    const cogs_total_cur = Math.abs(sections.opening_stock.cur) + Math.abs(sections.purchases.cur) - Math.abs(sections.closing_stock.cur) + Math.abs(sections.cogs_other.cur);
    const cogs_total_comp = Math.abs(sections.opening_stock.comp) + Math.abs(sections.purchases.comp) - Math.abs(sections.closing_stock.comp) + Math.abs(sections.cogs_other.comp);

    const gross_profit_cur = net_sales_cur - cogs_total_cur;
    const gross_profit_comp = net_sales_comp - cogs_total_comp;

    const total_opex_cur = Math.abs(sections.opex_admin.cur) + Math.abs(sections.opex_selling.cur);
    const total_opex_comp = Math.abs(sections.opex_admin.comp) + Math.abs(sections.opex_selling.comp);
    const op_profit_cur = gross_profit_cur - total_opex_cur;
    const op_profit_comp = gross_profit_comp - total_opex_comp;

    const pbt_cur = op_profit_cur + sections.non_op_income.cur - Math.abs(sections.finance_cost.cur);
    const pbt_comp = op_profit_comp + sections.non_op_income.comp - Math.abs(sections.finance_cost.comp);

    const net_profit_cur = pbt_cur - Math.abs(sections.tax.cur);
    const net_profit_comp = pbt_comp - Math.abs(sections.tax.comp);

    const fmtAcct = (amount, isDeduction = false) => {
      if (!amount || Math.abs(amount) < 0.01) return '—';
      const val = Math.abs(amount).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return (amount < 0 || isDeduction) ? `(${val})` : val;
    };

    const renderTree = (account, level = 0, isDeduction = false) => {
      const children = childrenMap[account.id] || [];
      const isGroup = account.ledger_type === 'Group Ledger' || children.length > 0;
      const isExpanded = expanded[account.id] !== undefined ? expanded[account.id] : filters.expandAll;

      if (!filters.showZeroBalance && Math.abs(account.rollup_current) < 0.01 && Math.abs(account.rollup_comparative) < 0.01) return null;

      return (
        <React.Fragment key={account.id}>
          <tr className={`hover:bg-muted/20 print:hover:bg-transparent ${isGroup ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
            <td className='px-3 py-1.5 border-none' style={{ paddingLeft: `${16 + level * 20}px` }}>
              {isGroup ? (
                <button onClick={() => toggleExpand(account.id)} className='flex items-center gap-1.5 hover:text-primary transition-colors text-left w-full'>
                  <span className='w-3 inline-block text-center text-[10px] text-slate-400'>{isExpanded ? '▼' : '▶'}</span>
                  {account.account_name}
                </button>
              ) : (
                <span className='pl-4.5 block'>{account.account_name}</span>
              )}
            </td>
            <td className='px-3 py-1.5 text-center text-xs text-muted-foreground border-none'></td>
            <td className='px-3 py-1.5 text-right tabular-nums font-mono border-none'>
              {fmtAcct(account.rollup_current, isDeduction)}
            </td>
            <td className='px-3 py-1.5 text-right tabular-nums font-mono border-none text-slate-500'>
              {fmtAcct(account.rollup_comparative, isDeduction)}
            </td>
          </tr>
          {isGroup && isExpanded && children.map(c => renderTree(c, level + 1, isDeduction))}
        </React.Fragment>
      );
    };

    const PLSection = ({ title, sectionObj, isDeduction = false, note = '' }) => {
      const { accounts, cur, comp } = sectionObj;
      if (Math.abs(cur) < 0.01 && Math.abs(comp) < 0.01 && accounts.length === 0) return null;
      return (
        <React.Fragment>
          {title && (
            <tr>
              <td className='px-3 py-2 font-semibold text-foreground bg-muted/50' colSpan={4}>{title}</td>
            </tr>
          )}
          {accounts.map(a => renderTree(a, 0, isDeduction))}
        </React.Fragment>
      );
    };

    const KPICard = ({ title, amount, percentage }) => (
      <div className='bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between report-no-print'>
        <span className='text-xs font-semibold text-slate-500 uppercase tracking-wider'>{title}</span>
        <div className='mt-2 flex items-baseline gap-2'>
          <span className={`text-xl font-bold tabular-nums ${amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
            {fmtAcct(amount, amount < 0)}
          </span>
          {percentage !== undefined && (
            <span className='text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-500/20 px-1.5 py-0.5 rounded'>
              {percentage}%
            </span>
          )}
        </div>
      </div>
    );

    const handleExport = () => downloadCSV('income_statement.xlsx',
      ['Financial Particulars', 'Notes', 'Current Period (NPR)', 'Comparative Period (NPR)'],
      [['', 'Not yet supported in hierarchical mode', '', '']]
    );

    return (
      <div className='space-y-4'>
        <div className='report-no-print'>
          <ReportFilterBar filters={filters} onChange={setFilters} onApply={load} showApplyButton />
        </div>
        {!hasLoaded ? (
          <div className='py-16 text-center space-y-3'>
            <div className='text-4xl'>📊</div>
            <p className='text-sm font-semibold text-foreground'>Select your date range and click <span className='text-primary'>Apply</span> to generate the Income Statement.</p>
          </div>
        ) : loading ? (
          <div className='py-10 text-center text-muted-foreground text-sm'>Loading…</div>
        ) : (
        <>
        <div className='grid grid-cols-4 gap-4 report-no-print'>
          <KPICard title='Net Sales Revenue' amount={net_sales_cur} />
          <KPICard title='Gross Profit' amount={gross_profit_cur} percentage={net_sales_cur ? ((gross_profit_cur / net_sales_cur)*100).toFixed(1) : 0} />
          <KPICard title='Operating Profit' amount={op_profit_cur} percentage={net_sales_cur ? ((op_profit_cur / net_sales_cur)*100).toFixed(1) : 0} />
          <KPICard title='Net Profit' amount={net_profit_cur} percentage={net_sales_cur ? ((net_profit_cur / net_sales_cur)*100).toFixed(1) : 0} />
        </div>

        <div className='bg-card border border-border rounded-xl shadow-sm overflow-hidden p-6 print:p-0 print:border-none print:shadow-none'>
          <BusinessHeader reportTitle='INCOME STATEMENT' subtitle='(Profit & Loss Statement)' fromDate={filters.fromDate} toDate={filters.toDate} />
          
          <div className='report-no-print flex justify-end gap-2 mb-6'>
            <Button variant='outline' size='sm' onClick={() => setFilters(f => ({ ...f, expandAll: !f.expandAll }))}>
              {filters.expandAll ? 'Collapse All' : 'Expand All'}
            </Button>
            <Button variant='outline' size='sm' onClick={handleExport}>
              <Printer className='w-4 h-4 mr-2' /> Export
            </Button>
          </div>

          <table className="table-fluid-grid text-sm">
            <thead>
              <tr className='border-b border-border'>
                <th className='px-3 py-2 text-left font-semibold text-foreground w-[50%]'>Financial Particulars</th>
                <th className='px-3 py-2 text-center font-semibold text-foreground w-[10%]'>Notes</th>
                <th className='px-3 py-2 text-right font-semibold text-foreground w-[20%]'>Current Period<br/><span className='text-xs text-slate-500 font-normal'>NPR</span></th>
                <th className='px-3 py-2 text-right font-semibold text-foreground w-[20%]'>Comparative<br/><span className='text-xs text-slate-500 font-normal'>NPR</span></th>
              </tr>
            </thead>
            
            <tbody className='divide-y divide-slate-100'>
              <tr className='bg-slate-100 dark:bg-slate-500/20'><td colSpan={4} className='px-3 py-2 font-bold text-foreground'>1. Gross Operating Revenue</td></tr>
              
              <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4'>Sales Revenue</td></tr>
              <PLSection sectionObj={sections.revenue} />
              
              {sections.sales_returns.accounts.length > 0 && (
                <>
                  <tr><td colSpan={4} className='px-3 py-1.5 font-medium italic text-muted-foreground pl-4'>Less: Sales Returns & Allowances</td></tr>
                  <PLSection sectionObj={sections.sales_returns} isDeduction={true} />
                </>
              )}
              
              <tr className='border-t border-border bg-muted/50'>
                <td className='px-3 py-2 font-bold text-foreground text-right' colSpan={2}>Net Sales Revenue</td>
                <td className='px-3 py-2 font-bold text-right tabular-nums'>{fmtAcct(net_sales_cur)}</td>
                <td className='px-3 py-2 font-bold text-right tabular-nums text-muted-foreground'>{fmtAcct(net_sales_comp)}</td>
              </tr>

              <tr><td colSpan={4} className='px-3 py-2 font-bold text-foreground pt-4'>2. Cost of Goods Sold (COGS)</td></tr>
              
              <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-2'>Opening Stock</td></tr>
              {sections.opening_stock.accounts.length > 0 ? (
                <PLSection sectionObj={sections.opening_stock} />
              ) : (
                <tr className='text-slate-500'><td className='px-3 py-1.5 pl-8 border-none italic'>(No opening stock recorded)</td><td colSpan={3} className='border-none'></td></tr>
              )}
              
              <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-2'>Add: Purchases</td></tr>
              {sections.purchases.accounts.length > 0 ? (
                <PLSection sectionObj={sections.purchases} />
              ) : (
                <tr className='text-slate-500'><td className='px-3 py-1.5 pl-8 border-none italic'>(No purchases recorded)</td><td colSpan={3} className='border-none'></td></tr>
              )}
              
              <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-2'>Add: Direct Expenses</td></tr>
              {sections.cogs_other.accounts.length > 0 ? (
                <PLSection sectionObj={sections.cogs_other} />
              ) : (
                <tr className='text-slate-500'><td className='px-3 py-1.5 pl-8 border-none italic'>(No direct expenses recorded)</td><td colSpan={3} className='border-none'></td></tr>
              )}
              
              <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-2'>Less: Closing Stock</td></tr>
              {sections.closing_stock.accounts.length > 0 ? (
                <PLSection sectionObj={sections.closing_stock} isDeduction={true} />
              ) : (
                <tr className='text-slate-500'><td className='px-3 py-1.5 pl-8 border-none italic'>(No closing stock recorded)</td><td colSpan={3} className='border-none'></td></tr>
              )}

              <tr className='border-t border-border bg-muted/50'>
                <td className='px-3 py-2 font-bold text-foreground text-right' colSpan={2}>Total Cost of Goods Sold</td>
                <td className='px-3 py-2 font-bold text-right tabular-nums'>{fmtAcct(cogs_total_cur, true)}</td>
                <td className='px-3 py-2 font-bold text-right tabular-nums text-muted-foreground'>{fmtAcct(cogs_total_comp, true)}</td>
              </tr>
              
              <tr className='border-t border-border bg-indigo-50 dark:bg-indigo-500/10/50'>
                <td className='px-3 py-3 font-bold text-indigo-900 text-right uppercase tracking-wider' colSpan={2}>Gross Profit</td>
                <td className='px-3 py-3 font-bold text-right tabular-nums text-indigo-900 text-base border-double border-b-4 border-indigo-200 dark:border-indigo-500/20'>{fmtAcct(gross_profit_cur)}</td>
                <td className='px-3 py-3 font-bold text-right tabular-nums text-indigo-700 dark:text-indigo-400 text-base border-double border-b-4 border-indigo-100'>{fmtAcct(gross_profit_comp)}</td>
              </tr>

              <tr><td colSpan={4} className='px-3 py-2 font-bold text-foreground pt-6'>3. Operating Expenses</td></tr>
              
              {sections.opex_selling.accounts.length > 0 && (
                <>
                  <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-3'>Selling & Distribution Expenses</td></tr>
                  <PLSection sectionObj={sections.opex_selling} isDeduction={true} />
                </>
              )}
              
              {sections.opex_admin.accounts.length > 0 && (
                <>
                  <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-3'>General & Administrative Expenses</td></tr>
                  <PLSection sectionObj={sections.opex_admin} isDeduction={true} />
                </>
              )}

              <tr className='border-t border-border bg-muted/50'>
                <td className='px-3 py-2 font-bold text-foreground text-right' colSpan={2}>Total Operating Expenses</td>
                <td className='px-3 py-2 font-bold text-right tabular-nums text-red-600 dark:text-red-400'>{fmtAcct(total_opex_cur, true)}</td>
                <td className='px-3 py-2 font-bold text-right tabular-nums text-red-400'>{fmtAcct(total_opex_comp, true)}</td>
              </tr>

              <tr className='border-t border-border bg-emerald-50 dark:bg-emerald-500/10/50'>
                <td className='px-3 py-3 font-bold text-emerald-900 text-right uppercase tracking-wider' colSpan={2}>Operating Profit (EBIT)</td>
                <td className='px-3 py-3 font-bold text-right tabular-nums text-emerald-900 text-base'>{fmtAcct(op_profit_cur)}</td>
                <td className='px-3 py-3 font-bold text-right tabular-nums text-emerald-700 dark:text-emerald-400 text-base'>{fmtAcct(op_profit_comp)}</td>
              </tr>

              {(sections.non_op_income.accounts.length > 0 || sections.finance_cost.accounts.length > 0) && (
                <tr><td colSpan={4} className='px-3 py-2 font-bold text-foreground pt-6'>4. Non-Operating Income & Expenses</td></tr>
              )}
              
              {sections.non_op_income.accounts.length > 0 && (
                <>
                  <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-3'>Add: Other Income</td></tr>
                  <PLSection sectionObj={sections.non_op_income} />
                </>
              )}

              {sections.finance_cost.accounts.length > 0 && (
                <>
                  <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-3'>Less: Finance Costs</td></tr>
                  <PLSection sectionObj={sections.finance_cost} isDeduction={true} />
                </>
              )}

              <tr className='border-t border-border'>
                <td className='px-3 py-3 font-bold text-foreground text-right uppercase tracking-wider' colSpan={2}>Net Profit Before Tax</td>
                <td className='px-3 py-3 font-bold text-right tabular-nums text-foreground text-base'>{fmtAcct(pbt_cur)}</td>
                <td className='px-3 py-3 font-bold text-right tabular-nums text-muted-foreground text-base'>{fmtAcct(pbt_comp)}</td>
              </tr>

              <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-3'>Less: Provision for Corporate Income Tax</td></tr>
              <PLSection sectionObj={sections.tax} isDeduction={true} />
              
              <tr className='border-t border-slate-800 bg-muted/50 print:border-t-2'>
                <td className='px-3 py-4 font-black text-foreground text-right uppercase tracking-widest text-base' colSpan={2}>Net Income For The Period</td>
                <td className='px-3 py-4 font-black text-right tabular-nums text-foreground text-lg border-double border-b-4 border-slate-800 print:border-b-4'>{fmtAcct(net_profit_cur)}</td>
                <td className='px-3 py-4 font-black text-right tabular-nums text-muted-foreground text-lg border-double border-b-4 border-slate-500 print:border-b-4'>{fmtAcct(net_profit_comp)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        </>
        )}
      </div>
    );
  } catch (err) {
    return (
      <div className='bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-8 m-4 text-center space-y-4'>
        <div className='text-red-500 text-4xl mb-2'>⚠️</div>
        <h3 className='text-lg font-bold text-red-800 dark:text-red-300'>Income Statement Render Error</h3>
        <p className='text-red-600 dark:text-red-400 font-mono text-sm bg-card p-4 rounded border border-red-100 shadow-inner max-w-2xl mx-auto overflow-auto text-left'>
          {err.name}: {err.message}
        </p>
      </div>
    );
  }
}


// ── Balance Sheet (with decentralized filters) ────────────────────────────────
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

      // Merge balances into Chart of Accounts (Sub Ledgers only)
      const merged = allCoA.map(a => {
        if (a.ledger_type === 'Sub Ledger') {
          return { ...a, closing_balance: balanceMap[a.id] || 0 };
        }
        return a;
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
      <div className="report-no-print">
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
  const [filters,   setFilters]   = useCachedFilters(`simple_report_${reportId}`, { ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate });
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
      <div className="report-no-print">
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
        renderFn(data || [], filters.fromDate, filters.toDate)
      )}
    </div>
  );
}
// ── Detail General Ledger (with Account Picker) ───────────────────────────────
function GeneralLedgerDetailReport({ initialFromDate, initialToDate }) {
  const [filters,   setFilters]   = useCachedFilters('general_ledger_detail', { ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate, accountId: '' });
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
    ['', '', 'Opening Balance', '', '', fmtNPR(summary.ob) + (summary.obIsDr ? ' Dr' : ' Cr')],
    ...lines.map(l => [
      l.date,
      l.voucher_no ? <VoucherLink voucherNumber={l.voucher_no}><span className="cursor-pointer text-primary">{l.voucher_no}</span></VoucherLink> : '',
      l.description,
      fmtNPR(l.dr),
      fmtNPR(l.cr),
      fmtNPR(l.bal) + (l.balIsDr ? ' Dr' : ' Cr')
    ])
  ];

  const handleExport = () => downloadCSV('general_ledger_detail.csv',
    ['Date', 'Voucher #', 'Description', 'Debit', 'Credit', 'Balance'],
    [
      ['', '', 'Opening Balance', '', '', fmtNPR(summary.ob) + (summary.obIsDr ? ' Dr' : ' Cr')],
      ...lines.map(l => [
        l.date,
        l.voucher_no,
        l.description,
        fmtNPR(l.dr),
        fmtNPR(l.cr),
        fmtNPR(l.bal) + (l.balIsDr ? ' Dr' : ' Cr')
      ])
    ]
  );

  return (
    <div className="space-y-4">
      <div className="report-no-print">
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
            headers={['Date', 'Voucher #', 'Description', 'Debit (NPR)', 'Credit (NPR)', 'Balance (NPR)']}
            rows={tableRows}
            footer={['', '', 'Closing Balance', fmtNPR(lines.reduce((s,l)=>s+l.dr,0)), fmtNPR(lines.reduce((s,l)=>s+l.cr,0)), fmtNPR(summary.cb) + (summary.cbIsDr ? ' Dr' : ' Cr')]}
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

// ── Print Portal ──────────────────────────────────────────────────────────────
// ── Print Portal ──────────────────────────────────────────────────────────────
// Injects a clean print-only DOM node so window.print() renders ONLY the report
function usePrintPortal() {
  const portalRef = useRef(null);

  const openPrint = useCallback((contentEl) => {
    // Create or reuse the print portal div
    let portal = document.getElementById('sajilo-print-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'sajilo-print-portal';
      portal.style.cssText = 'position:absolute;top:0;left:-9999px;width:210mm;background:white;padding:10mm 12mm;';
      document.body.appendChild(portal);
    }
    portal.innerHTML = '';
    if (contentEl) {
      const clone = contentEl.cloneNode(true);
      // Remove filter bars, export buttons, and any other screen-only elements
      clone.querySelectorAll('.report-no-print').forEach(el => el.remove());
      // Strip scroll constraints so all rows are visible
      clone.style.overflow = 'visible';
      clone.style.maxHeight = 'none';
      clone.style.height = 'auto';
      portal.appendChild(clone);
    }
    // Move into view for print then restore
    portal.style.left = '0';
    setTimeout(() => {
      window.print();
      portal.style.left = '-9999px';
      portal.innerHTML = '';
    }, 400);
  }, []);

  return { openPrint, portalRef };
}

// ── Main ReportViewer ─────────────────────────────────────────────────────────
export default function ReportViewer({ reportId, data, fromDate, toDate, columnState, onClose }) {
  const printBodyRef = useRef(null);
  const { openPrint } = usePrintPortal();

  const handlePrint = useCallback(() => {
    openPrint(printBodyRef.current);
  }, [openPrint]);

  const renderContent = () => {
    switch (reportId) {
      case 'ledger_detail':
        return <GeneralLedgerDetailReport initialFromDate={fromDate} initialToDate={toDate} />;

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
            />
          )} />;

      case 'sales_by_item_monthly':
        return <SimpleReport title="Sales By Item Monthly" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Sales By Item Monthly" fromDate={fd} toDate={td}
              headers={['Item', 'Month', 'Qty Sold', 'Revenue (NPR)']}
              rows={rows.map(r => [r.item_name, r.month, r.qty_sold, fmtNPR(r.revenue)])}
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
          renderFn={(rows, fd, td) => (
            <ReportTable title="Journal Report" fromDate={fd} toDate={td}
              headers={['Date', 'Voucher #', 'Memo', 'Lines', 'Total Amount (NPR)']}
              rows={rows.map(r => [
                r.entry_date?.split('T')[0], 
                <VoucherLink voucherNumber={r.voucher_no}><span className="cursor-pointer text-primary">{r.voucher_no}</span></VoucherLink>, 
                r.memo, 
                r.lines?.length || 0, 
                fmtNPR(r.total_amount)
              ])}
              onExport={() => downloadCSV('journal_report.csv', ['Date','Voucher #','Memo','Lines','Total Amount'], rows.map(r=>[r.entry_date?.split('T')[0], r.voucher_no, r.memo, r.lines?.length || 0, r.total_amount?.toFixed(2)]))}
            />
          )} />;

      case 'txn_list':
        return <SimpleReport title="Transaction List" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Transaction List" fromDate={fd} toDate={td}
              headers={['Date', 'Voucher #', 'Account', 'Description', 'Debit (NPR)', 'Credit (NPR)']}
              rows={rows.map(r => [
                r.entry_date, 
                <VoucherLink voucherNumber={r.voucher_no}><span className="cursor-pointer text-primary">{r.voucher_no}</span></VoucherLink>, 
                r.account_name, 
                r.description || r.journal_memo, 
                fmtNPR(r.debit_amount), 
                fmtNPR(r.credit_amount)
              ])}
              footer={['', '', '', 'TOTAL', fmtNPR(rows.reduce((s,r)=>s+(r.debit_amount||0),0)), fmtNPR(rows.reduce((s,r)=>s+(r.credit_amount||0),0))]}
              onExport={() => downloadCSV('txn_list.csv', ['Date','Voucher','Account','Description','Debit','Credit'], rows.map(r=>[r.entry_date, r.voucher_no, r.account_name, r.description || r.journal_memo, r.debit_amount?.toFixed(2), r.credit_amount?.toFixed(2)]))}
            />
          )} />;

      case 'purchase_summary':
        return <SimpleReport title="Purchase Summary" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Purchase Summary" fromDate={fd} toDate={td}
              headers={['Bill #','Date','Supplier','Status','Subtotal (NPR)','VAT (NPR)','Grand Total (NPR)']}
              rows={rows.map(r => [r.bill_number, r.bill_date, r.vendor_name, r.status, fmtNPR(r.subtotal), fmtNPR(r.vat_amount), fmtNPR(r.grand_total)])}
              footer={['','','','TOTAL','', fmtNPR(rows.reduce((s,r)=>s+(r.vat_amount||0),0)), fmtNPR(rows.reduce((s,r)=>s+(r.grand_total||0),0))]}
              onExport={() => downloadCSV('purchase_summary.csv',['Bill #','Date','Supplier','Status','Subtotal','VAT','Grand Total'],rows.map(r=>[r.bill_number,r.bill_date,r.vendor_name,r.status,r.subtotal?.toFixed(2),r.vat_amount?.toFixed(2),r.grand_total?.toFixed(2)]))}
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
          renderFn={(rows, fd, td) => (
            <ReportTable title="Sales Summary" fromDate={fd} toDate={td}
              headers={['Invoice #','Date','Customer','Status','Subtotal (NPR)','VAT (NPR)','Grand Total (NPR)']}
              rows={rows.map(r => [r.invoice_number, r.invoice_date, r.customer_name, r.status, fmtNPR(r.goods_subtotal), fmtNPR(r.total_tax_amount), fmtNPR(r.grand_total)])}
              footer={['','','','TOTAL','', fmtNPR(rows.reduce((s,r)=>s+(r.total_tax_amount||0),0)), fmtNPR(rows.reduce((s,r)=>s+(r.grand_total||0),0))]}
              onExport={() => downloadCSV('sales_summary.csv',['Invoice #','Date','Customer','Status','Subtotal','VAT','Grand Total'],rows.map(r=>[r.invoice_number,r.invoice_date,r.customer_name,r.status,r.goods_subtotal?.toFixed(2),r.total_tax_amount?.toFixed(2),r.grand_total?.toFixed(2)]))}
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
              rows={rows.map(r => [r.invoice_number, r.invoice_date, r.customer_name, fmtNPR(r.grand_total), r.payment_status])}
              footer={['','','TOTAL', fmtNPR(rows.reduce((s,r)=>s+(r.grand_total||0),0)), '']}
              onExport={() => downloadCSV('unpaid_invoices.csv',['Invoice','Date','Customer','Total','Status'],rows.map(r=>[r.invoice_number,r.invoice_date,r.customer_name,r.grand_total?.toFixed(2),r.payment_status]))}
            />
          )} />;

      case 'unpaid_bills':
        return <SimpleReport title="Unpaid Purchase Invoices" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows) => (
            <ReportTable title="Unpaid Purchase Invoices"
              headers={['Invoice #','Date','Supplier','Grand Total (NPR)','Payment Status']}
              rows={rows.map(r => [r.invoice_number, r.invoice_date, r.customer_name||r.vendor_name, fmtNPR(r.grand_total), r.payment_status])}
              footer={['','','TOTAL', fmtNPR(rows.reduce((s,r)=>s+(r.grand_total||0),0)), '']}
              onExport={() => downloadCSV('unpaid_bills.csv',['Invoice','Date','Supplier','Total','Status'],rows.map(r=>[r.invoice_number,r.invoice_date,r.customer_name||r.vendor_name,r.grand_total?.toFixed(2),r.payment_status]))}
            />
          )} />;

      case 'vat_sales':
      case 'vat_summary':
        return <SimpleReport title="Sales VAT Register" reportId="vat_sales" initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Sales VAT Register" fromDate={fd} toDate={td}
              headers={['Invoice #','Date','Customer','Subtotal (NPR)','VAT (NPR)','Grand Total (NPR)']}
              rows={rows.map(r => [r.invoice_number, r.invoice_date, r.customer_name, fmtNPR(r.goods_subtotal), fmtNPR(r.total_tax_amount||r.vat_amount), fmtNPR(r.grand_total)])}
              footer={['','','Total VAT','', fmtNPR(rows.reduce((s,r)=>s+(r.total_tax_amount||r.vat_amount||0),0)),'']}
              onExport={() => downloadCSV('sales_vat.csv',['Invoice','Date','Customer','Subtotal','VAT','Total'],rows.map(r=>[r.invoice_number,r.invoice_date,r.customer_name,r.goods_subtotal?.toFixed(2),(r.total_tax_amount||r.vat_amount)?.toFixed(2),r.grand_total?.toFixed(2)]))}
            />
          )} />;

      case 'vat_purchases':
        return <SimpleReport title="Purchase VAT Register" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Purchase VAT Register" fromDate={fd} toDate={td}
              headers={['Invoice #','Date','Supplier','Subtotal (NPR)','VAT (NPR)','Grand Total (NPR)']}
              rows={rows.map(r => [r.invoice_number||r.bill_number, r.invoice_date||r.bill_date, r.customer_name||r.vendor_name, fmtNPR(r.goods_subtotal||r.subtotal), fmtNPR(r.vat_amount||r.total_tax_amount), fmtNPR(r.grand_total)])}
              footer={['','','Total VAT','', fmtNPR(rows.reduce((s,r)=>s+(r.vat_amount||r.total_tax_amount||0),0)),'']}
              onExport={() => downloadCSV('purchase_vat.csv',['Invoice','Date','Supplier','Subtotal','VAT','Total'],rows.map(r=>[r.invoice_number||r.bill_number,r.invoice_date||r.bill_date,r.customer_name||r.vendor_name,(r.goods_subtotal||r.subtotal)?.toFixed(2),(r.vat_amount||r.total_tax_amount)?.toFixed(2),r.grand_total?.toFixed(2)]))}
            />
          )} />;

      case 'sales_return_report':
        return <SimpleReport title="Sales Return Report" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Sales Return Report" fromDate={fd} toDate={td}
              headers={['Return #','Date','Customer','Amount (NPR)','Status']}
              rows={rows.map(r => [r.return_number, r.return_date, r.customer_name, fmtNPR(r.grand_total), r.status])}
              onExport={() => downloadCSV('sales_returns.csv',['Return #','Date','Customer','Amount','Status'],rows.map(r=>[r.return_number,r.return_date,r.customer_name,r.grand_total?.toFixed(2),r.status]))}
            />
          )} />;

      case 'category_summary':
        return <SimpleReport title="Category-wise Summary" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows) => (
            <ReportTable title="Category-wise Summary"
              headers={['Category','Items','Total Qty','Total Value (NPR)']}
              rows={rows.map(r => [r.category, r.item_count, r.total_qty, r.total_value])}
              onExport={() => downloadCSV('category_summary.csv',['Category','Items','Qty','Value'],rows.map(r=>[r.category,r.item_count,r.total_qty,r.total_value]))}
            />
          )} />;

      default:
        return <p className="text-muted-foreground text-sm py-8 text-center">Report viewer not yet available for this report type.</p>;
    }
  };

  return (
    <>
      {/* Print stylesheet injection */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_STYLE }} />

      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-2 sm:p-4">
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
          {/* Modal Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
            <p className="text-xs text-muted-foreground font-medium">
              Report Viewer — use filters inside each report to adjust the period
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={handlePrint}>
                <Printer className="w-3.5 h-3.5 mr-1" /> Print / PDF
              </Button>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-1">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          {/* Report Body — ref used for print portal cloning */}
          <div ref={printBodyRef} className="flex-1 overflow-y-auto p-5">
            {renderContent()}
          </div>
        </div>
      </div>
    </>
  );
}