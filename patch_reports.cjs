const fs = require('fs');

const path = 'src/components/reports/ReportViewer.jsx';
let code = fs.readFileSync(path, 'utf8');

// 1. We need to implement CashFlowReport
const cashFlowCode = `
function CashFlowReport({ initialFromDate, initialToDate }) {
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate });
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
        rows={data.details.map(d => [d.date, d.type, d.ref, d.desc, fmtNPR(d.amount)])}
        footer={['', '', '', 'NET CASH FLOW', fmtNPR(data.netCashFlow)]}
        onExport={() => {}}
      />
    </div>
  );
}
`;

// 2. We need PartnerSummaryReport for customer_balance, vendor_balance, ar_aging_summary, ap_aging_summary
const partnerSummaryCode = `
function PartnerSummaryReport({ title, mode, reportId, initialFromDate, initialToDate }) {
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate });
  const [data, setData] = useState([]);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
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
`;

// Insert the new components before PartnerReport
code = code.replace(/function PartnerReport\(/, cashFlowCode + '\n' + partnerSummaryCode + '\nfunction PartnerReport(');

// Update renderContent switch cases
const newCases = `
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
`;

code = code.replace(/case 'customer_balance':[\s\S]*?case 'vendor_balance':[\s\S]*?initialToDate={toDate} \/>;/, newCases);

fs.writeFileSync('.temp_report_viewer.jsx', code);
console.log('Done mapping components');
