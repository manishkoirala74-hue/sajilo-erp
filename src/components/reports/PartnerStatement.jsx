import { useState, useCallback, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adToBS } from '@/lib/nepaliDate';

const DEFAULT_FILTERS = {
  showZeroBalance: false,
  expandAll: false,
  showOpeningBalance: true,
  showClosingBalance: true,
  showTransactions: true,
};

function fmtNPR(n) {
  const num = Number(n || 0);
  return num === 0 ? '0.00' : num.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PartnerStatement({ title, mode, initialFromDate, initialToDate }) {
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate });
  const [partners, setPartners] = useState([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  
  const [company, setCompany] = useState(null);
  const [partner, setPartner] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({ opening: 0, debit: 0, credit: 0, closing: 0 });
  
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Print configuration toggles
  const [printConfig, setPrintConfig] = useState({
    showLogo: true,
    showCompanyAddress: true,
    showCompanyPan: true,
    showPartnerInfo: true,
    showSummary: true,
    showRemarks: true,
    dateFormat: 'AD',
  });

  const isAR = mode === 'ar';

  // Load partners list on mount
  useEffect(() => {
    async function loadPartners() {
      try {
        const list = await sajilo.entities.BusinessPartner.filter({ [isAR ? 'is_customer' : 'is_vendor']: true });
        setPartners(list.sort((a, b) => a.name.localeCompare(b.name)));
        if (list.length > 0) setSelectedPartnerId(list[0].id);
      } catch (err) {
        console.error("Error loading partners:", err);
      }
    }
    loadPartners();
  }, [isAR]);

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

      const subLedgerId = isAR ? p.receivable_account_id : p.payable_account_id;
      
      let glLines = [];
      if (subLedgerId) {
        glLines = await sajilo.entities.GeneralLedgerLine.filter({ account_id: subLedgerId }, '', 5000);
      } else {
        // Fallback: search by name in lines if no strict sub-ledger is attached
        const allLines = await sajilo.entities.GeneralLedgerLine.list('', 10000);
        glLines = allLines.filter(l => (l.description || '').toLowerCase().includes(p.name.toLowerCase()));
      }

      const journalMap = {};
      journals.forEach(j => { 
        journalMap[j.id] = { date: j.entry_date ? j.entry_date.split('T')[0] : '', voucher: j.voucher_number || '' }; 
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
            voucher: jInfo.voucher,
            reference: line.reference_number || '',
            description: line.description || '',
            debit: line.debit_amount || 0,
            credit: line.credit_amount || 0,
          });
        }
      }

      txns.sort((a, b) => a.date.localeCompare(b.date));

      const baseOb = Math.abs(p.opening_balance || 0);
      const isObDr = (p.opening_balance_type || 'Dr') === 'Dr';
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
      console.error(err);
    }
    setLoading(false);
  }, [selectedPartnerId, partners, isAR, filters.fromDate, filters.toDate]);

  const toggle = (key) => setPrintConfig(p => ({ ...p, [key]: !p[key] }));

  const displayDate = (adDateStr) => {
    if (!adDateStr) return '';
    if (printConfig.dateFormat === 'BS') {
      const bs = adToBS(adDateStr);
      if (bs) return `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`;
    }
    return adDateStr;
  };

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
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={printConfig.showLogo} onChange={() => toggle('showLogo')} /> Company Logo</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={printConfig.showCompanyAddress} onChange={() => toggle('showCompanyAddress')} /> Company Address</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={printConfig.showCompanyPan} onChange={() => toggle('showCompanyPan')} /> Company PAN/VAT</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={printConfig.showPartnerInfo} onChange={() => toggle('showPartnerInfo')} /> Partner Info</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={printConfig.showSummary} onChange={() => toggle('showSummary')} /> Summary Cards</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={printConfig.showRemarks} onChange={() => toggle('showRemarks')} /> Remarks Col</label>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Date Format</label>
          <Select value={printConfig.dateFormat || 'AD'} onValueChange={v => setPrintConfig(p => ({ ...p, dateFormat: v }))}>
            <SelectTrigger className="h-7 bg-card px-2 text-xs w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AD">AD</SelectItem>
              <SelectItem value="BS">BS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="report-no-print">
        <ReportFilterBar filters={filters} onChange={setFilters} onApply={load} showApplyButton extraOptions={extraOptions} />
      </div>

      {!hasLoaded ? (
        <div className="py-16 text-center space-y-3">
          <div className="text-4xl">📄</div>
          <p className="text-sm font-semibold text-foreground">Select a partner and date range, then click <span className="text-primary">Apply</span> to view statement.</p>
        </div>
      ) : loading ? (
        <div className="py-10 text-center text-muted-foreground text-sm">Loading statement...</div>
      ) : (
        <div className="bg-card border border-border shadow-sm p-8 sm:p-12 max-w-[210mm] mx-auto rounded-xl print:shadow-none print:border-none print:p-0 print:max-w-none text-foreground" style={{ fontFamily: "'Inter', sans-serif" }}>
          
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-primary/20 pb-6 mb-6">
            <div className="space-y-1.5">
              {printConfig.showLogo && company?.company_logo_url && (
                <img src={company.company_logo_url} alt="Logo" className="h-16 w-auto mb-3 object-contain" />
              )}
              <h1 className="text-2xl font-bold text-primary">{company?.company_name || 'Company Name'}</h1>
              {printConfig.showCompanyAddress && company?.address && <p className="text-sm text-slate-500">{company.address}</p>}
              {printConfig.showCompanyAddress && (company?.phone || company?.email) && (
                <p className="text-sm text-slate-500">{[company.phone, company.email].filter(Boolean).join(' | ')}</p>
              )}
              {printConfig.showCompanyPan && company?.tax_id && <p className="text-sm text-slate-500 font-mono">PAN: {company.tax_id}</p>}
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-light text-slate-300 uppercase tracking-widest">{isAR ? 'Customer Statement' : 'Vendor Statement'}</h2>
              <p className="text-sm font-semibold mt-2 text-muted-foreground">Period: <span className="font-normal">{displayDate(filters.fromDate)} to {displayDate(filters.toDate)}</span></p>
              <p className="text-sm font-semibold mt-1 text-muted-foreground">Generated: <span className="font-normal">{displayDate(new Date().toISOString().slice(0,10))}</span></p>
            </div>
          </div>

          {/* Partner Info */}
          {printConfig.showPartnerInfo && partner && (
            <div className="mb-8 p-5 bg-muted/50 rounded-lg border border-slate-100 flex justify-between items-start">
              <div className="flex gap-5 items-start">
                {partner.profile_picture_url && (
                  <img src={partner.profile_picture_url} alt="Profile" className="w-16 h-16 rounded-full object-cover border border-border" />
                )}
                <div className="space-y-1">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Statement To</p>
                  <p className="text-lg font-bold text-foreground">{partner.name}</p>
                  {partner.address && <p className="text-sm text-muted-foreground">{partner.address}</p>}
                  {partner.contact_person && <p className="text-sm text-muted-foreground">Attn: {partner.contact_person}</p>}
                </div>
              </div>
              <div className="text-right space-y-1">
                {partner.tax_id_number && <p className="text-sm text-muted-foreground"><span className="font-semibold text-slate-400 mr-2">PAN/VAT:</span>{partner.tax_id_number}</p>}
                {partner.phone && <p className="text-sm text-muted-foreground"><span className="font-semibold text-slate-400 mr-2">Phone:</span>{partner.phone}</p>}
                {partner.email && <p className="text-sm text-muted-foreground"><span className="font-semibold text-slate-400 mr-2">Email:</span>{partner.email}</p>}
              </div>
            </div>
          )}

          {/* Summary Cards */}
          {printConfig.showSummary && (
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="p-4 bg-card border border-border rounded-lg text-center">
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Opening Balance</p>
                <p className="text-lg font-bold font-mono text-muted-foreground">{fmtNPR(summary.opening)}</p>
              </div>
              <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 rounded-lg text-center">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400/70 uppercase mb-1">Total Debit</p>
                <p className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">{fmtNPR(summary.debit)}</p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 rounded-lg text-center">
                <p className="text-xs font-bold text-red-600 dark:text-red-400/70 uppercase mb-1">Total Credit</p>
                <p className="text-lg font-bold font-mono text-red-700 dark:text-red-400">{fmtNPR(summary.credit)}</p>
              </div>
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg text-center">
                <p className="text-xs font-bold text-primary/70 uppercase mb-1">Closing Balance</p>
                <p className="text-lg font-bold font-mono text-primary">{fmtNPR(summary.closing)}</p>
              </div>
            </div>
          )}

          {/* Transaction Table */}
          <div className="table-scroll-container">
            <table className="table-fluid-grid text-base text-left">
              <thead>
                <tr className="border-y-2 border-border bg-muted/50/50">
                  <th className="cell-density font-semibold text-slate-500 text-align-center">Date</th>
                  <th className="cell-density font-semibold text-slate-500 text-align-center">Voucher</th>
                  <th className="cell-density font-semibold text-slate-500 text-align-left w-1/3">Description</th>
                  <th className="cell-density font-semibold text-slate-500 amount-cell uppercase">Debit</th>
                  <th className="cell-density font-semibold text-slate-500 amount-cell uppercase">Credit</th>
                  <th className="cell-density font-semibold text-slate-500 amount-cell uppercase">Balance</th>
                  {printConfig.showRemarks && <th className="cell-density font-semibold text-slate-500 text-align-left">Remarks</th>}
                </tr>
              </thead>
            <tbody className="divide-y divide-slate-100">
              {/* Opening Balance Row */}
              <tr className="bg-muted/50/30">
                <td className="cell-density py-2.5 px-2 text-slate-400 italic">{displayDate(filters.fromDate)}</td>
                <td colSpan={2} className="cell-density py-2.5 px-2 font-semibold text-muted-foreground">*** Opening Balance ***</td>
                <td className="cell-density py-2.5 px-2 text-right"></td>
                <td className="cell-density py-2.5 px-2 text-right"></td>
                <td className="cell-density py-2.5 px-2 text-right font-bold tabular-nums font-mono">{fmtNPR(summary.opening)}</td>
                {printConfig.showRemarks && <td></td>}
              </tr>

              {/* Transactions */}
              {transactions.map((t, i) => (
                <tr key={i} className="hover:bg-muted/50/50">
                  <td className="cell-density py-2.5 px-2 whitespace-nowrap text-muted-foreground">{displayDate(t.date)}</td>
                  <td className="cell-density py-2.5 px-2 font-mono text-sm text-primary">{t.voucher}</td>
                  <td className="cell-density py-2.5 px-2 text-muted-foreground">{t.description} {t.reference && <span className="text-slate-400 text-xs ml-1">(Ref: {t.reference})</span>}</td>
                  <td className="cell-density py-2.5 px-2 text-right tabular-nums font-mono">{t.debit > 0 ? fmtNPR(t.debit) : ''}</td>
                  <td className="cell-density py-2.5 px-2 text-right tabular-nums font-mono">{t.credit > 0 ? fmtNPR(t.credit) : ''}</td>
                  <td className="cell-density py-2.5 px-2 text-right font-semibold tabular-nums font-mono">{fmtNPR(t.balance)}</td>
                  {printConfig.showRemarks && <td className="cell-density py-2.5 px-2 text-slate-400 text-xs line-clamp-1 border-b-0"></td>}
                </tr>
              ))}
              
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={printConfig.showRemarks ? 7 : 6} className="cell-density py-8 text-center text-slate-400 italic">No transactions found for this period.</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/50 font-bold">
                <td colSpan={3} className="cell-density py-3 px-2 text-muted-foreground text-right">Closing Balance as of {displayDate(filters.toDate)}:</td>
                <td className="cell-density py-3 px-2 text-right tabular-nums font-mono text-emerald-700 dark:text-emerald-400">{fmtNPR(summary.debit)}</td>
                <td className="cell-density py-3 px-2 text-right tabular-nums font-mono text-red-700 dark:text-red-400">{fmtNPR(summary.credit)}</td>
                <td className="cell-density py-3 px-2 text-right tabular-nums font-mono text-primary text-base">{fmtNPR(summary.closing)}</td>
                {printConfig.showRemarks && <td></td>}
              </tr>
            </tfoot>
          </table>
          </div>

          {/* Footer Note */}
          <div className="mt-12 pt-6 border-t border-border text-center text-sm text-slate-500 flex justify-between px-4 print:mt-auto">
            <p>This is a computer-generated document. No signature is required.</p>
            <p className="font-mono">Ref: {partner?.id?.slice(0,8).toUpperCase()}-{new Date().getTime().toString().slice(-6)}</p>
          </div>

        </div>
      )}
    </div>
  );
}
