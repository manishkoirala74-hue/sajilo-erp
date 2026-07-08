import { sajilo, supabase } from '@/api/sajiloClient';

// ── Helper: check if a date string falls within range ───────────────────────
function inRange(dateStr, from, to) {
  if (!dateStr) return false;
  const d = (dateStr || '').substring(0, 10);
  return d >= from && d <= to;
}

// ── Main data fetcher ────────────────────────────────────────────────────────
export async function fetchReportData(reportId, fromDate, toDate, extraParams = {}) {
  switch (reportId) {

    // ── ACCOUNTING ────────────────────────────────────────────────────────────

    case 'ledger_detail': {
      if (!extraParams.accountId) return [];
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_stabilized_general_ledger_statement_rpc', {
        p_company_id,
        p_account_id: extraParams.accountId,
        p_from_date: fromDate,
        p_to_date: toDate
      });
      if (error) throw error;
      return data || [];
    }

    case 'trial_balance': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_trial_balance_rpc', {
        p_company_id,
        p_from_date: fromDate,
        p_to_date: toDate
      });
      if (error) throw error;
      return (data || []).map(a => ({ ...a, _isControlAccount: false }));
    }

    case 'profit_loss': {
      const p_company_id = sajilo.getCompanyId();
      const fd = new Date(fromDate);
      const td = new Date(toDate);
      const compFromDate = new Date(new Date(fd).setFullYear(fd.getFullYear() - 1)).toISOString().slice(0, 10);
      const compToDate   = new Date(new Date(td).setFullYear(td.getFullYear() - 1)).toISOString().slice(0, 10);

      const { data, error } = await supabase.rpc('get_comparative_profit_loss_rpc', {
        p_company_id,
        p_from_date: fromDate,
        p_to_date: toDate,
        p_comp_from_date: compFromDate,
        p_comp_to_date: compToDate
      });
      if (error) throw error;

      const mappedData = (data || []).map(a => {
        const cur_bal  = Number(a.current_balance  || 0);
        const comp_bal = Number(a.comparative_balance || 0);
        return { ...a, current_balance: cur_bal, comparative_balance: comp_bal, balance: cur_bal };
      });
      return { accounts: mappedData };
    }

    case 'balance_sheet': {
      const p_company_id = sajilo.getCompanyId();
      const safeToDate   = toDate || new Date().toISOString().slice(0, 10);

      const [all, { data: tbData, error: tbErr }] = await Promise.all([
        sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 2000),
        supabase.rpc('get_trial_balance_rpc', { p_company_id, p_from_date: '1970-01-01', p_to_date: safeToDate })
      ]);
      if (tbErr) throw tbErr;

      const tbMap = {};
      (tbData || []).forEach(r => { tbMap[r.id] = r; });

      const allAccounts = all.map(a => {
        const r = tbMap[a.id] || { current_debit: 0, current_credit: 0 };
        const isDebitNormal = (a.normal_balance || '').toLowerCase() === 'debit';
        const base_ob = Number(a.opening_balance || 0);
        const isBaseObDr = (a.opening_balance_type || (isDebitNormal ? 'Dr' : 'Cr')) === 'Dr';
        let ob_dr = 0, ob_cr = 0;
        if (isBaseObDr) ob_dr = base_ob; else ob_cr = base_ob;
        const total_dr = ob_dr + Number(r.current_debit || 0);
        const total_cr = ob_cr + Number(r.current_credit || 0);
        const bal = isDebitNormal ? (total_dr - total_cr) : (total_cr - total_dr);
        return { ...a, balance: bal };
      });

      const isIncomeStatement = a => a.financial_statement === 'income_statement';
      const netIncome = allAccounts.filter(isIncomeStatement).reduce((sum, a) => {
        const isExpense = (a.normal_balance || '').toLowerCase() === 'debit';
        return isExpense ? sum - a.balance : sum + a.balance;
      }, 0);

      const toRow    = a  => ({ ...a, closing_balance: a.balance });
      const assets      = allAccounts.filter(a => a.account_type === 'Asset').map(toRow);
      const liabilities = allAccounts.filter(a => a.account_type === 'Liability').map(toRow);
      const equity      = allAccounts.filter(a => a.account_type === 'Equity').map(toRow);

      equity.push({
        id: 'virtual-current-year-earnings',
        account_code: '—',
        account_name: 'Current Year Earnings',
        account_type: 'Equity',
        ledger_type: 'Sub Ledger',
        closing_balance: netIncome,
        balance: netIncome
      });

      return {
        accounts:         [...assets, ...liabilities, ...equity],
        assets, liabilities, equity,
        total_assets:      assets.reduce((s, a) => s + a.balance, 0),
        total_liabilities: liabilities.reduce((s, a) => s + a.balance, 0),
        total_equity:      equity.reduce((s, a) => s + a.balance, 0),
      };
    }

    case 'cash_flow': {
      // Handled internally by CashFlowReport component — return [] as placeholder
      return [];
    }

    case 'gl_summary': {
      // Use the RPC if available; fall back to direct aggregation
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_gl_summary_rpc', {
        p_company_id, p_from_date: fromDate, p_to_date: toDate
      });
      if (!error && data) return data;

      // Fallback: direct aggregation
      const journals = await sajilo.entities.GeneralLedgerJournal.filter({ status: 'Posted' }, 'entry_date', 10000);
      const filteredIds = Array.from(new Set(
        journals.filter(j => inRange(j.entry_date, fromDate, toDate)).map(j => j.id)
      ));
      if (filteredIds.length === 0) return [];

      const accounts = await sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 2000);
      const accMap = {};
      accounts.forEach(a => { accMap[a.id] = a; });

      let allLines = [];
      for (let i = 0; i < filteredIds.length; i += 100) {
        const { data: chunk } = await supabase.from('GeneralLedgerLine')
          .select('account_id, debit_amount, credit_amount')
          .in('journal_id', filteredIds.slice(i, i + 100));
        if (chunk) allLines = allLines.concat(chunk);
      }

      const totals = {};
      allLines.forEach(l => {
        if (!l.account_id) return;
        if (!totals[l.account_id]) totals[l.account_id] = { debit: 0, credit: 0 };
        totals[l.account_id].debit  += l.debit_amount  || 0;
        totals[l.account_id].credit += l.credit_amount || 0;
      });

      return Object.entries(totals)
        .filter(([, t]) => t.debit > 0 || t.credit > 0)
        .map(([id, t]) => ({
          account_code: accMap[id]?.account_code || '',
          account_name: accMap[id]?.account_name || 'Unknown',
          debit: t.debit,
          credit: t.credit,
        }))
        .sort((a, b) => (a.account_code || '').localeCompare(b.account_code || ''));
    }

    case 'journal_report': {
      const journals = await sajilo.entities.GeneralLedgerJournal.filter({ status: 'Posted' }, 'entry_date', 5000);
      const filtered = journals.filter(j => inRange(j.entry_date, fromDate, toDate));
      const jIds = Array.from(new Set(filtered.map(j => j.id)));

      let lines = [];
      for (let i = 0; i < jIds.length; i += 100) {
        const { data } = await supabase.from('GeneralLedgerLine').select('*').in('journal_id', jIds.slice(i, i + 100));
        if (data) lines = lines.concat(data);
      }

      const jMap = {};
      filtered.forEach(j => { jMap[j.id] = { ...j, lines: [] }; });
      lines.forEach(l => { if (jMap[l.journal_id]) jMap[l.journal_id].lines.push(l); });

      return Object.values(jMap)
        .map(j => ({
          ...j,
          total_amount: j.lines.reduce((s, l) => s + (l.debit_amount || 0), 0)
        }))
        .sort((a, b) => (a.entry_date || '').localeCompare(b.entry_date || ''));
    }

    case 'txn_list': {
      const journals = await sajilo.entities.GeneralLedgerJournal.filter({ status: 'Posted' }, 'entry_date', 5000);
      const filtered = journals.filter(j => inRange(j.entry_date, fromDate, toDate));
      const jMap = {};
      filtered.forEach(j => { jMap[j.id] = j; });

      let lines = [];
      const jIds = Object.keys(jMap);
      for (let i = 0; i < jIds.length; i += 100) {
        const { data } = await supabase.from('GeneralLedgerLine').select('*').in('journal_id', jIds.slice(i, i + 100));
        if (data) lines = lines.concat(data);
      }

      return lines.map(l => {
        const j = jMap[l.journal_id];
        return { ...l, entry_date: (j?.entry_date || '').substring(0, 10), journal_memo: j?.memo || '', voucher_no: j?.voucher_no || '' };
      });
    }

    // ── SALES ─────────────────────────────────────────────────────────────────

    case 'sales_summary': {
      // Fetch directly from SalesInvoice entity — the RPC returns only 3 fields
      // which are insufficient for the viewer (needs invoice_number, customer_name, etc.)
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      return (invoices || [])
        .filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate))
        .map(i => ({
          invoice_number:   i.invoice_number,
          invoice_date:     i.invoice_date,
          customer_name:    i.customer_name,
          status:           i.status,
          payment_status:   i.payment_status,
          goods_subtotal:   i.subtotal || i.goods_subtotal || 0,
          total_tax_amount: i.total_tax_amount || i.vat_amount || 0,
          grand_total:      i.grand_total || 0,
        }));
    }

    case 'sales_by_customer': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      const map = {};
      (invoices || []).filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(i => {
        const key = i.customer_name || 'Unknown';
        if (!map[key]) map[key] = { customer: key, count: 0, total: 0 };
        map[key].count++;
        map[key].total += i.grand_total || 0;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    }

    case 'sales_by_item': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      const map = {};
      (invoices || []).filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(inv => {
        (inv.line_items || []).forEach(l => {
          const key = l.item_id || l.item_name;
          if (!key) return;
          if (!map[key]) map[key] = { item_code: l.item_code || '—', item_name: l.item_name, qty_sold: 0, revenue: 0 };
          map[key].qty_sold += l.quantity || 0;
          map[key].revenue  += l.line_total || 0;
        });
      });
      return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    }

    case 'sales_by_customer_monthly': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      const map = {};
      (invoices || []).filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(i => {
        const month = i.invoice_date.substring(0, 7);
        const key   = (i.customer_name || 'Unknown') + '_' + month;
        if (!map[key]) map[key] = { customer: i.customer_name || 'Unknown', month, total: 0 };
        map[key].total += i.grand_total || 0;
      });
      return Object.values(map).sort((a, b) => a.customer.localeCompare(b.customer) || a.month.localeCompare(b.month));
    }

    case 'sales_by_item_monthly': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      const map = {};
      (invoices || []).filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(inv => {
        const month = inv.invoice_date.substring(0, 7);
        (inv.line_items || []).forEach(l => {
          const key = (l.item_id || l.item_name) + '_' + month;
          if (!map[key]) map[key] = { item_code: l.item_code || '—', item_name: l.item_name || '—', month, qty_sold: 0, revenue: 0 };
          map[key].qty_sold += l.quantity  || 0;
          map[key].revenue  += l.line_total || 0;
        });
      });
      return Object.values(map).sort((a, b) => (a.item_name || '').localeCompare(b.item_name || '') || a.month.localeCompare(b.month));
    }

    case 'sales_return_report': {
      // "Sales Master Report" — all posted Sales Invoices in the period
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      return (invoices || [])
        .filter(i => inRange(i.invoice_date, fromDate, toDate))
        .map(i => ({
          invoice_number:   i.invoice_number,
          invoice_date:     i.invoice_date,
          customer_name:    i.customer_name,
          status:           i.status,
          payment_status:   i.payment_status,
          goods_subtotal:   i.subtotal || i.goods_subtotal || 0,
          total_tax_amount: i.total_tax_amount || i.vat_amount || 0,
          grand_total:      i.grand_total || 0,
        }));
    }

    // ── PURCHASE ──────────────────────────────────────────────────────────────

    case 'purchase_summary': {
      // Fetch directly from PurchaseInvoice — the RPC only returns 3 fields
      const bills = await sajilo.entities.PurchaseInvoice.list('-invoice_date', 2000);
      return (bills || [])
        .filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate))
        .map(i => ({
          bill_number:  i.invoice_number || i.bill_number,
          bill_date:    i.invoice_date   || i.bill_date,
          vendor_name:  i.vendor_name,
          status:       i.status,
          payment_status: i.payment_status,
          subtotal:     i.subtotal    || 0,
          vat_amount:   i.vat_amount  || i.total_tax_amount || 0,
          grand_total:  i.grand_total || 0,
        }));
    }

    case 'purchase_by_vendor': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-invoice_date', 2000);
      const map = {};
      (bills || []).filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(i => {
        const key = i.vendor_name || 'Unknown';
        if (!map[key]) map[key] = { vendor: key, count: 0, total: 0 };
        map[key].count++;
        map[key].total += i.grand_total || 0;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    }

    case 'purchase_by_item': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-invoice_date', 2000);
      const map = {};
      (bills || []).filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(inv => {
        (inv.line_items || []).forEach(l => {
          const key = l.item_id || l.item_name;
          if (!key) return;
          if (!map[key]) map[key] = { item_code: l.item_code || '—', item_name: l.item_name, qty_bought: 0, cost: 0 };
          map[key].qty_bought += l.quantity   || 0;
          map[key].cost       += l.line_total || 0;
        });
      });
      return Object.values(map).sort((a, b) => b.cost - a.cost);
    }

    case 'unpaid_bills': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-invoice_date', 2000);
      return (bills || [])
        .filter(i => i.status === 'Posted' && i.payment_status !== 'Paid')
        .map(i => ({
          invoice_number: i.invoice_number || i.bill_number,
          invoice_date:   i.invoice_date   || i.bill_date,
          customer_name:  i.vendor_name,
          grand_total:    i.grand_total || 0,
          payment_status: i.payment_status,
        }));
    }

    // ── RECEIVABLE ────────────────────────────────────────────────────────────

    case 'ar_aging': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_ar_aging_rpc', { p_company_id });
      if (error) throw error;
      return (data || []).map(r => ({
        customer_name: r.customer_name || 'Unknown',
        bucket:        r.bucket,
        grand_total:   r.balance,
      })).sort((a, b) => b.grand_total - a.grand_total);
    }

    case 'ar_aging_summary': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_ar_aging_rpc', { p_company_id });
      if (error) throw error;
      const map = {};
      (data || []).forEach(r => {
        const key = r.customer_name || 'Unknown';
        if (!map[key]) map[key] = { customer: key, current: 0, '30d': 0, '60d': 0, '60d+': 0, total: 0 };
        const amt = r.balance || 0;
        map[key].total += amt;
        if      (r.bucket === 'Current')       map[key].current += amt;
        else if (r.bucket === '1–30 days')     map[key]['30d']  += amt;
        else if (r.bucket === '31–60 days')    map[key]['60d']  += amt;
        else                                    map[key]['60d+'] += amt;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    }

    case 'customer_balance': {
      const p_company_id = sajilo.getCompanyId();
      const [{ data: lines, error: lErr }, { data: customers, error: cErr }] = await Promise.all([
        supabase.from('GeneralLedgerLine').select('entity_id, debit_amount, credit_amount')
          .eq('company_id', p_company_id).eq('entity_type', 'Customer'),
        supabase.from('Customer').select('id, name').eq('company_id', p_company_id)
      ]);
      if (lErr) throw lErr;

      const cMap = {};
      (customers || []).forEach(c => { cMap[c.id] = c.name; });

      const map = {};
      (lines || []).forEach(l => {
        const id = l.entity_id;
        if (!id) return;
        const name = cMap[id] || 'Unknown';
        if (!map[id]) map[id] = { customer: name, total_invoiced: 0, total_paid: 0, balance: 0 };
        map[id].balance        += (l.debit_amount || 0) - (l.credit_amount || 0);
        if (l.debit_amount  > 0) map[id].total_invoiced += l.debit_amount;
        if (l.credit_amount > 0) map[id].total_paid     += l.credit_amount;
      });
      // Return raw numbers — viewer uses fmtNPR()
      return Object.values(map);
    }

    case 'debtor_statement': {
      // Handled by PartnerStatement component — return empty
      return [];
    }

    // ── PAYABLE ───────────────────────────────────────────────────────────────

    case 'ap_aging': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_ap_aging_rpc', { p_company_id });
      if (error) throw error;
      return (data || []).map(r => ({
        customer_name: r.vendor_name || 'Unknown',
        bucket:        r.bucket,
        grand_total:   r.balance,
      })).sort((a, b) => b.grand_total - a.grand_total);
    }

    case 'ap_aging_summary': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_ap_aging_rpc', { p_company_id });
      if (error) throw error;
      const map = {};
      (data || []).forEach(r => {
        const key = r.vendor_name || 'Unknown';
        if (!map[key]) map[key] = { vendor: key, current: 0, '30d': 0, '60d': 0, '60d+': 0, total: 0 };
        const amt = r.balance || 0;
        map[key].total += amt;
        if      (r.bucket === 'Current')       map[key].current += amt;
        else if (r.bucket === '1–30 days')     map[key]['30d']  += amt;
        else if (r.bucket === '31–60 days')    map[key]['60d']  += amt;
        else                                    map[key]['60d+'] += amt;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    }

    case 'vendor_balance': {
      const p_company_id = sajilo.getCompanyId();
      const [{ data: lines, error: lErr }, { data: vendors, error: vErr }] = await Promise.all([
        supabase.from('GeneralLedgerLine').select('entity_id, debit_amount, credit_amount')
          .eq('company_id', p_company_id).eq('entity_type', 'Vendor'),
        supabase.from('Vendor').select('id, name').eq('company_id', p_company_id)
      ]);
      if (lErr) throw lErr;

      const vMap = {};
      (vendors || []).forEach(v => { vMap[v.id] = v.name; });

      const map = {};
      (lines || []).forEach(l => {
        const id = l.entity_id;
        if (!id) return;
        const name = vMap[id] || 'Unknown';
        if (!map[id]) map[id] = { vendor: name, total_billed: 0, total_paid: 0, balance: 0 };
        map[id].balance        += (l.credit_amount || 0) - (l.debit_amount || 0);
        if (l.credit_amount > 0) map[id].total_billed += l.credit_amount;
        if (l.debit_amount  > 0) map[id].total_paid   += l.debit_amount;
      });
      // Return raw numbers — viewer uses fmtNPR()
      return Object.values(map);
    }

    case 'vendor_statement': {
      // Handled by PartnerStatement component — return empty
      return [];
    }

    // ── TAX ───────────────────────────────────────────────────────────────────

    case 'vat_summary':
    case 'vat_sales': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      return (invoices || [])
        .filter(i => i.status === 'Posted' && (i.total_tax_amount || 0) > 0 && inRange(i.invoice_date, fromDate, toDate))
        .map(i => ({
          invoice_number:  i.invoice_number,
          invoice_date:    i.invoice_date,
          customer_name:   i.customer_name,
          goods_subtotal:  i.subtotal || i.goods_subtotal || 0,
          total_tax_amount: i.total_tax_amount || i.vat_amount || 0,
          grand_total:     i.grand_total || 0,
        }));
    }

    case 'vat_purchases': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-invoice_date', 2000);
      return (bills || [])
        .filter(i => i.status === 'Posted' && ((i.vat_amount || 0) + (i.total_tax_amount || 0)) > 0 && inRange(i.invoice_date, fromDate, toDate))
        .map(i => ({
          invoice_number: i.invoice_number || i.bill_number,
          invoice_date:   i.invoice_date   || i.bill_date,
          customer_name:  i.vendor_name,
          goods_subtotal: i.subtotal || 0,
          vat_amount:     i.vat_amount || i.total_tax_amount || 0,
          grand_total:    i.grand_total || 0,
        }));
    }

    case 'tds_report': {
      // Fetch paid payslips with TDS deductions
      const payslips = await (sajilo.entities.Payslip?.list('-pay_period_end', 2000).catch(() => []) || Promise.resolve([]));
      return (payslips || [])
        .filter(p => p.status === 'Paid' && inRange(p.pay_period_end || p.pay_period_start, fromDate, toDate))
        .map(p => ({
          employee_name: p.employee_name || '—',
          pay_period:    p.pay_period_end || p.pay_period_start || '—',
          gross_pay:     p.gross_pay     || 0,
          tds_amount:    p.tds_amount    || p.income_tax_amount || 0,
          net_pay:       p.net_pay       || 0,
        }));
    }

    // ── INVENTORY ─────────────────────────────────────────────────────────────

    case 'stock_by_location': {
      const items = await sajilo.entities.Item.filter({ is_active: true }, 'item_name', 2000);
      let query = supabase.from('CurrentStock').select('godown_id, item_id, current_qty, Godown(name)');
      
      if (extraParams?.godown_id && extraParams.godown_id !== 'all') {
        query = query.eq('godown_id', extraParams.godown_id);
      }
      
      const { data: stockData } = await query;
      
      const reportRows = [];
      (stockData || []).forEach(row => {
        const item = items.find(i => i.id === row.item_id);
        if (!item || item.item_type === 'Service') return;
        
        const wac = item.weighted_average_cost || item.purchase_price || 0;
        reportRows.push({
          item_code: item.item_code || '—',
          item_name: item.item_name,
          category_name: item.category_name || '—',
          unit_of_measure: item.unit_of_measure,
          godown_name: row.Godown?.name || 'Unknown',
          quantity_on_hand: Number(row.current_qty) || 0,
          wac: wac,
          value: (Number(row.current_qty) || 0) * wac
        });
      });
      return reportRows;
    }

    case 'stock_summary':
    case 'item_valuation': {
      const items = await sajilo.entities.Item.filter({ is_active: true }, 'item_name', 2000);
      return (items || []).filter(i => i.item_type !== 'Service').map(i => ({
        item_code:             i.item_code    || '—',
        item_name:             i.item_name,
        category_name:         i.category_name || '—',
        unit_of_measure:       i.unit_of_measure,
        quantity_on_hand:      i.quantity_on_hand || 0,
        weighted_average_cost: i.weighted_average_cost || i.purchase_price || 0,
        wac:                   i.weighted_average_cost || i.purchase_price || 0,
        value:                 (i.quantity_on_hand || 0) * (i.weighted_average_cost || i.purchase_price || 0),
      }));
    }

    case 'low_stock': {
      const items = await sajilo.entities.Item.filter({ is_active: true }, 'item_name', 2000);
      return (items || [])
        .filter(i => i.item_type !== 'Service' && (i.reorder_level || 0) > 0 && (i.quantity_on_hand || 0) <= i.reorder_level)
        .map(i => ({
          item_code:       i.item_code    || '—',
          item_name:       i.item_name,
          category_name:   i.category_name || '—',
          unit_of_measure: i.unit_of_measure,
          quantity_on_hand: i.quantity_on_hand || 0,
          reorder_level:   i.reorder_level,
          shortage:        i.reorder_level - (i.quantity_on_hand || 0),
        }));
    }

    case 'stock_movement': {
      const [purchases, sales] = await Promise.all([
        sajilo.entities.PurchaseInvoice.list('-invoice_date', 2000),
        sajilo.entities.SalesInvoice.list('-invoice_date', 2000),
      ]);
      const rows = [];
      (purchases || []).filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(inv => {
        (inv.line_items || []).forEach(l => {
          if (l.item_id || l.item_name) {
            rows.push({ date: inv.invoice_date, ref: inv.invoice_number, type: 'Purchase In', item_code: l.item_code || '—', item_name: l.item_name, qty_in: l.quantity || 0, qty_out: 0, unit_cost: l.unit_price || 0 });
          }
        });
      });
      (sales || []).filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(inv => {
        (inv.line_items || []).forEach(l => {
          if (l.item_id || l.item_name) {
            rows.push({ date: inv.invoice_date, ref: inv.invoice_number, type: 'Sales Out', item_code: l.item_code || '—', item_name: l.item_name, qty_in: 0, qty_out: l.quantity || 0, unit_cost: l.unit_price || 0 });
          }
        });
      });
      return rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    }

    case 'category_summary': {
      const items = await sajilo.entities.Item.filter({ is_active: true }, 'item_name', 2000);
      const map   = {};
      (items || []).filter(i => i.item_type !== 'Service').forEach(i => {
        const cat = i.category_name || 'Uncategorized';
        if (!map[cat]) map[cat] = { category: cat, item_count: 0, total_qty: 0, total_value: 0 };
        map[cat].item_count++;
        map[cat].total_qty   += i.quantity_on_hand || 0;
        map[cat].total_value += (i.quantity_on_hand || 0) * (i.weighted_average_cost || i.purchase_price || 0);
      });
      return Object.values(map);
    }

    default:
      return [];
  }
}