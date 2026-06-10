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
          <tr className={`hover:bg-muted/20 print:hover:bg-transparent ${isGroup ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
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
              <td className='px-3 py-2 font-semibold text-slate-800 bg-slate-50' colSpan={4}>{title}</td>
            </tr>
          )}
          {accounts.map(a => renderTree(a, 0, isDeduction))}
        </React.Fragment>
      );
    };

    const KPICard = ({ title, amount, percentage }) => (
      <div className='bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between report-no-print'>
        <span className='text-xs font-semibold text-slate-500 uppercase tracking-wider'>{title}</span>
        <div className='mt-2 flex items-baseline gap-2'>
          <span className={`text-xl font-bold tabular-nums ${amount < 0 ? 'text-red-600' : 'text-slate-800'}`}>
            {fmtAcct(amount, amount < 0)}
          </span>
          {percentage !== undefined && (
            <span className='text-xs font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded'>
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

        <div className='bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden p-6 print:p-0 print:border-none print:shadow-none'>
          <BusinessHeader reportTitle='INCOME STATEMENT' subtitle='(Profit & Loss Statement)' fromDate={filters.fromDate} toDate={filters.toDate} />
          
          <div className='report-no-print flex justify-end gap-2 mb-6'>
            <Button variant='outline' size='sm' onClick={() => setFilters(f => ({ ...f, expandAll: !f.expandAll }))}>
              {filters.expandAll ? 'Collapse All' : 'Expand All'}
            </Button>
            <Button variant='outline' size='sm' onClick={handleExport}>
              <Printer className='w-4 h-4 mr-2' /> Export
            </Button>
          </div>

          <table className='w-full text-sm'>
            <thead>
              <tr className='border-b border-slate-300'>
                <th className='px-3 py-2 text-left font-semibold text-slate-800 w-[50%]'>Financial Particulars</th>
                <th className='px-3 py-2 text-center font-semibold text-slate-800 w-[10%]'>Notes</th>
                <th className='px-3 py-2 text-right font-semibold text-slate-800 w-[20%]'>Current Period<br/><span className='text-xs text-slate-500 font-normal'>NPR</span></th>
                <th className='px-3 py-2 text-right font-semibold text-slate-800 w-[20%]'>Comparative<br/><span className='text-xs text-slate-500 font-normal'>NPR</span></th>
              </tr>
            </thead>
            
            <tbody className='divide-y divide-slate-100'>
              <tr className='bg-slate-100'><td colSpan={4} className='px-3 py-2 font-bold text-slate-800'>1. Gross Operating Revenue</td></tr>
              
              <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-slate-700 pl-4'>Sales Revenue</td></tr>
              <PLSection sectionObj={sections.revenue} />
              
              {sections.sales_returns.accounts.length > 0 && (
                <>
                  <tr><td colSpan={4} className='px-3 py-1.5 font-medium italic text-slate-600 pl-4'>Less: Sales Returns & Allowances</td></tr>
                  <PLSection sectionObj={sections.sales_returns} isDeduction={true} />
                </>
              )}
              
              <tr className='border-t border-slate-200 bg-slate-50'>
                <td className='px-3 py-2 font-bold text-slate-800 text-right' colSpan={2}>Net Sales Revenue</td>
                <td className='px-3 py-2 font-bold text-right tabular-nums'>{fmtAcct(net_sales_cur)}</td>
                <td className='px-3 py-2 font-bold text-right tabular-nums text-slate-600'>{fmtAcct(net_sales_comp)}</td>
              </tr>

              <tr><td colSpan={4} className='px-3 py-2 font-bold text-slate-800 pt-4'>2. Cost of Goods Sold (COGS)</td></tr>
              
              <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-slate-700 pl-4 pt-2'>Opening Stock</td></tr>
              {sections.opening_stock.accounts.length > 0 ? (
                <PLSection sectionObj={sections.opening_stock} />
              ) : (
                <tr className='text-slate-500'><td className='px-3 py-1.5 pl-8 border-none italic'>(No opening stock recorded)</td><td colSpan={3} className='border-none'></td></tr>
              )}
              
              <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-slate-700 pl-4 pt-2'>Add: Purchases</td></tr>
              {sections.purchases.accounts.length > 0 ? (
                <PLSection sectionObj={sections.purchases} />
              ) : (
                <tr className='text-slate-500'><td className='px-3 py-1.5 pl-8 border-none italic'>(No purchases recorded)</td><td colSpan={3} className='border-none'></td></tr>
              )}
              
              <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-slate-700 pl-4 pt-2'>Add: Direct Expenses</td></tr>
              {sections.cogs_other.accounts.length > 0 ? (
                <PLSection sectionObj={sections.cogs_other} />
              ) : (
                <tr className='text-slate-500'><td className='px-3 py-1.5 pl-8 border-none italic'>(No direct expenses recorded)</td><td colSpan={3} className='border-none'></td></tr>
              )}
              
              <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-slate-700 pl-4 pt-2'>Less: Closing Stock</td></tr>
              {sections.closing_stock.accounts.length > 0 ? (
                <PLSection sectionObj={sections.closing_stock} isDeduction={true} />
              ) : (
                <tr className='text-slate-500'><td className='px-3 py-1.5 pl-8 border-none italic'>(No closing stock recorded)</td><td colSpan={3} className='border-none'></td></tr>
              )}

              <tr className='border-t border-slate-200 bg-slate-50'>
                <td className='px-3 py-2 font-bold text-slate-800 text-right' colSpan={2}>Total Cost of Goods Sold</td>
                <td className='px-3 py-2 font-bold text-right tabular-nums'>{fmtAcct(cogs_total_cur, true)}</td>
                <td className='px-3 py-2 font-bold text-right tabular-nums text-slate-600'>{fmtAcct(cogs_total_comp, true)}</td>
              </tr>
              
              <tr className='border-t border-slate-300 bg-indigo-50/50'>
                <td className='px-3 py-3 font-bold text-indigo-900 text-right uppercase tracking-wider' colSpan={2}>Gross Profit</td>
                <td className='px-3 py-3 font-bold text-right tabular-nums text-indigo-900 text-base border-double border-b-4 border-indigo-200'>{fmtAcct(gross_profit_cur)}</td>
                <td className='px-3 py-3 font-bold text-right tabular-nums text-indigo-700 text-base border-double border-b-4 border-indigo-100'>{fmtAcct(gross_profit_comp)}</td>
              </tr>

              <tr><td colSpan={4} className='px-3 py-2 font-bold text-slate-800 pt-6'>3. Operating Expenses</td></tr>
              
              {sections.opex_selling.accounts.length > 0 && (
                <>
                  <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-slate-700 pl-4 pt-3'>Selling & Distribution Expenses</td></tr>
                  <PLSection sectionObj={sections.opex_selling} isDeduction={true} />
                </>
              )}
              
              {sections.opex_admin.accounts.length > 0 && (
                <>
                  <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-slate-700 pl-4 pt-3'>General & Administrative Expenses</td></tr>
                  <PLSection sectionObj={sections.opex_admin} isDeduction={true} />
                </>
              )}

              <tr className='border-t border-slate-200 bg-slate-50'>
                <td className='px-3 py-2 font-bold text-slate-800 text-right' colSpan={2}>Total Operating Expenses</td>
                <td className='px-3 py-2 font-bold text-right tabular-nums text-red-600'>{fmtAcct(total_opex_cur, true)}</td>
                <td className='px-3 py-2 font-bold text-right tabular-nums text-red-400'>{fmtAcct(total_opex_comp, true)}</td>
              </tr>

              <tr className='border-t border-slate-300 bg-emerald-50/50'>
                <td className='px-3 py-3 font-bold text-emerald-900 text-right uppercase tracking-wider' colSpan={2}>Operating Profit (EBIT)</td>
                <td className='px-3 py-3 font-bold text-right tabular-nums text-emerald-900 text-base'>{fmtAcct(op_profit_cur)}</td>
                <td className='px-3 py-3 font-bold text-right tabular-nums text-emerald-700 text-base'>{fmtAcct(op_profit_comp)}</td>
              </tr>

              {(sections.non_op_income.accounts.length > 0 || sections.finance_cost.accounts.length > 0) && (
                <tr><td colSpan={4} className='px-3 py-2 font-bold text-slate-800 pt-6'>4. Non-Operating Income & Expenses</td></tr>
              )}
              
              {sections.non_op_income.accounts.length > 0 && (
                <>
                  <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-slate-700 pl-4 pt-3'>Add: Other Income</td></tr>
                  <PLSection sectionObj={sections.non_op_income} />
                </>
              )}

              {sections.finance_cost.accounts.length > 0 && (
                <>
                  <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-slate-700 pl-4 pt-3'>Less: Finance Costs</td></tr>
                  <PLSection sectionObj={sections.finance_cost} isDeduction={true} />
                </>
              )}

              <tr className='border-t border-slate-300'>
                <td className='px-3 py-3 font-bold text-slate-900 text-right uppercase tracking-wider' colSpan={2}>Net Profit Before Tax</td>
                <td className='px-3 py-3 font-bold text-right tabular-nums text-slate-900 text-base'>{fmtAcct(pbt_cur)}</td>
                <td className='px-3 py-3 font-bold text-right tabular-nums text-slate-700 text-base'>{fmtAcct(pbt_comp)}</td>
              </tr>

              <tr><td colSpan={4} className='px-3 py-1.5 font-medium text-slate-700 pl-4 pt-3'>Less: Provision for Corporate Income Tax</td></tr>
              <PLSection sectionObj={sections.tax} isDeduction={true} />
              
              <tr className='border-t border-slate-800 bg-slate-50 print:border-t-2'>
                <td className='px-3 py-4 font-black text-slate-900 text-right uppercase tracking-widest text-base' colSpan={2}>Net Income For The Period</td>
                <td className='px-3 py-4 font-black text-right tabular-nums text-slate-900 text-lg border-double border-b-4 border-slate-800 print:border-b-4'>{fmtAcct(net_profit_cur)}</td>
                <td className='px-3 py-4 font-black text-right tabular-nums text-slate-700 text-lg border-double border-b-4 border-slate-500 print:border-b-4'>{fmtAcct(net_profit_comp)}</td>
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
      <div className='bg-red-50 border border-red-200 rounded-xl p-8 m-4 text-center space-y-4'>
        <div className='text-red-500 text-4xl mb-2'>⚠️</div>
        <h3 className='text-lg font-bold text-red-800'>Income Statement Render Error</h3>
        <p className='text-red-600 font-mono text-sm bg-white p-4 rounded border border-red-100 shadow-inner max-w-2xl mx-auto overflow-auto text-left'>
          {err.name}: {err.message}
        </p>
      </div>
    );
  }
}
