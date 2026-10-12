import { useState, useCallback, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import BusinessHeader from '@/components/reports/BusinessHeader';
import ReportExportActions from '@/components/reports/ReportExportActions';
import { exportFlatXLSX } from '@/lib/reports/reportExcelExport';
import { generateReportVectorPDF } from '@/utils/reportPdfEngine';
import CommunicationModal from '@/components/shared/CommunicationModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adToBS, formatBS } from '@/lib/nepaliDate';
import VoucherLink from '@/components/shared/VoucherLink';
import { useDateFormat } from '@/lib/DateFormatContext';
import { useCachedFilters, useCachedState } from './ReportViewer';
import { useAmountFormatter } from '@/hooks/useAmountFormatter';
import { REPORT_TYPOGRAPHY, REPORT_COLORS, COLUMN_PRESETS } from '@/config/reportTheme';
import { Mail } from 'lucide-react';

const DEFAULT_FILTERS = {
  showZeroBalance: false,
  expandAll: false,
  showOpeningBalance: true,
  showClosingBalance: true,
  showTransactions: true,
  showBsDate: false,
};

const DEFAULT_PRINT_CONFIG = {
  showLogo: true,
  showCompanyAddress: true,
  showCompanyPan: true,
  showPartnerInfo: true,
  showSummary: true,
  showRemarks: true,
};

export default function PartnerStatement({ title, mode, initialFromDate, initialToDate }) {
  const { displayBsDate } = useDateFormat();
  const { formatNumber } = useAmountFormatter();
  const isAR = mode === 'ar';

  const fmtNPR = useCallback((n) => {
    const num = Number(n || 0);
    if (num === 0) return '0.00';
    const absNum = Math.abs(num);
    const formatted = formatNumber(absNum);
    return num < 0 ? `(${formatted})` : formatted;
  }, [formatNumber]);

  const [filters, setFilters] = useCachedFilters(
    `partner_statement_${mode}_filters`,
    { ...DEFAULT_FILTERS, showBsDate: displayBsDate, fromDate: initialFromDate, toDate: initialToDate }
  );
  const [partners, setPartners] = useCachedState(`partner_statement_${mode}_partners`, []);
  const [selectedPartnerId, setSelectedPartnerId] = useCachedState(`partner_statement_${mode}_selectedId`, '');
  const [printConfig, setPrintConfig] = useCachedState(`partner_statement_${mode}_printConfig`, DEFAULT_PRINT_CONFIG);

  const [company, setCompany] = useCachedState(`partner_statement_${mode}_company`, null);
  const [partner, setPartner] = useCachedState(`partner_statement_${mode}_partner`, null);
  const [transactions, setTransactions] = useCachedState(`partner_statement_${mode}_txns`, []);
  const [summary, setSummary] = useCachedState(`partner_statement_${mode}_summary`, { opening: 0, debit: 0, credit: 0, closing: 0 });

  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useCachedState(`partner_statement_${mode}_hasLoaded`, false);
  const [showCommModal, setShowCommModal] = useState(false);

  // Load partners list on mount
  useEffect(() => {
    async function loadPartners() {
      try {
        const list = await sajilo.entities.BusinessPartner.filter({ [isAR ? 'is_customer' : 'is_vendor']: true });
        setPartners(list.sort((a, b) => a.name.localeCompare(b.name)));
        if (list.length > 0 && !selectedPartnerId) {
          setSelectedPartnerId(list[0].id);
        }
      } catch (err) {
        console.error("Error loading partners:", err);
      }
    }
    loadPartners();
  }, [isAR, selectedPartnerId, setSelectedPartnerId, setPartners]);

  const load = useCallback(async () => {
    if (!selectedPartnerId) return;
    setHasLoaded(true);
    setLoading(true);

    try {
      const p = partners.find(x => x.id === selectedPartnerId);
      setPartner(p);

      const [settings, journals] = await Promise.all([
        sajilo.entities.CompanySettings.list(),
        sajilo.entities.GeneralLedgerJournal.filter({ status: 'Posted' }, 'entry_date', 10000)
      ]);
      
      let settingsData = null;
      if (settings.length > 0) {
        settingsData = settings[0];
      } else {
        const globalCompanies = await sajilo.entities.Company.list();
        if (globalCompanies.length > 0) {
          settingsData = {
            company_name: globalCompanies[0].name,
            company_logo_url: globalCompanies[0].logo_url,
            address: globalCompanies[0].address,
            phone: globalCompanies[0].phone,
            email: globalCompanies[0].email,
            tax_id: globalCompanies[0].tax_id
          };
        }
      }
      if (settingsData) setCompany(settingsData);

      const subLedgerId = isAR ? p?.receivable_account_id : p?.payable_account_id;
      
      let glLines = [];
      if (subLedgerId) {
        glLines = await sajilo.entities.GeneralLedgerLine.filter({ account_id: subLedgerId }, '', 5000);
      } else if (p?.name) {
        // Fallback: search by name in lines if no strict sub-ledger is attached
        const allLines = await sajilo.entities.GeneralLedgerLine.list('', 10000);
        glLines = allLines.filter(l => (l.description || '').toLowerCase().includes(p.name.toLowerCase()));
      }

      const journalMap = {};
      journals.forEach(j => { 
        const vNum = j.voucher_no || j.voucher_number || '';
        journalMap[j.id] = { 
          date: j.entry_date ? j.entry_date.split('T')[0] : '', 
          voucher: (vNum && vNum !== 'AUTO' && vNum !== 'REV-AUTO') ? vNum : (j.source_document_id || ''),
          description: j.description || ''
        }; 
      });

      let ob_dr = 0, ob_cr = 0;
      let cur_dr = 0, cur_cr = 0;
      const txns = [];

      for (const line of glLines) {
        const jInfo = journalMap[line.journal_id];
        if (!jInfo || !jInfo.date) continue;
        const date = jInfo.date;

        if (date < filters.fromDate) {
          ob_dr += (line.debit_amount || 0);
          ob_cr += (line.credit_amount || 0);
        } else if (date >= filters.fromDate && date <= filters.toDate) {
          cur_dr += (line.debit_amount || 0);
          cur_cr += (line.credit_amount || 0);
          txns.push({
            date: date,
            bs_date_formatted: adToBS(date) ? formatBS(adToBS(date)) : '',
            voucher: jInfo.voucher,
            reference: line.reference_number || '',
            description: line.description || jInfo.description || '',
            remarks: line.narration || line.remarks || (line.reference_number ? `Ref: ${line.reference_number}` : '') || '',
            debit: line.debit_amount || 0,
            credit: line.credit_amount || 0,
          });
        }
      }

      txns.sort((a, b) => a.date.localeCompare(b.date));

      const baseOb = Math.abs(p?.opening_balance || 0);
      const isObDr = (p?.opening_balance_type || 'Dr') === 'Dr';
      let base_ob_dr = isObDr ? baseOb : 0;
      let base_ob_cr = isObDr ? 0 : baseOb;

      let net_ob_dr = 0, net_ob_cr = 0;
      const net_ob = (base_ob_dr + ob_dr) - (base_ob_cr + ob_cr);
      if (isAR) {
        if (net_ob >= 0) net_ob_dr = net_ob; else net_ob_cr = -net_ob;
      } else {
        if (net_ob <= 0) net_ob_cr = -net_ob; else net_ob_dr = net_ob;
      }

      const openingBalance = isAR ? (net_ob_dr - net_ob_cr) : (net_ob_cr - net_ob_dr);
      
      let running = openingBalance;
      const finalTxns = txns.map(t => {
        const dr = t.debit;
        const cr = t.credit;
        if (isAR) {
          running = running + dr - cr;
        } else {
          running = running + cr - dr;
        }
        return { ...t, balance: running };
      });

      setTransactions(finalTxns);
      setSummary({
        opening: openingBalance,
        debit: cur_dr,
        credit: cur_cr,
        closing: running
      });

    } catch (err) {
      console.error("PartnerStatement load error:", err);
    }
    setLoading(false);
  }, [selectedPartnerId, partners, isAR, filters.fromDate, filters.toDate, setCompany, setHasLoaded, setPartner, setSummary, setTransactions]);

  const toggle = (key) => setPrintConfig(p => ({ ...p, [key]: !p[key] }));

  const displayDate = (adDateStr) => {
    if (!adDateStr) return '';
    const d = new Date(adDateStr);
    return isNaN(d) ? adDateStr : `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  };

  const reportTitle = `${isAR ? 'CUSTOMER STATEMENT' : 'SUPPLIER STATEMENT'}: ${(partner?.name || (isAR ? 'Customer' : 'Supplier')).toUpperCase()}`;

  const handleExportExcel = useCallback(async () => {
    if (!transactions) return;
    const pName = partner?.name || (isAR ? 'Customer' : 'Supplier');
    const headers = [
      'Date',
      ...(filters.showBsDate ? ['Date (BS)'] : []),
      'Voucher #',
      'Description',
      'Debit (NPR)',
      'Credit (NPR)',
      'Balance (NPR)',
      ...(printConfig.showRemarks ? ['Remarks'] : [])
    ];
    
    const rows = [
      [
        displayDate(filters.fromDate),
        ...(filters.showBsDate ? [adToBS(filters.fromDate) ? formatBS(adToBS(filters.fromDate)) : ''] : []),
        '',
        '*** Opening Balance ***',
        '',
        '',
        summary.opening,
        ...(printConfig.showRemarks ? [''] : [])
      ],
      ...transactions.map(t => [
        displayDate(t.date),
        ...(filters.showBsDate ? [t.bs_date_formatted || ''] : []),
        t.voucher || '',
        t.description + (t.reference ? ` (Ref: ${t.reference})` : ''),
        t.debit || '',
        t.credit || '',
        t.balance,
        ...(printConfig.showRemarks ? [t.remarks || ''] : [])
      ])
    ];

    const footer = [
      `Closing Balance as of ${displayDate(filters.toDate)}`,
      ...(filters.showBsDate ? [''] : []),
      '',
      '',
      summary.debit,
      summary.credit,
      summary.closing,
      ...(printConfig.showRemarks ? [''] : [])
    ];

    await exportFlatXLSX({
      filename: `${pName.replace(/\s+/g, '_')}_statement_${filters.fromDate}_${filters.toDate}.xlsx`,
      reportTitle,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      companyName: company?.company_name || 'Sajilo ERP',
      headers,
      rows,
      footer,
    });
  }, [transactions, partner, isAR, filters, summary, company, printConfig.showRemarks, reportTitle]);

  const handleExportPdf = useCallback(async () => {
    if (!transactions) return;
    const pName = partner?.name || (isAR ? 'Customer' : 'Supplier');
    const headers = [
      'Date',
      ...(filters.showBsDate ? ['Date (BS)'] : []),
      'Voucher #',
      'Description',
      'Debit (NPR)',
      'Credit (NPR)',
      'Balance (NPR)',
      ...(printConfig.showRemarks ? ['Remarks'] : [])
    ];

    const pdfRows = [
      [
        displayDate(filters.fromDate),
        ...(filters.showBsDate ? [adToBS(filters.fromDate) ? formatBS(adToBS(filters.fromDate)) : '—'] : []),
        '—',
        '*** Opening Balance ***',
        '—',
        '—',
        fmtNPR(summary.opening),
        ...(printConfig.showRemarks ? ['—'] : [])
      ],
      ...transactions.map(t => [
        displayDate(t.date),
        ...(filters.showBsDate ? [t.bs_date_formatted || '—'] : []),
        t.voucher || '—',
        t.description + (t.reference ? ` (Ref: ${t.reference})` : ''),
        t.debit > 0 ? fmtNPR(t.debit) : '—',
        t.credit > 0 ? fmtNPR(t.credit) : '—',
        fmtNPR(t.balance),
        ...(printConfig.showRemarks ? [t.remarks || '—'] : [])
      ])
    ];

    const pdfFooter = [
      'Closing Balance',
      ...(filters.showBsDate ? [''] : []),
      '',
      '',
      fmtNPR(summary.debit),
      fmtNPR(summary.credit),
      fmtNPR(summary.closing),
      ...(printConfig.showRemarks ? [''] : [])
    ];

    await generateReportVectorPDF({
      title: reportTitle,
      subtitle: partner?.address ? `Party: ${partner.name} | Address: ${partner.address}` : `Party: ${partner?.name || ''}`,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      columns: headers,
      data: pdfRows,
      footer: pdfFooter,
      orientation: 'landscape',
      filename: `${pName.replace(/\s+/g, '_')}_statement_${filters.fromDate}_${filters.toDate}.pdf`,
      companyConfig: {
        ...company,
        company_logo_url: printConfig.showLogo ? company?.company_logo_url : null,
        address: printConfig.showCompanyAddress ? company?.address : null,
        tax_id: printConfig.showCompanyPan ? company?.tax_id : null,
      }
    });
  }, [transactions, partner, isAR, filters, summary, company, printConfig, reportTitle, fmtNPR]);

  const extraOptions = (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 min-w-[200px]">
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Select {isAR ? 'Customer' : 'Supplier'}</label>
        <Select value={selectedPartnerId || undefined} onValueChange={setSelectedPartnerId}>
          <SelectTrigger className="h-8 bg-card px-2 text-xs">
            <SelectValue placeholder={`Select ${isAR ? 'Customer' : 'Supplier'}`} />
          </SelectTrigger>
          <SelectContent>
            {partners.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="pt-2 border-t border-border">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Print Options</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <input type="checkbox" className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5" checked={printConfig.showLogo} onChange={() => toggle('showLogo')} />
            Company Logo
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <input type="checkbox" className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5" checked={printConfig.showCompanyAddress} onChange={() => toggle('showCompanyAddress')} />
            Company Address
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <input type="checkbox" className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5" checked={printConfig.showCompanyPan} onChange={() => toggle('showCompanyPan')} />
            Company PAN/VAT
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <input type="checkbox" className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5" checked={printConfig.showPartnerInfo} onChange={() => toggle('showPartnerInfo')} />
            Partner Info
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <input type="checkbox" className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5" checked={printConfig.showSummary} onChange={() => toggle('showSummary')} />
            Summary Cards
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground">
            <input type="checkbox" className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5" checked={printConfig.showRemarks} onChange={() => toggle('showRemarks')} />
            Remarks Col
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <ReportFilterBar
          filters={filters}
          onChange={setFilters}
          onApply={load}
          showApplyButton
          extraOptions={extraOptions}
        />
      </div>

      {!hasLoaded ? (
        <div className="py-16 text-center space-y-3">
          <div className="text-4xl">📄</div>
          <p className="text-sm font-semibold text-foreground">
            Select a {isAR ? 'customer' : 'supplier'} and date range, then click <span className="text-primary">Apply</span> to view statement.
          </p>
        </div>
      ) : loading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading statement…</div>
      ) : (
        <div className="space-y-3">
          {/* Branded Business Header with Dual B.S./A.D. dates */}
          <BusinessHeader
            reportTitle={reportTitle}
            fromDate={filters.fromDate}
            toDate={filters.toDate}
            subtitle={partner?.address ? `Party: ${partner.name} | ${partner.address}` : `Party: ${partner?.name || ''}`}
            showLogo={printConfig.showLogo}
            showCompanyAddress={printConfig.showCompanyAddress}
            showCompanyPan={printConfig.showCompanyPan}
          />

          {/* Action Toolbar — Matches Detail General Ledger */}
          <div className="flex justify-end gap-2 items-center print:hidden mb-2">
            <button
              onClick={() => setShowCommModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-blue-300 dark:border-blue-500/30 rounded-lg bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 transition-colors shadow-xs"
            >
              <Mail className="w-3.5 h-3.5" /> Email Statement
            </button>
            <ReportExportActions
              onExportExcel={handleExportExcel}
              onExportPdf={handleExportPdf}
            />
          </div>

          {/* Partner Info Details Block (Controlled by showPartnerInfo) */}
          {printConfig.showPartnerInfo && partner && (
            <div className="p-4 bg-muted/40 border border-border rounded-xl flex flex-col sm:flex-row justify-between items-start gap-4 mb-3 text-xs print:break-inside-avoid">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Statement To</span>
                <h3 className="text-base font-bold text-foreground">{partner.name}</h3>
                {partner.address && <p className="text-muted-foreground">{partner.address}</p>}
                {partner.contact_person && <p className="text-muted-foreground">Attn: {partner.contact_person}</p>}
              </div>
              <div className="text-left sm:text-right space-y-1">
                {partner.tax_id_number && (
                  <p className="text-muted-foreground">
                    <span className="font-semibold text-foreground/80 mr-1.5">PAN/VAT:</span>
                    <span className="font-mono">{partner.tax_id_number}</span>
                  </p>
                )}
                {partner.phone && (
                  <p className="text-muted-foreground">
                    <span className="font-semibold text-foreground/80 mr-1.5">Phone:</span>
                    <span>{partner.phone}</span>
                  </p>
                )}
                {partner.email && (
                  <p className="text-muted-foreground">
                    <span className="font-semibold text-foreground/80 mr-1.5">Email:</span>
                    <span>{partner.email}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Summary Cards (Controlled by showSummary) */}
          {printConfig.showSummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 print:break-inside-avoid">
              <div className="p-3 bg-card border border-border rounded-xl text-center shadow-xs">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Opening Balance</p>
                <p className="text-base sm:text-lg font-bold font-mono tabular-nums text-foreground">{fmtNPR(summary.opening)}</p>
              </div>
              <div className="p-3 bg-card border border-border rounded-xl text-center shadow-xs">
                <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Total Debit</p>
                <p className="text-base sm:text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{fmtNPR(summary.debit)}</p>
              </div>
              <div className="p-3 bg-card border border-border rounded-xl text-center shadow-xs">
                <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-1">Total Credit</p>
                <p className="text-base sm:text-lg font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">{fmtNPR(summary.credit)}</p>
              </div>
              <div className="p-3 bg-card border border-border rounded-xl text-center shadow-xs">
                <p className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-1">Closing Balance</p>
                <p className="text-base sm:text-lg font-bold font-mono tabular-nums text-primary">{fmtNPR(summary.closing)}</p>
              </div>
            </div>
          )}

          {/* Standard Data Table */}
          <div className="border border-border rounded-xl overflow-hidden shadow-xs print:border-0 print:rounded-none">
            <div className="table-scroll-container overflow-x-auto" tabIndex={0} role="region" aria-label="Statement data">
              <table className="w-full text-sm border-collapse print:text-[10pt]">
                <thead className={`${REPORT_COLORS.headerBg} ${REPORT_COLORS.headerBorder} sticky top-0 z-10 shadow-xs`}>
                  <tr>
                    <th scope="col" className={`cell-density ${REPORT_TYPOGRAPHY.tableHead} text-center`} style={{ width: COLUMN_PRESETS.date.width }}>
                      DATE
                    </th>
                    {filters.showBsDate && (
                      <th scope="col" className={`cell-density ${REPORT_TYPOGRAPHY.tableHead} text-center`} style={{ width: COLUMN_PRESETS.date.width }}>
                        DATE (BS)
                      </th>
                    )}
                    <th scope="col" className={`cell-density ${REPORT_TYPOGRAPHY.tableHead} text-center`} style={{ width: COLUMN_PRESETS.voucher.width }}>
                      VOUCHER #
                    </th>
                    <th scope="col" className={`cell-density ${REPORT_TYPOGRAPHY.tableHead} text-left`} style={{ minWidth: COLUMN_PRESETS.description.minWidth }}>
                      DESCRIPTION
                    </th>
                    <th scope="col" className={`cell-density ${REPORT_TYPOGRAPHY.tableHead} text-right`} style={{ width: COLUMN_PRESETS.amount.width }}>
                      DEBIT (NPR)
                    </th>
                    <th scope="col" className={`cell-density ${REPORT_TYPOGRAPHY.tableHead} text-right`} style={{ width: COLUMN_PRESETS.amount.width }}>
                      CREDIT (NPR)
                    </th>
                    <th scope="col" className={`cell-density ${REPORT_TYPOGRAPHY.tableHead} text-right`} style={{ width: COLUMN_PRESETS.amount.width }}>
                      BALANCE (NPR)
                    </th>
                    {printConfig.showRemarks && (
                      <th scope="col" className={`cell-density ${REPORT_TYPOGRAPHY.tableHead} text-left`} style={{ width: '160px' }}>
                        REMARKS
                      </th>
                    )}
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {/* Opening Balance Row */}
                  <tr className="bg-muted/30 font-medium print:break-inside-avoid print:bg-white print:text-black">
                    <td className="cell-density text-center font-mono text-xs text-muted-foreground">
                      {displayDate(filters.fromDate)}
                    </td>
                    {filters.showBsDate && (
                      <td className="cell-density text-center font-mono text-xs text-muted-foreground">
                        {adToBS(filters.fromDate) ? formatBS(adToBS(filters.fromDate)) : '—'}
                      </td>
                    )}
                    <td className="cell-density text-center font-mono text-xs text-muted-foreground">—</td>
                    <td className="cell-density text-left font-semibold text-muted-foreground">
                      *** Opening Balance ***
                    </td>
                    <td className="cell-density text-right text-muted-foreground/60 font-mono text-xs">—</td>
                    <td className="cell-density text-right text-muted-foreground/60 font-mono text-xs">—</td>
                    <td className={`cell-density text-right font-mono text-xs font-bold ${summary.opening < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>
                      {fmtNPR(summary.opening)}
                    </td>
                    {printConfig.showRemarks && (
                      <td className="cell-density text-left text-muted-foreground/60 text-xs">—</td>
                    )}
                  </tr>

                  {/* Transaction Rows */}
                  {transactions.map((t, i) => (
                    <tr
                      key={i}
                      className="hover:bg-muted/20 print:hover:bg-transparent print:break-inside-avoid print:bg-white print:text-black transition-colors"
                    >
                      <td className="cell-density text-center font-mono text-xs text-foreground/80">
                        {displayDate(t.date)}
                      </td>
                      {filters.showBsDate && (
                        <td className="cell-density text-center font-mono text-xs text-muted-foreground">
                          {t.bs_date_formatted || '—'}
                        </td>
                      )}
                      <td className="cell-density text-center">
                        <VoucherLink voucherNumber={t.voucher}>
                          <span className="font-mono text-xs text-primary font-medium hover:underline cursor-pointer">
                            {t.voucher || '—'}
                          </span>
                        </VoucherLink>
                      </td>
                      <td className="cell-density text-left text-foreground font-medium">
                        {t.description}
                        {t.reference && (
                          <span className="text-muted-foreground text-xs ml-1.5 font-normal">
                            (Ref: {t.reference})
                          </span>
                        )}
                      </td>
                      <td className="cell-density text-right font-mono text-xs tabular-nums text-foreground">
                        {t.debit > 0 ? fmtNPR(t.debit) : '—'}
                      </td>
                      <td className="cell-density text-right font-mono text-xs tabular-nums text-foreground">
                        {t.credit > 0 ? fmtNPR(t.credit) : '—'}
                      </td>
                      <td className={`cell-density text-right font-mono text-xs font-semibold tabular-nums ${t.balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>
                        {fmtNPR(t.balance)}
                      </td>
                      {printConfig.showRemarks && (
                        <td className="cell-density text-left text-xs text-muted-foreground">
                          {t.remarks || '—'}
                        </td>
                      )}
                    </tr>
                  ))}

                  {transactions.length === 0 && (
                    <tr>
                      <td
                        colSpan={filters.showBsDate ? (printConfig.showRemarks ? 8 : 7) : (printConfig.showRemarks ? 7 : 6)}
                        className="cell-density py-10 text-center text-muted-foreground italic text-xs"
                      >
                        No transactions found for the selected period.
                      </td>
                    </tr>
                  )}
                </tbody>

                <tfoot className={REPORT_TYPOGRAPHY.tableFooter}>
                  <tr className="print:break-inside-avoid print:bg-white print:text-black">
                    <td className="cell-density text-center font-mono text-xs">
                      {displayDate(filters.toDate)}
                    </td>
                    {filters.showBsDate && <td className="cell-density text-center font-mono text-xs">—</td>}
                    <td className="cell-density text-center font-mono text-xs">—</td>
                    <td className="cell-density text-left font-bold uppercase tracking-wider text-xs">
                      Closing Balance as of {displayDate(filters.toDate)}
                    </td>
                    <td className="cell-density text-right font-mono text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {fmtNPR(summary.debit)}
                    </td>
                    <td className="cell-density text-right font-mono text-xs font-bold tabular-nums text-rose-600 dark:text-rose-400">
                      {fmtNPR(summary.credit)}
                    </td>
                    <td className="cell-density text-right font-mono text-xs font-bold tabular-nums text-primary text-sm">
                      {fmtNPR(summary.closing)}
                    </td>
                    {printConfig.showRemarks && <td className="cell-density text-center">—</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Computer Generated Footer Note */}
          <div className="mt-6 pt-3 border-t border-border text-xs text-muted-foreground flex justify-between px-2 print:mt-auto">
            <p>This is a computer-generated document. No signature is required.</p>
            <p className="font-mono">Ref: {partner?.id ? partner.id.slice(0, 8).toUpperCase() : 'STMT'}-{new Date().getTime().toString().slice(-6)}</p>
          </div>

          {/* Email Communication Modal */}
          {partner && (
            <CommunicationModal
              open={showCommModal}
              onOpenChange={setShowCommModal}
              module={isAR ? 'Sales' : 'Purchase'}
              referenceId={selectedPartnerId}
              partnerId={selectedPartnerId}
              companyId={company?.id || sajilo.getCompanyId()}
              payload={{
                reportTitle,
                fromDate: filters.fromDate,
                toDate: filters.toDate,
                partnerName: partner.name,
                closingBalance: fmtNPR(summary.closing),
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
