/**
 * ReportViewer — Modal shell.
 * Each report renderer manages its own isolated filter state.
 * Print layout is governed by the global @media print stylesheet injected here.
 */
import { X, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BusinessHeader from '@/components/reports/BusinessHeader';
import PartnerStatement from '@/components/reports/PartnerStatement';
import FinancialReportTable from '@/components/reports/FinancialReportTable';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { exportFlatXLSX } from '@/lib/reports/reportExcelExport';
import { sajilo } from '@/api/sajiloClient';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { adToBS, formatBS, formatAD } from '@/lib/nepaliDate';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtNPR(n) {
  const num = Number(n || 0);
  return num === 0 ? '—' : `NPR ${num.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    table-layout: fixed !important;
    border-collapse: collapse !important;
  }
  th, td {
    padding: 3pt 5pt !important;
    word-break: break-word !important;
    overflow-wrap: break-word !important;
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
function ReportTable({ title, subtitle, headers, rows, footer, onExport, fromDate, toDate }) {
  const rightCols = new Set([headers.length - 1, headers.length - 2]); // last 2 cols = numeric

  return (
    <div className="space-y-3">
      <BusinessHeader reportTitle={title} fromDate={fromDate} toDate={toDate} subtitle={subtitle} />
      <div className="report-no-print flex justify-end">
        {onExport && (
          <button onClick={onExport}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-emerald-300 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-colors">
            ↓ Export Excel (.xlsx)
          </button>
        )}
      </div>
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm print:text-[10pt]" style={{ tableLayout: 'auto' }}>
            <thead className="bg-slate-100 border-b-2 border-slate-300">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className={`px-3 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap ${i >= headers.length - 2 ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0
                ? <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-muted-foreground text-sm">No data found for the selected period.</td></tr>
                : rows.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/20 print:hover:bg-transparent">
                    {row.map((cell, j) => (
                      <td key={j} className={`px-3 py-2 print:text-[10pt] ${j >= row.length - 2 ? 'text-right tabular-nums font-mono' : ''}`}
                        style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
            {footer && (
              <tfoot className="bg-slate-100 border-t-2 border-slate-400 font-semibold">
                <tr>
                  {footer.map((cell, j) => (
                    <td key={j} className={`px-3 py-2.5 print:text-[10pt] font-bold ${j >= footer.length - 2 ? 'text-right tabular-nums font-mono' : ''}`}>
                      {cell}
                    </td>
                  ))}
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
  const [filters, setFilters] = useState({
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
          accountTotals[l.account_id] = { cur_dr: 0, cur_cr: 0, future_dr: 0, future_cr: 0 };
        }
        
        if (date > filters.toDate) {
          accountTotals[l.account_id].future_dr += (l.debit_amount || 0);
          accountTotals[l.account_id].future_cr += (l.credit_amount || 0);
        } else if (date >= filters.fromDate && date <= filters.toDate) {
          accountTotals[l.account_id].cur_dr += (l.debit_amount || 0);
          accountTotals[l.account_id].cur_cr += (l.credit_amount || 0);
        }
      });

      // Collect IDs of accounts that partners reference as their AR/AP control account
      // so we can promote them to Group Ledger in the hierarchy
      // Collect the PARENT group account IDs (e.g. "Sundry Debtors" group)
      // by finding group-ledger accounts whose children are partner sub-ledgers.
      // Strategy: fetch partners, collect their receivable/payable account IDs (those are the
      // individual sub-ledger accounts), then find THEIR parent_account_id — that parent is
      // the true control group (e.g. "Sundry Debtors").
      const [arPartners, apPartners] = await Promise.all([
        sajilo.entities.BusinessPartner.filter({ is_customer: true }),
        sajilo.entities.BusinessPartner.filter({ is_vendor: true }),
      ]);

      // IDs of the individual partner sub-ledger accounts (10200001, 10200002 etc.)
      const partnerSubLedgerIds = new Set([
        ...arPartners.map(p => p.receivable_account_id).filter(Boolean),
        ...apPartners.map(p => p.payable_account_id).filter(Boolean),
      ]);

      // Find their parent group account IDs — these are the true control groups
      const controlGroupIds = new Set();
      all.forEach(a => {
        if (partnerSubLedgerIds.has(a.id) && a.parent_account_id) {
          controlGroupIds.add(a.parent_account_id);
        }
      });
      // Also detect by AR/AP name keywords on Group Ledger accounts
      all.forEach(a => {
        if (a.ledger_type === 'Group Ledger' && (isARGroup(a) || isAPGroup(a))) {
          controlGroupIds.add(a.id);
        }
      });

      setAccounts(all.map(a => {
        const isControlAccount = a.ledger_type === 'Group Ledger' && controlGroupIds.has(a.id);
        
        const t = accountTotals[a.id] || { cur_dr: 0, cur_cr: 0, future_dr: 0, future_cr: 0 };
        const isDebitNormal = ['Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense'].includes(a.account_type);
        
        // Use current_balance as the absolute source of truth and work backward
        let current_balance = Number(a.current_balance || 0);
        let cb_net_dr = isDebitNormal ? current_balance : -current_balance;
        
        // Subtract future journals to find closing balance at toDate
        cb_net_dr = cb_net_dr - ((t.future_dr || 0) - (t.future_cr || 0));
        
        // Subtract current journals to find opening balance at fromDate
        let ob_net_dr = cb_net_dr - ((t.cur_dr || 0) - (t.cur_cr || 0));
        
        let net_ob_dr = 0, net_ob_cr = 0;
        if (ob_net_dr >= 0) {
          net_ob_dr = ob_net_dr;
        } else {
          net_ob_cr = -ob_net_dr;
        }
        
        const cur_dr = t.cur_dr || 0;
        const cur_cr = t.cur_cr || 0;
        
        let net_cb_dr = 0, net_cb_cr = 0;
        if (cb_net_dr >= 0) {
          net_cb_dr = cb_net_dr;
        } else {
          net_cb_cr = -cb_net_dr;
        }

        return {
          ...a,
          _isControlAccount:  isControlAccount,
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

  /**
   * Lazy-load partner sub-ledger rows when an AR/AP group is first expanded.
   *
   * Resolution strategy (in priority order):
   *   1. Partners explicitly linked via receivable_account_id / payable_account_id = group.id
   *   2. Fallback: all customers (AR) or all vendors (AP) when the group name matches AR/AP keywords
   *
   * Balance sources (summed):
   *   a. partner.opening_balance
   *   b. GL lines posted against the partner's name within the selected date range (via GeneralLedgerLine)
   */
  const loadPartners = useCallback(async (group) => {
    if (partnerRows[group.id] !== undefined) return; // already loaded
    setPartnerRows(prev => ({ ...prev, [group.id]: null })); // mark loading

    try {
      const isAR = isARGroup(group);
      const isAP = isAPGroup(group);

      // Only expand partner rows for AR or AP control accounts
      if (!isAR && !isAP) {
        setPartnerRows(prev => ({ ...prev, [group.id]: [] }));
        return;
      }

      // Fetch all partners of the relevant type.
      // Then filter to those whose sub-ledger parent is this control group.
      // E.g. partner.receivable_account_id points to "Bhajan Rai" sub-ledger whose
      // parent_account_id === group.id ("Sundry Debtors").
      const allByType = await sajilo.entities.BusinessPartner.filter(
        isAR ? { is_customer: true } : { is_vendor: true }
      );

      // Fetch sub-ledger accounts that are children of this group
      const childSubLedgers = await sajilo.entities.ChartOfAccount.filter(
        { parent_account_id: group.id }, 'account_code', 500
      );
      const childSubLedgerIds = new Set(childSubLedgers.map(a => a.id));

      // Partners whose AR/AP sub-ledger is a child of this group
      const linkedPartners = allByType.filter(p => {
        const subLedgerId = isAR ? p.receivable_account_id : p.payable_account_id;
        return subLedgerId && childSubLedgerIds.has(subLedgerId);
      });

      // Fall back to all partners of the type if none are FK-linked to this group's children
      const partners = linkedPartners.length > 0 ? linkedPartners : allByType;

      // Fetch GL lines for this control account to build per-partner transaction totals
      const [glLines, journals] = await Promise.all([
        sajilo.entities.GeneralLedgerLine.filter({ account_id: group.id }, '', 5000),
        sajilo.entities.GeneralLedgerJournal.filter({ status: 'Posted' }, 'entry_date', 10000)
      ]);
      
      const journalMap = {};
      journals.forEach(j => { 
        journalMap[j.id] = j.entry_date ? j.entry_date.split('T')[0] : ''; 
      });

      // Build per-partner GL debit/credit totals by matching description to partner name
      const glByPartner = {};
      for (const line of glLines) {
        const date = journalMap[line.journal_id];
        if (!date) continue; // skip unposted or non-matching journals

        const desc = (line.description || '').toLowerCase();
        const match = partners.find(p => desc.includes(p.name.toLowerCase()));
        if (!match) continue;
        
        if (!glByPartner[match.id]) glByPartner[match.id] = { ob_dr: 0, ob_cr: 0, cur_dr: 0, cur_cr: 0 };
        
        if (date < filters.fromDate) {
          glByPartner[match.id].ob_dr += (line.debit_amount || 0);
          glByPartner[match.id].ob_cr += (line.credit_amount || 0);
        } else if (date >= filters.fromDate && date <= filters.toDate) {
          glByPartner[match.id].cur_dr += (line.debit_amount || 0);
          glByPartner[match.id].cur_cr += (line.credit_amount || 0);
        }
      }

      // Build partner rows — include anyone with opening balance OR GL activity
      const rows = partners
        .map(p => {
          const t = glByPartner[p.id] || { ob_dr: 0, ob_cr: 0, cur_dr: 0, cur_cr: 0 };
          const ob     = Math.abs(p.opening_balance || 0);
          const isObDr = (p.opening_balance_type || 'Dr') === 'Dr';

          let base_ob_dr = 0, base_ob_cr = 0;
          if (isObDr) {
            base_ob_dr = ob;
          } else {
            base_ob_cr = ob;
          }
          
          let total_ob_dr = base_ob_dr + t.ob_dr;
          let total_ob_cr = base_ob_cr + t.ob_cr;

          let net_ob_dr = 0, net_ob_cr = 0;
          const net_ob = total_ob_dr - total_ob_cr;
          if (isAR) {
            if (net_ob >= 0) net_ob_dr = net_ob; else net_ob_cr = -net_ob;
          } else {
            if (net_ob <= 0) net_ob_cr = -net_ob; else net_ob_dr = net_ob;
          }

          const cur_dr = t.cur_dr;
          const cur_cr = t.cur_cr;

          const total_dr = net_ob_dr + cur_dr;
          const total_cr = net_ob_cr + cur_cr;
          
          let net_cb_dr = 0, net_cb_cr = 0;
          const net_cb = total_dr - total_cr;
          if (isAR) {
            if (net_cb >= 0) net_cb_dr = net_cb; else net_cb_cr = -net_cb;
          } else {
            if (net_cb <= 0) net_cb_cr = -net_cb; else net_cb_dr = net_cb;
          }

          // Skip partners with zero activity
          if (net_ob_dr === 0 && net_ob_cr === 0 && cur_dr === 0 && cur_cr === 0 && net_cb_dr === 0 && net_cb_cr === 0) return null;

          return {
            id:              `partner-${p.id}`,
            account_code:    p.partner_code || '',
            account_name:    p.name,
            account_type:    isAR ? 'Asset' : 'Liability',
            opening_debit:   net_ob_dr,
            opening_credit:  net_ob_cr,
            current_debit:   cur_dr,
            current_credit:  cur_cr,
            closing_debit:   net_cb_dr,
            closing_credit:  net_cb_cr,
            _isPartner:      true,
          };
        })
        .filter(Boolean);

      setPartnerRows(prev => ({ ...prev, [group.id]: rows }));
    } catch (err) {
      console.error('[Partner drill-down error]', err);
      setPartnerRows(prev => ({ ...prev, [group.id]: [] }));
    }
  }, [partnerRows, filters.fromDate, filters.toDate]);

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
            partnerRows={partnerRows}
            onGroupExpand={loadPartners}
          />
        </>
      )}
    </div>
  );
}

// ── Generic partner report (AR / AP) with metadata column picker ──────────────
function PartnerReport({ title, mode, initialFromDate, initialToDate }) {
  const [filters,   setFilters]   = useState({ ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate });
  const [partners,  setPartners]  = useState([]);
  const [invoices,  setInvoices]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
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

// ── Profit & Loss (with decentralized filters) ────────────────────────────────
function ProfitLossReport({ initialData, initialFromDate, initialToDate }) {
  const [filters,   setFilters]   = useState({ ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate, expandAll: true });
  const [data,      setData]      = useState(initialData);
  const [loading,   setLoading]   = useState(false);
  const [hasLoaded, setHasLoaded] = useState(!!initialData);
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

  // Tree logic
  const accounts = data?.accounts || [];
  const childrenMap = {};
  accounts.forEach(a => {
    if (a.parent_account_id) {
      if (!childrenMap[a.parent_account_id]) childrenMap[a.parent_account_id] = [];
      childrenMap[a.parent_account_id].push(a);
    }
  });

  const rollup = (account) => {
    let bal = account.balance || 0;
    (childrenMap[account.id] || []).forEach(c => { bal += rollup(c); });
    account.rollup_balance = bal;
    return bal;
  };

  const idSet = new Set(accounts.map(a => a.id));
  const rootAccounts = accounts.filter(a => !a.parent_account_id || !idSet.has(a.parent_account_id));
  rootAccounts.forEach(r => rollup(r));

  const sections = {
    income: { title: 'Income', accounts: [], total: 0 },
    cogs: { title: 'Cost of Goods Sold', accounts: [], total: 0 },
    opex: { title: 'Operating Expenses', accounts: [], total: 0 },
    non_op_income: { title: 'Non-Operating Income', accounts: [], total: 0 },
    finance_cost: { title: 'Finance Cost', accounts: [], total: 0 },
    tax: { title: 'Tax Expense', accounts: [], total: 0 }
  };

  rootAccounts.forEach(a => {
    const t = a.account_type;
    const st = a.account_subtype;
    if (['Revenue', 'Other Income'].includes(t)) {
      if (st === 'Non-Operating Revenue') sections.non_op_income.accounts.push(a);
      else sections.income.accounts.push(a);
    } else if (['COGS', 'Cost of Goods Sold'].includes(t) || st === 'Direct Expense') {
      sections.cogs.accounts.push(a);
    } else if (['Expense', 'OPEX', 'Other Expense'].includes(t)) {
      const name = a.account_name.toLowerCase();
      if (name.includes('tax')) sections.tax.accounts.push(a);
      else if (name.includes('interest') || name.includes('finance')) sections.finance_cost.accounts.push(a);
      else sections.opex.accounts.push(a);
    }
  });

  Object.values(sections).forEach(s => {
    s.total = s.accounts.reduce((sum, a) => sum + a.rollup_balance, 0);
  });

  const gross_profit = sections.income.total - sections.cogs.total;
  const operating_profit = gross_profit - sections.opex.total;
  const profit_before_tax = operating_profit + sections.non_op_income.total - sections.finance_cost.total;
  const net_profit = profit_before_tax - sections.tax.total;

  const handleExport = () => downloadCSV('income_statement.xlsx',
    ['Code', 'Account', 'Amount'],
    [['', 'Not yet supported in hierarchical mode', '']]
  );

  const renderTree = (account, level = 0) => {
    const children = childrenMap[account.id] || [];
    const isGroup = account.ledger_type === 'Group Ledger' || children.length > 0;
    const isExpanded = expanded[account.id] !== undefined ? expanded[account.id] : filters.expandAll;
    if (!filters.showZeroBalance && Math.abs(account.rollup_balance) < 0.01) return null;

    return (
      <React.Fragment key={account.id}>
        <tr className={`hover:bg-muted/20 print:hover:bg-transparent ${isGroup ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
          <td className="px-3 py-2 font-mono text-xs text-muted-foreground w-24 border-none">{account.account_code}</td>
          <td className="px-3 py-2 border-none" style={{ paddingLeft: `${12 + level * 20}px` }}>
            {isGroup ? (
              <button onClick={() => toggleExpand(account.id)} className="flex items-center gap-1.5 hover:text-primary transition-colors text-left w-full">
                <span className="w-3 inline-block text-center text-[10px] text-slate-400">{isExpanded ? '▼' : '▶'}</span>
                {account.account_name}
              </button>
            ) : (
              <span className="pl-4.5 block">{account.account_name}</span>
            )}
          </td>
          <td className={`px-3 py-2 text-right tabular-nums font-mono border-none ${account.rollup_balance < 0 ? 'text-red-600' : ''}`}>
            {account.rollup_balance < 0 ? `(${fmtNPR(Math.abs(account.rollup_balance))})` : fmtNPR(account.rollup_balance)}
          </td>
        </tr>
        {isGroup && isExpanded && children.map(c => renderTree(c, level + 1))}
      </React.Fragment>
    );
  };

  const PLSection = ({ title, sectionObj, hideIfZero }) => {
    const { accounts, total } = sectionObj;
    if (hideIfZero && Math.abs(total) < 0.01 && accounts.length === 0) return null;
    return (
      <div className="mb-6 page-break-inside-avoid">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b-2 border-slate-300 pb-1.5 mb-1 pl-3">{title}</h3>
        <table className="w-full text-sm print:text-[10pt]">
          <tbody className="divide-y divide-slate-100">
            {accounts.map(a => renderTree(a, 0))}
            {accounts.length === 0 && <tr><td colSpan={3} className="px-3 py-2 text-muted-foreground text-xs italic pl-8">No entries</td></tr>}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t border-slate-200">
              <td colSpan={2} className="px-3 py-2.5 font-bold text-slate-700">Total {title}</td>
              <td className={`px-3 py-2.5 text-right font-bold tabular-nums font-mono ${total < 0 ? 'text-red-600' : ''}`}>
                {total < 0 ? `(${fmtNPR(Math.abs(total))})` : fmtNPR(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  const SummaryRow = ({ label, amount, bgClass = 'bg-slate-100', textClass = 'text-slate-800', borderClass = 'border-slate-300' }) => (
    <div className={`flex justify-between font-bold text-sm px-4 py-3 mb-6 rounded-lg border-2 ${bgClass} ${textClass} ${borderClass} page-break-inside-avoid shadow-sm`}>
      <span className="uppercase tracking-wider">{label}</span>
      <span className="tabular-nums font-mono text-base">{amount < 0 ? `(${fmtNPR(Math.abs(amount))})` : fmtNPR(amount)}</span>
    </div>
  );

  const KPICard = ({ title, amount, percentage }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between report-no-print">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-xl font-bold tabular-nums ${amount < 0 ? 'text-red-600' : 'text-slate-800'}`}>
          {amount < 0 ? `(${fmtNPR(Math.abs(amount))})` : fmtNPR(amount)}
        </span>
        {percentage !== undefined && (
          <span className="text-xs font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
            {percentage}%
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="report-no-print">
        <ReportFilterBar filters={filters} onChange={setFilters} onApply={load} showApplyButton />
      </div>
      {!hasLoaded ? (
        <div className="py-16 text-center space-y-3">
          <div className="text-4xl">📊</div>
          <p className="text-sm font-semibold text-foreground">Select your date range and click <span className="text-primary">Apply</span> to generate the Income Statement.</p>
        </div>
      ) : loading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
      ) : (
      <>
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 report-no-print">
        <KPICard title="Total Revenue" amount={sections.income.total} />
        <KPICard title="Gross Profit" amount={gross_profit} percentage={sections.income.total ? ((gross_profit / sections.income.total)*100).toFixed(1) : 0} />
        <KPICard title="Operating Profit" amount={operating_profit} percentage={sections.income.total ? ((operating_profit / sections.income.total)*100).toFixed(1) : 0} />
        <KPICard title="Net Profit" amount={net_profit} percentage={sections.income.total ? ((net_profit / sections.income.total)*100).toFixed(1) : 0} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden p-6 print:p-0 print:border-none print:shadow-none">
        <BusinessHeader reportTitle="INCOME STATEMENT" subtitle="(Profit & Loss Statement)" fromDate={filters.fromDate} toDate={filters.toDate} />
        <div className="report-no-print flex justify-end gap-2 mb-6">
          <Button variant="outline" size="sm" onClick={() => setFilters(f => ({ ...f, expandAll: !f.expandAll }))}>
            {filters.expandAll ? 'Collapse All' : 'Expand All'}
          </Button>
          <button onClick={handleExport} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-emerald-300 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-colors">
            ↓ Export Excel
          </button>
        </div>
        
        <div className="max-w-4xl mx-auto">
          <PLSection title={sections.income.title} sectionObj={sections.income} />
          <PLSection title={sections.cogs.title} sectionObj={sections.cogs} />
          
          <SummaryRow label="Gross Profit" amount={gross_profit} bgClass="bg-emerald-50" textClass="text-emerald-800" borderClass="border-emerald-200" />
          
          <PLSection title={sections.opex.title} sectionObj={sections.opex} />
          
          <SummaryRow label="Operating Profit" amount={operating_profit} bgClass="bg-blue-50" textClass="text-blue-800" borderClass="border-blue-200" />
          
          <PLSection title={sections.non_op_income.title} sectionObj={sections.non_op_income} hideIfZero />
          <PLSection title={sections.finance_cost.title} sectionObj={sections.finance_cost} hideIfZero />
          
          {(sections.non_op_income.total !== 0 || sections.finance_cost.total !== 0) && (
             <SummaryRow label="Profit Before Tax" amount={profit_before_tax} bgClass="bg-amber-50" textClass="text-amber-800" borderClass="border-amber-200" />
          )}

          <PLSection title={sections.tax.title} sectionObj={sections.tax} hideIfZero />
          
          <div className={`flex justify-between items-center px-5 py-4 mt-8 rounded-xl border-2 shadow-sm page-break-inside-avoid ${net_profit >= 0 ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-red-600 text-white border-red-700'}`}>
            <span className="text-lg font-bold tracking-widest">NET PROFIT AFTER TAX</span>
            <span className="text-2xl font-bold tabular-nums font-mono">
              {net_profit < 0 ? `(${fmtNPR(Math.abs(net_profit))})` : fmtNPR(net_profit)}
            </span>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}

// ── Balance Sheet (with decentralized filters) ────────────────────────────────
function BalanceSheetReport({ initialData, initialFromDate, initialToDate }) {
  const [filters,   setFilters]   = useState({ ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate });
  const [data,      setData]      = useState(initialData);
  const [loading,   setLoading]   = useState(false);
  const [hasLoaded, setHasLoaded] = useState(!!initialData);

  const load = useCallback(async () => {
    setHasLoaded(true);
    setLoading(true);
    const accounts = await sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 1000);
    // STRICT: only persisted Sub Ledger rows with a valid account_code and non-zero balance
    const sub = accounts.filter(a => a.ledger_type === 'Sub Ledger' && a.account_code && a.account_code !== '—' && (a.current_balance || 0) !== 0);
    const toRow = a => ({ account_code: a.account_code, account_name: a.account_name, balance: a.current_balance || 0 });
    const assets      = sub.filter(a => a.account_type === 'Asset').map(toRow);
    const liabilities = sub.filter(a => a.account_type === 'Liability').map(toRow);
    const equity      = sub.filter(a => a.account_type === 'Equity').map(toRow);
    setData({ assets, liabilities, equity, total_assets: assets.reduce((s,a)=>s+a.balance,0), total_liabilities: liabilities.reduce((s,a)=>s+a.balance,0), total_equity: equity.reduce((s,a)=>s+a.balance,0) });
    setLoading(false);
  }, []);

  // Do NOT auto-load on mount
  // useEffect(() => { if (!initialData) load(); }, []);

  const { assets=[], liabilities=[], equity=[], total_assets=0, total_liabilities=0, total_equity=0 } = data || {};

  const handleExport = () => downloadCSV('balance_sheet.xlsx',
    ['Code', 'Account', 'Balance (NPR)'],
    [
      ...assets.map(a      => [a.account_code, `    ${a.account_name}`, a.balance.toFixed(2)]),
      ['', 'Total Assets',      total_assets.toFixed(2)],
      ...liabilities.map(a => [a.account_code, `    ${a.account_name}`, a.balance.toFixed(2)]),
      ['', 'Total Liabilities', total_liabilities.toFixed(2)],
      ...equity.map(a      => [a.account_code, `    ${a.account_name}`, a.balance.toFixed(2)]),
      ['', 'Total Equity',      total_equity.toFixed(2)],
    ]
  );

  const BSSection = ({ title, accounts, total, color }) => {
    const bg = { emerald: 'bg-emerald-50', red: 'bg-red-50', blue: 'bg-blue-50' }[color] || 'bg-muted/30';
    return (
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{title}</p>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm print:text-[10pt]">
            <thead className="bg-slate-50 border-b border-border">
              <tr>
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-500 w-24">Code</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-slate-500">Account</th>
                <th className="px-3 py-1.5 text-right text-xs font-semibold text-slate-500">Balance (NPR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accounts.map((a, i) => (
                <tr key={i} className="hover:bg-muted/20 print:hover:bg-transparent">
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{a.account_code}</td>
                  <td className="px-3 py-1.5 pl-5 text-muted-foreground" style={{ wordBreak: 'break-word' }}>{a.account_name}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-mono">{fmtNPR(a.balance)}</td>
                </tr>
              ))}
              {accounts.length === 0 && <tr><td colSpan={3} className="px-3 py-2 text-muted-foreground text-xs italic">No entries</td></tr>}
            </tbody>
            <tfoot><tr className={bg}>
              <td className="px-3 py-2 font-semibold" colSpan={2}>Total {title}</td>
              <td className="px-3 py-2 text-right font-bold tabular-nums font-mono">{fmtNPR(total)}</td>
            </tr></tfoot>
          </table>
        </div>
      </div>
    );
  };

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
        <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
      ) : (
        <>
          <BusinessHeader reportTitle="Balance Sheet" toDate={filters.toDate} subtitle={`As of ${filters.toDate}`} />
          <div className="report-no-print flex justify-end">
            <button onClick={handleExport} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-emerald-300 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-colors">↓ Export Excel (.xlsx)</button>
          </div>
          <div className="space-y-4">
            <BSSection title="Assets"      accounts={assets}      total={total_assets}      color="emerald" />
            <BSSection title="Liabilities" accounts={liabilities} total={total_liabilities} color="red" />
            <BSSection title="Equity"      accounts={equity}      total={total_equity}      color="blue" />
          </div>
        </>
      )}
    </div>
  );
}

// ── Simple flat report with local filter ──────────────────────────────────────
function SimpleReport({ title, reportId, initialData, initialFromDate, initialToDate, renderFn }) {
  const [filters,   setFilters]   = useState({ ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate });
  const [data,      setData]      = useState(initialData);
  const [loading,   setLoading]   = useState(false);
  const [hasLoaded, setHasLoaded] = useState(!!initialData);

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
  const [filters,   setFilters]   = useState({ ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate, accountId: '' });
  const [accounts,  setAccounts]  = useState([]);
  const [lines,     setLines]     = useState([]);
  const [summary,   setSummary]   = useState({ ob: 0, cb: 0, obIsDr: true, cbIsDr: true });
  const [loading,   setLoading]   = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

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
      const [allLines, journals] = await Promise.all([
        sajilo.entities.GeneralLedgerLine.filter({ account_id: filters.accountId }, '', 10000),
        sajilo.entities.GeneralLedgerJournal.filter({ status: 'Posted' }, 'entry_date', 10000)
      ]);
      const journalMap = {};
      journals.forEach(j => { journalMap[j.id] = j; });
      
      const acc = accounts.find(a => a.id === filters.accountId);
      const isDebitNormal = acc ? ['Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense'].includes(acc.account_type) : true;
      
      let obBase = Number(acc?.opening_balance || 0);
      let obDr = isDebitNormal ? obBase : 0;
      let obCr = isDebitNormal ? 0 : obBase;

      const validLines = [];
      for (const l of allLines) {
        const j = journalMap[l.journal_id];
        if (!j || !j.entry_date) continue;
        const date = j.entry_date.split('T')[0];
        
        if (date < filters.fromDate) {
          obDr += (l.debit_amount || 0);
          obCr += (l.credit_amount || 0);
        } else if (date >= filters.fromDate && date <= filters.toDate) {
          validLines.push({
            ...l,
            date,
            voucher_no: j.voucher_no || '',
            description: l.description || j.memo || ''
          });
        }
      }
      
      validLines.sort((a,b) => a.date.localeCompare(b.date));

      let netOb = isDebitNormal ? (obDr - obCr) : (obCr - obDr);
      const obIsDr = isDebitNormal ? netOb >= 0 : netOb < 0;
      netOb = Math.abs(netOb);

      let runningBal = isDebitNormal ? (obDr - obCr) : (obCr - obDr);

      const rows = validLines.map(l => {
        const dr = l.debit_amount || 0;
        const cr = l.credit_amount || 0;
        runningBal += isDebitNormal ? (dr - cr) : (cr - dr);
        return { ...l, dr, cr, bal: Math.abs(runningBal), balIsDr: isDebitNormal ? runningBal >= 0 : runningBal < 0 };
      });

      const cbIsDr = isDebitNormal ? runningBal >= 0 : runningBal < 0;

      setSummary({ ob: netOb, obIsDr, cb: Math.abs(runningBal), cbIsDr });
      setLines(rows);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [filters.accountId, filters.fromDate, filters.toDate, accounts]);

  const accPicker = (
    <div className="flex flex-col gap-1 min-w-[200px]">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Account</label>
      <select
        value={filters.accountId}
        onChange={e => setFilters(p => ({ ...p, accountId: e.target.value }))}
        className="h-8 rounded-md border border-input bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {accounts.map(a => <option key={a.id} value={a.id}>{a.account_name} ({a.account_code})</option>)}
      </select>
    </div>
  );

  const acc = accounts.find(a => a.id === filters.accountId);
  const title = `Detail General Ledger: ${acc ? acc.account_name : '...'}`;

  const tableRows = [
    // OB Row
    ['', '', 'Opening Balance', '', '', fmtNPR(summary.ob) + (summary.obIsDr ? ' Dr' : ' Cr')],
    ...lines.map(l => [
      l.date,
      l.voucher_no,
      l.description,
      fmtNPR(l.dr),
      fmtNPR(l.cr),
      fmtNPR(l.bal) + (l.balIsDr ? ' Dr' : ' Cr')
    ])
  ];

  const handleExport = () => downloadCSV('general_ledger_detail.csv',
    ['Date', 'Voucher #', 'Description', 'Debit', 'Credit', 'Balance'],
    tableRows
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
        <ReportTable title={title} fromDate={filters.fromDate} toDate={filters.toDate}
          headers={['Date', 'Voucher #', 'Description', 'Debit (NPR)', 'Credit (NPR)', 'Balance (NPR)']}
          rows={tableRows}
          footer={['', '', 'Closing Balance', fmtNPR(lines.reduce((s,l)=>s+l.dr,0)), fmtNPR(lines.reduce((s,l)=>s+l.cr,0)), fmtNPR(summary.cb) + (summary.cbIsDr ? ' Dr' : ' Cr')]}
          onExport={handleExport}
        />
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

      case 'customer_balance':
        return <PartnerReport title="Customer Receivable Summary" mode="ar" initialFromDate={fromDate} initialToDate={toDate} />;

      case 'vendor_balance':
        return <PartnerReport title="Supplier Payable Summary" mode="ap" initialFromDate={fromDate} initialToDate={toDate} />;

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
              rows={rows.map(r => [r.entry_date?.split('T')[0], r.voucher_no, r.memo, r.lines?.length || 0, fmtNPR(r.total_amount)])}
              onExport={() => downloadCSV('journal_report.csv', ['Date','Voucher #','Memo','Lines','Total Amount'], rows.map(r=>[r.entry_date?.split('T')[0], r.voucher_no, r.memo, r.lines?.length || 0, r.total_amount?.toFixed(2)]))}
            />
          )} />;

      case 'txn_list':
        return <SimpleReport title="Transaction List" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Transaction List" fromDate={fd} toDate={td}
              headers={['Date', 'Voucher #', 'Account', 'Description', 'Debit (NPR)', 'Credit (NPR)']}
              rows={rows.map(r => [r.entry_date, r.voucher_no, r.account_name, r.description || r.journal_memo, fmtNPR(r.debit_amount), fmtNPR(r.credit_amount)])}
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

      case 'ar_aging_summary':
        return <SimpleReport title="Customer Ageing Summary" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Customer Ageing Summary" fromDate={fd} toDate={td}
              headers={['Customer', 'Current', '1-30 Days', '31-60 Days', '60+ Days', 'Total (NPR)']}
              rows={rows.map(r => [r.customer, fmtNPR(r.current), fmtNPR(r['30d']), fmtNPR(r['60d']), fmtNPR(r['60d+']), fmtNPR(r.total)])}
              footer={['TOTAL', fmtNPR(rows.reduce((s,r)=>s+r.current,0)), fmtNPR(rows.reduce((s,r)=>s+r['30d'],0)), fmtNPR(rows.reduce((s,r)=>s+r['60d'],0)), fmtNPR(rows.reduce((s,r)=>s+r['60d+'],0)), fmtNPR(rows.reduce((s,r)=>s+r.total,0))]}
              onExport={() => downloadCSV('ar_aging_summary.csv',['Customer', 'Current', '1-30 Days', '31-60 Days', '60+ Days', 'Total'],rows.map(r=>[r.customer, r.current?.toFixed(2), r['30d']?.toFixed(2), r['60d']?.toFixed(2), r['60d+']?.toFixed(2), r.total?.toFixed(2)]))}
            />
          )} />;

      case 'ap_aging_summary':
        return <SimpleReport title="Supplier Ageing Summary" reportId={reportId} initialData={data} initialFromDate={fromDate} initialToDate={toDate}
          renderFn={(rows, fd, td) => (
            <ReportTable title="Supplier Ageing Summary" fromDate={fd} toDate={td}
              headers={['Supplier', 'Current', '1-30 Days', '31-60 Days', '60+ Days', 'Total (NPR)']}
              rows={rows.map(r => [r.vendor, fmtNPR(r.current), fmtNPR(r['30d']), fmtNPR(r['60d']), fmtNPR(r['60d+']), fmtNPR(r.total)])}
              footer={['TOTAL', fmtNPR(rows.reduce((s,r)=>s+r.current,0)), fmtNPR(rows.reduce((s,r)=>s+r['30d'],0)), fmtNPR(rows.reduce((s,r)=>s+r['60d'],0)), fmtNPR(rows.reduce((s,r)=>s+r['60d+'],0)), fmtNPR(rows.reduce((s,r)=>s+r.total,0))]}
              onExport={() => downloadCSV('ap_aging_summary.csv',['Supplier', 'Current', '1-30 Days', '31-60 Days', '60+ Days', 'Total'],rows.map(r=>[r.vendor, r.current?.toFixed(2), r['30d']?.toFixed(2), r['60d']?.toFixed(2), r['60d+']?.toFixed(2), r.total?.toFixed(2)]))}
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
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
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