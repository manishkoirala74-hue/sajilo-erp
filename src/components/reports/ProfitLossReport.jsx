import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, Loader2 } from 'lucide-react';
import BusinessHeader from '@/components/reports/BusinessHeader';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { useAmountFormatter } from '@/hooks/useAmountFormatter';
import { useCachedFilters, useCachedState, DEFAULT_FILTERS, useFmtNPR } from '@/components/reports/ReportViewer'; 
import { exportFlatXLSX } from '@/lib/reports/reportExcelExport';
import { generateReportVectorPDF } from '@/utils/reportPdfEngine';
import { mapProfitLossForExport } from '@/utils/exportMappers';
import { useAuth } from '@/lib/AuthContext';

export default function ProfitLossReport({ initialData, initialFromDate, initialToDate }) {
  const { formatNumber } = useAmountFormatter();
  const [filters,   setFilters]   = useCachedFilters('profit_loss', { ...DEFAULT_FILTERS, fromDate: initialFromDate, toDate: initialToDate, expandAll: true });
  const [data,      setData]      = useCachedState('profit_loss_data', initialData);
  const [loading,   setLoading]   = useState(false);
  const [hasLoaded, setHasLoaded] = useCachedState('profit_loss_hasLoaded', !!initialData);
  const [expanded,  setExpanded]  = useState({});
  const [isExporting, setIsExporting] = useState(false);
  const { user, activeCompany } = useAuth();

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
      cogs: { accounts: [], cur: 0, comp: 0 },
      opex_admin: { accounts: [], cur: 0, comp: 0 },
      opex_selling: { accounts: [], cur: 0, comp: 0 },
      non_op_income: { accounts: [], cur: 0, comp: 0 },
      finance_cost: { accounts: [], cur: 0, comp: 0 },
      tax: { accounts: [], cur: 0, comp: 0 },
      suspense: { accounts: [], cur: 0, comp: 0 }
    };

    accounts.forEach(a => {
      if (!a.parent_account_id) {
        switch (a.statement_group) {
          case 'Revenue':
            if (a.statement_subgroup === 'Sales Returns' || a.statement_subgroup === 'Sales Discounts') {
              sections.sales_returns.accounts.push(a);
            } else {
              sections.revenue.accounts.push(a);
            }
            break;
          case 'Cost of Goods Sold':
            sections.cogs.accounts.push(a);
            break;
          case 'Operating Expenses':
            if (a.statement_subgroup === 'Selling Expenses') {
              sections.opex_selling.accounts.push(a);
            } else {
              sections.opex_admin.accounts.push(a);
            }
            break;
          case 'Non-Operating Income':
            sections.non_op_income.accounts.push(a);
            break;
          case 'Finance Costs':
            sections.finance_cost.accounts.push(a);
            break;
          case 'Taxes':
            sections.tax.accounts.push(a);
            break;
          default:
            sections.suspense.accounts.push(a);
            break;
        }
      }
    });

    Object.values(sections).forEach(s => {
      s.accounts.forEach(a => rollup(a));
      s.cur = s.accounts.reduce((sum, a) => sum + a.rollup_current, 0);
      s.comp = s.accounts.reduce((sum, a) => sum + a.rollup_comparative, 0);
    });

    // Net Sales = Revenue (positive) + Sales Returns (naturally negative, handled by normal balance)
    const net_sales_cur = sections.revenue.cur + sections.sales_returns.cur;
    const net_sales_comp = sections.revenue.comp + sections.sales_returns.comp;
    
    // Total COGS = simply the sum of COGS accounts (perpetual inventory)
    const cogs_total_cur = sections.cogs.cur;
    const cogs_total_comp = sections.cogs.comp;

    const gross_profit_cur = net_sales_cur - cogs_total_cur;
    const gross_profit_comp = net_sales_comp - cogs_total_comp;

    const total_opex_cur = sections.opex_admin.cur + sections.opex_selling.cur;
    const total_opex_comp = sections.opex_admin.comp + sections.opex_selling.comp;
    const op_profit_cur = gross_profit_cur - total_opex_cur;
    const op_profit_comp = gross_profit_comp - total_opex_comp;

    // We add non-op income and subtract finance costs
    // Assuming non_op_income normal balance is credit (positive value returned by RPC)
    // Assuming finance_cost normal balance is debit (positive value returned by RPC)
    const pbt_cur = op_profit_cur + sections.non_op_income.cur - sections.finance_cost.cur;
    const pbt_comp = op_profit_comp + sections.non_op_income.comp - sections.finance_cost.comp;

    // Assuming tax normal balance is debit (positive value returned by RPC)
    const net_profit_cur = pbt_cur - sections.tax.cur;
    const net_profit_comp = pbt_comp - sections.tax.comp;


    const fmtAcct = (amount, isDeduction = false) => {
      if (!amount || amount === 0) return '—';
      const val = formatNumber(Math.abs(amount));
      return (amount < 0 || isDeduction) ? `(${val})` : val;
    };

    const renderTree = (account, level = 0, isDeduction = false) => {
      const children = childrenMap[account.id] || [];
      const isGroup = account.ledger_type === 'Group Ledger' || children.length > 0;
      const isExpanded = expanded[account.id] !== undefined ? expanded[account.id] : filters.expandAll;

      if (!filters.showZeroBalance && Math.abs(account.rollup_current) < 0.01 && Math.abs(account.rollup_comparative) < 0.01) return null;

      return (
        <React.Fragment key={account.id}>
          <tr className={`hover:bg-muted/20 print:hover:bg-transparent print:break-inside-avoid print:bg-white print:text-black ${isGroup ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
            <td className='px-3 py-1.5 border-none sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' style={{ paddingLeft: `${16 + level * 20}px` }}>
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
              <td className='px-3 py-2 font-semibold text-foreground bg-muted/50 sticky left-0 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]' colSpan={4}>{title}</td>
            </tr>
          )}
          {accounts.map(a => renderTree(a, 0, isDeduction))}
        </React.Fragment>
      );
    };

    const KPICard = ({ title, amount, percentage }) => (
      <div className='bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col justify-between print:hidden'>
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

        const handlePrintPdf = async () => {
      setIsExporting(true);
      try {
        const pdfRows = mapProfitLossForExport(data, {
          filters,
          expanded,
          childrenMap,
          sections,
          totals: {
            net_sales_cur, net_sales_comp,
            gross_profit_cur, gross_profit_comp,
            op_profit_cur, op_profit_comp,
            pbt_cur, pbt_comp,
            net_profit_cur, net_profit_comp
          },
          fmtAcct
        });

        await generateReportVectorPDF({
          title: 'INCOME STATEMENT',
          subtitle: 'Profit & Loss',
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          columns: ['Financial Particulars', 'Notes', 'Current Period (NPR)', 'Comparative Period (NPR)'],
          data: pdfRows,
          filename: 'Income_Statement.pdf',
          user,
          companyConfig: activeCompany,
          columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 40, halign: 'center' },
            2: { cellWidth: 80, halign: 'right' },
            3: { cellWidth: 80, halign: 'right' }
          }
        });
      } catch (err) {
        console.error("PDF generation error:", err);
        alert("Failed to generate PDF: " + err.message);
      } finally {
        setIsExporting(false);
      }
    };;

    return (
      <div className='space-y-4'>
        <div className='print:hidden'>
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
        <div className='grid grid-cols-4 gap-4 print:hidden'>
          <KPICard title='Net Sales Revenue' amount={net_sales_cur} />
          <KPICard title='Gross Profit' amount={gross_profit_cur} percentage={net_sales_cur ? ((gross_profit_cur / net_sales_cur)*100).toFixed(1) : 0} />
          <KPICard title='Operating Profit' amount={op_profit_cur} percentage={net_sales_cur ? ((op_profit_cur / net_sales_cur)*100).toFixed(1) : 0} />
          <KPICard title='Net Profit' amount={net_profit_cur} percentage={net_sales_cur ? ((net_profit_cur / net_sales_cur)*100).toFixed(1) : 0} />
        </div>

        <div className='bg-card border border-border rounded-xl shadow-sm overflow-hidden p-6 print:p-0 print:border-none print:shadow-none'>
          <BusinessHeader reportTitle='INCOME STATEMENT' subtitle='(Profit & Loss Statement)' fromDate={filters.fromDate} toDate={filters.toDate} />
          
          <div className='print:hidden flex justify-end gap-2 mb-6'>
            <Button variant='outline' size='sm' onClick={() => setFilters(f => ({ ...f, expandAll: !f.expandAll }))}>
              {filters.expandAll ? 'Collapse All' : 'Expand All'}
            </Button>
            <Button variant='outline' size='sm' onClick={handlePrintPdf} disabled={isExporting}>
              {isExporting ? <Loader2 className='w-4 h-4 mr-2 animate-spin' /> : <Printer className='w-4 h-4 mr-2' />} 
              {isExporting ? 'Generating...' : 'Print / PDF'}
            </Button>
            <Button variant='outline' size='sm' onClick={handleExport}>
              ↓ Export Excel
            </Button>
          </div>

          <div className="table-scroll-container">
            <table className="table-fluid-grid text-sm">
              <thead>
                <tr className='border-b border-border'>
                  <th className='px-3 py-2 text-left font-semibold text-foreground w-[50%] sticky left-0 bg-slate-100 dark:bg-[#1e293b] z-20 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Financial Particulars</th>
                  <th className='px-3 py-2 text-center font-semibold text-foreground w-[10%]'>Notes</th>
                  <th className='px-3 py-2 text-right font-semibold text-foreground w-[20%]'>Current Period<br/><span className='text-xs text-slate-500 font-normal'>NPR</span></th>
                  <th className='px-3 py-2 text-right font-semibold text-foreground w-[20%]'>Comparative<br/><span className='text-xs text-slate-500 font-normal'>NPR</span></th>
                </tr>
              </thead>
              
              <tbody className='divide-y divide-slate-100'>
                <tr className='bg-slate-100 dark:bg-slate-500/20'><td colSpan={4} className='px-3 py-2 font-bold text-foreground sticky left-0 bg-slate-100 dark:bg-[#1e293b] z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>1. Gross Operating Revenue</td></tr>
                
                <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Sales Revenue</td></tr>
                <PLSection sectionObj={sections.revenue} />
                
                {sections.sales_returns.accounts.length > 0 && (
                  <>
                    <tr><td colSpan={4} className='px-3 py-1.5 font-medium italic text-muted-foreground pl-4 sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Less: Sales Returns & Allowances</td></tr>
                    <PLSection sectionObj={sections.sales_returns} isDeduction={true} />
                  </>
                )}
                
                <tr className='border-t border-border bg-muted/50'>
                  <td className='px-3 py-2 font-bold text-foreground text-right sticky left-0 bg-slate-100 dark:bg-[#1e293b] z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Net Sales Revenue</td>
                  <td></td>
                  <td className='px-3 py-2 font-bold text-right tabular-nums'>{fmtAcct(net_sales_cur)}</td>
                  <td className='px-3 py-2 font-bold text-right tabular-nums text-muted-foreground'>{fmtAcct(net_sales_comp)}</td>
                </tr>

                <tr><td colSpan={4} className='px-3 py-2 font-bold text-foreground pt-4 sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>2. Cost of Goods Sold (COGS)</td></tr>
                
                <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-2 sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Direct Expenses</td></tr>
                {sections.cogs.accounts.length > 0 ? (
                  <PLSection sectionObj={sections.cogs} />
                ) : (
                  <tr className='text-slate-500'><td className='px-3 py-1.5 pl-8 border-none italic sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>(No direct expenses recorded)</td><td colSpan={3} className='border-none'></td></tr>
                )}

                <tr className='border-t border-border bg-muted/50'>
                  <td className='px-3 py-2 font-bold text-foreground text-right sticky left-0 bg-slate-100 dark:bg-[#1e293b] z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Total Cost of Goods Sold</td>
                  <td></td>
                  <td className='px-3 py-2 font-bold text-right tabular-nums'>{fmtAcct(cogs_total_cur, true)}</td>
                  <td className='px-3 py-2 font-bold text-right tabular-nums text-muted-foreground'>{fmtAcct(cogs_total_comp, true)}</td>
                </tr>
                
                <tr className='border-t border-border bg-indigo-50 dark:bg-indigo-500/10/50'>
                  <td className='px-3 py-3 font-bold text-indigo-900 text-right uppercase tracking-wider sticky left-0 bg-indigo-50 dark:bg-[#1e1b4b] z-10 border-r border-indigo-200 dark:border-indigo-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Gross Profit</td>
                  <td></td>
                  <td className='px-3 py-3 font-bold text-right tabular-nums text-indigo-900 text-base border-double border-b-4 border-indigo-200 dark:border-indigo-500/20'>{fmtAcct(gross_profit_cur)}</td>
                  <td className='px-3 py-3 font-bold text-right tabular-nums text-indigo-700 dark:text-indigo-400 text-base border-double border-b-4 border-indigo-100'>{fmtAcct(gross_profit_comp)}</td>
                </tr>

                <tr><td colSpan={4} className='px-3 py-2 font-bold text-foreground pt-6 sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>3. Operating Expenses</td></tr>
                
                {sections.opex_selling.accounts.length > 0 && (
                  <>
                    <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-3 sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Selling & Distribution Expenses</td></tr>
                    <PLSection sectionObj={sections.opex_selling} isDeduction={true} />
                  </>
                )}
                
                {sections.opex_admin.accounts.length > 0 && (
                  <>
                    <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-3 sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>General & Administrative Expenses</td></tr>
                    <PLSection sectionObj={sections.opex_admin} isDeduction={true} />
                  </>
                )}

                <tr className='border-t border-border bg-muted/50'>
                  <td className='px-3 py-2 font-bold text-foreground text-right sticky left-0 bg-slate-100 dark:bg-[#1e293b] z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Total Operating Expenses</td>
                  <td></td>
                  <td className='px-3 py-2 font-bold text-right tabular-nums text-red-600 dark:text-red-400'>{fmtAcct(total_opex_cur, true)}</td>
                  <td className='px-3 py-2 font-bold text-right tabular-nums text-red-400'>{fmtAcct(total_opex_comp, true)}</td>
                </tr>

                <tr className='border-t border-border bg-emerald-50 dark:bg-emerald-500/10/50'>
                  <td className='px-3 py-3 font-bold text-emerald-900 text-right uppercase tracking-wider sticky left-0 bg-emerald-50 dark:bg-[#064e3b] z-10 border-r border-emerald-200 dark:border-emerald-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Operating Profit (EBIT)</td>
                  <td></td>
                  <td className='px-3 py-3 font-bold text-right tabular-nums text-emerald-900 text-base'>{fmtAcct(op_profit_cur)}</td>
                  <td className='px-3 py-3 font-bold text-right tabular-nums text-emerald-700 dark:text-emerald-400 text-base'>{fmtAcct(op_profit_comp)}</td>
                </tr>

                {(sections.non_op_income.accounts.length > 0 || sections.finance_cost.accounts.length > 0) && (
                  <tr><td colSpan={4} className='px-3 py-2 font-bold text-foreground pt-6 sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>4. Non-Operating Income & Expenses</td></tr>
                )}
                
                {sections.non_op_income.accounts.length > 0 && (
                  <>
                    <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-3 sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Add: Other Income</td></tr>
                    <PLSection sectionObj={sections.non_op_income} />
                  </>
                )}

                {sections.finance_cost.accounts.length > 0 && (
                  <>
                    <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-3 sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Less: Finance Costs</td></tr>
                    <PLSection sectionObj={sections.finance_cost} isDeduction={true} />
                  </>
                )}

                <tr className='border-t border-border'>
                  <td className='px-3 py-3 font-bold text-foreground text-right uppercase tracking-wider sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Net Profit Before Tax</td>
                  <td></td>
                  <td className='px-3 py-3 font-bold text-right tabular-nums text-foreground text-base'>{fmtAcct(pbt_cur)}</td>
                  <td className='px-3 py-3 font-bold text-right tabular-nums text-muted-foreground text-base'>{fmtAcct(pbt_comp)}</td>
                </tr>

                <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-muted-foreground pl-4 pt-3 sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Less: Provision for Corporate Income Tax</td></tr>
                <PLSection sectionObj={sections.tax} isDeduction={true} />
                
                <tr className='border-t border-slate-800 bg-muted/50 print:border-t-2'>
                  <td className='px-3 py-4 font-black text-foreground text-right uppercase tracking-widest text-base sticky left-0 bg-slate-100 dark:bg-[#1e293b] z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>Net Income For The Period</td>
                  <td></td>
                  <td className='px-3 py-4 font-black text-right tabular-nums text-foreground text-lg border-double border-b-4 border-slate-800 print:border-b-4'>{fmtAcct(net_profit_cur)}</td>
                  <td className='px-3 py-4 font-black text-right tabular-nums text-muted-foreground text-lg border-double border-b-4 border-slate-500 print:border-b-4'>{fmtAcct(net_profit_comp)}</td>
                </tr>
                
                {sections.suspense.accounts.length > 0 && (
                  <>
                    <tr><td colSpan={4} className='px-3 py-2 font-bold text-red-600 dark:text-red-400 pt-8 sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>⚠️ Unmapped / Suspense Accounts</td></tr>
                    <tr><td colSpan={4} className='px-3 py-1.5 text-xs text-muted-foreground pl-4 sticky left-0 bg-card z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'>These accounts have an unrecognized statement_group and need to be reclassified.</td></tr>
                    <PLSection sectionObj={sections.suspense} />
                  </>
                )}
              </tbody>
            </table>
          </div>
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





