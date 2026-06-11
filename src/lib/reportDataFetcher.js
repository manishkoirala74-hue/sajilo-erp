import { sajilo, supabase } from '@/api/sajiloClient';

async function injectPeriodicInventory(baseAccounts, companyId, fromDate, toDate) {
  try {
    const { data, error } = await supabase.rpc('get_periodic_inventory_balances_rpc', {
      p_company_id: companyId,
      p_from_date: fromDate,
      p_to_date: toDate
    });
    
    if (error) {
      console.error('Virtual inventory calc failed:', error);
      return baseAccounts;
    }

    if (data && data.length > 0) {
      const { opening_stock, closing_stock, net_purchases } = data[0];
      const accs = [...baseAccounts];
      accs.push({ id: 'virt-ob', account_name: 'Opening Stock', account_code: '', account_type: 'Cost of Sales', current_balance: opening_stock, comparative_balance: 0, balance: opening_stock, is_group: false });
      accs.push({ id: 'virt-pur', account_name: 'Purchases', account_code: '', account_type: 'Cost of Sales', current_balance: net_purchases, comparative_balance: 0, balance: net_purchases, is_group: false });
      accs.push({ id: 'virt-cb', account_name: 'Closing Stock', account_code: '', account_type: 'Cost of Sales', current_balance: closing_stock, comparative_balance: 0, balance: closing_stock, is_group: false });
      return accs;
    }
  } catch (e) {
    console.error('Virtual inventory calc failed:', e);
  }
  return baseAccounts;
}

// Helper to check if a date string falls within range
function inRange(dateStr, from, to) {
  if (!dateStr) return false;
  return dateStr >= from && dateStr <= to;
}

export async function fetchReportData(reportId, fromDate, toDate, extraParams = {}) {
  switch (reportId) {

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
      return (data || []).map(a => ({
        ...a,
        _isControlAccount: false
      }));
    }

    case 'profit_loss': {
      const p_company_id = sajilo.getCompanyId();
      
      const fd = new Date(fromDate);
      const td = new Date(toDate);
      const compFromDate = new Date(fd.setFullYear(fd.getFullYear() - 1)).toISOString().slice(0, 10);
      const compToDate = new Date(td.setFullYear(td.getFullYear() - 1)).toISOString().slice(0, 10);

      try {
        const { data, error } = await supabase.rpc('get_comparative_profit_loss_rpc', {
          p_company_id,
          p_from_date: fromDate,
          p_to_date: toDate,
          p_comp_from_date: compFromDate,
          p_comp_to_date: compToDate
        });
        if (error) throw error;
        let result = data || [];
        result = await injectPeriodicInventory(result, p_company_id, fromDate, toDate);
        return { accounts: result };
      } catch (err) {
        console.warn('Comparative RPC not found or failed, falling back to standard RPC.', err);
        // Fallback to standard profit_loss if the comparative RPC hasn't been migrated
        const { data, error } = await supabase.rpc('get_profit_loss_rpc', {
          p_company_id,
          p_from_date: fromDate,
          p_to_date: toDate
        });
        if (error) throw error;
        // Map the old data structure to the new comparative structure
        const mappedData = (data || []).map(a => ({
          ...a,
          current_balance: a.balance,
          comparative_balance: 0
        }));
        let result = mappedData || [];
        result = await injectPeriodicInventory(result, p_company_id, fromDate, toDate);
        return { accounts: result };
      }
    }

    case 'balance_sheet': {
      // Re-use trial balance RPC for balance sheet up to toDate
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_trial_balance_rpc', {
        p_company_id,
        p_from_date: '1900-01-01', // Get everything up to toDate
        p_to_date: toDate || new Date().toISOString().slice(0,10)
      });
      if (error) throw error;
      
      const allAccounts = (data || []).map(a => {
        const isDebitNormal = ['Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense'].includes(a.account_type);
        const bal = isDebitNormal ? (a.closing_debit - a.closing_credit) : (a.closing_credit - a.closing_debit);
        return { ...a, balance: bal };
      });

      // Calculate Net Income (Revenue - Expenses)
      const isIncomeStatement = a => ['Revenue', 'Other Income', 'Expense', 'COGS', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(a.account_type);
      const netIncome = allAccounts.filter(isIncomeStatement).reduce((sum, a) => {
        // Revenue increases Net Income, Expenses decrease Net Income
        const isExpense = ['Expense', 'COGS', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(a.account_type);
        // bal for expenses is positive, so subtract. bal for revenue is positive (credit normal), so add.
        return isExpense ? sum - a.balance : sum + a.balance;
      }, 0);

      const toRow = a => ({ ...a, closing_balance: a.balance });

      const assets      = allAccounts.filter(a => a.account_type === 'Asset').map(toRow);
      const liabilities = allAccounts.filter(a => a.account_type === 'Liability').map(toRow);
      const equity      = allAccounts.filter(a => a.account_type === 'Equity').map(toRow);

      // Inject Current Year Earnings into Equity
      equity.push({
        id: 'virtual-current-year-earnings',
        account_code: '—',
        account_name: 'Current Year Earnings',
        account_type: 'Equity',
        ledger_type: 'Sub Ledger',
        closing_balance: netIncome,
        balance: netIncome
      });

      // Return flat array of all BS accounts so the UI can build the tree
      const bsAccounts = [...assets, ...liabilities, ...equity];

      return {
        accounts: bsAccounts,
        assets, liabilities, equity,
        total_assets:      assets.reduce((s, a) => s + a.balance, 0),
        total_liabilities: liabilities.reduce((s, a) => s + a.balance, 0),
        total_equity:      equity.reduce((s, a) => s + a.balance, 0),
      };
    }

    case 'stock_summary':
    case 'item_valuation': {
      const items = await sajilo.entities.Item.filter({ is_active: true }, 'item_name', 2000);
      return items.filter(i => i.item_type !== 'Service').map(i => ({
        item_code: i.item_code,
        item_name: i.item_name,
        category_name: i.category_name,
        unit_of_measure: i.unit_of_measure,
        quantity_on_hand: i.quantity_on_hand || 0,
        weighted_average_cost: i.weighted_average_cost || i.purchase_price || 0,
        wac: i.weighted_average_cost || i.purchase_price || 0,
        value: (i.quantity_on_hand || 0) * (i.weighted_average_cost || i.purchase_price || 0),
      }));
    }

    case 'low_stock': {
      const items = await sajilo.entities.Item.filter({ is_active: true }, 'item_name', 2000);
      return items
        .filter(i => i.item_type !== 'Service' && i.reorder_level > 0 && (i.quantity_on_hand || 0) <= i.reorder_level)
        .map(i => ({
          item_code: i.item_code, item_name: i.item_name, category_name: i.category_name,
          unit_of_measure: i.unit_of_measure, quantity_on_hand: i.quantity_on_hand || 0,
          reorder_level: i.reorder_level, shortage: i.reorder_level - (i.quantity_on_hand || 0),
        }));
    }

    case 'category_summary': {
      const items = await sajilo.entities.Item.filter({ is_active: true }, 'item_name', 2000);
      const map = {};
      items.filter(i => i.item_type !== 'Service').forEach(i => {
        const cat = i.category_name || 'Uncategorized';
        if (!map[cat]) map[cat] = { category: cat, item_count: 0, total_qty: 0, total_value: 0 };
        map[cat].item_count++;
        map[cat].total_qty += i.quantity_on_hand || 0;
        map[cat].total_value += (i.quantity_on_hand || 0) * (i.weighted_average_cost || i.purchase_price || 0);
      });
      return Object.values(map).map(r => ({ ...r, total_value: `NPR ${r.total_value.toLocaleString('en-NP', { minimumFractionDigits: 2 })}` }));
    }

    case 'sales_summary': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_sales_summary_rpc', {
        p_company_id, p_from_date: fromDate, p_to_date: toDate
      });
      if (error) throw error;
      return (data || []).map(r => ({ ...r, invoice_date: r.entry_date, grand_total: r.net_revenue }));
    }

    case 'sales_by_customer': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      const map = {};
      invoices.filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(i => {
        if (!map[i.customer_name]) map[i.customer_name] = { customer: i.customer_name, count: 0, total: 0 };
        map[i.customer_name].count++;
        map[i.customer_name].total += i.grand_total || 0;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    }

    case 'sales_by_item': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      const map = {};
      invoices.filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(inv => {
        (inv.line_items || []).forEach(l => {
          const key = l.item_id || l.item_name;
          if (!map[key]) map[key] = { item_code: l.item_code, item_name: l.item_name, qty_sold: 0, revenue: 0 };
          map[key].qty_sold += l.quantity || 0;
          map[key].revenue += l.line_total || 0;
        });
      });
      return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    }

    case 'sales_return_report': {
      const returns = await sajilo.entities.SalesReturn.list('-return_date', 1000);
      return returns.filter(r => inRange(r.return_date, fromDate, toDate));
    }

    case 'pos_daily': {
      const sales = await sajilo.entities.POSSale.list('-sale_date', 2000);
      const map = {};
      sales.filter(s => s.status === 'Completed' && inRange(s.sale_date, fromDate, toDate)).forEach(s => {
        if (!map[s.sale_date]) map[s.sale_date] = { date: s.sale_date, count: 0, total: 0 };
        map[s.sale_date].count++;
        map[s.sale_date].total += s.grand_total || 0;
      });
      return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
    }

    
    case 'sales_by_customer_monthly': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      const map = {};
      invoices.filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(i => {
        const month = i.invoice_date.substring(0, 7); // YYYY-MM
        const key = i.customer_name + '_' + month;
        if (!map[key]) map[key] = { customer: i.customer_name, month, total: 0 };
        map[key].total += i.grand_total || 0;
      });
      return Object.values(map).sort((a, b) => a.customer.localeCompare(b.customer) || a.month.localeCompare(b.month));
    }

    case 'sales_by_item_monthly': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      const map = {};
      invoices.filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(inv => {
        const month = inv.invoice_date.substring(0, 7);
        (inv.line_items || []).forEach(l => {
          const key = (l.item_id || l.item_name) + '_' + month;
          if (!map[key]) map[key] = { item_code: l.item_code, item_name: l.item_name, month, qty_sold: 0, revenue: 0 };
          map[key].qty_sold += l.quantity || 0;
          map[key].revenue += l.line_total || 0;
        });
      });
      return Object.values(map).sort((a, b) => a.item_name.localeCompare(b.item_name) || a.month.localeCompare(b.month));
    }

    case 'ar_aging_summary': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_ar_aging_rpc', { p_company_id });
      if (error) throw error;
      return (data || []).map(r => ({
        customer_name: r.customer_name || 'Unknown',
        bucket: r.bucket,
        grand_total: r.balance
      })).sort((a, b) => b.grand_total - a.grand_total);
    }

    case 'ap_aging_summary': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_ap_aging_rpc', { p_company_id });
      if (error) throw error;
      return (data || []).map(r => ({
        vendor_name: r.vendor_name || 'Unknown',
        bucket: r.bucket,
        grand_total: r.balance
      })).sort((a, b) => b.grand_total - a.grand_total);
    }

    case 'ar_aging': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_ar_aging_rpc', { p_company_id });
      if (error) throw error;
      return (data || []).map(r => ({
        customer_name: r.customer_name || 'Unknown',
        bucket: r.bucket,
        grand_total: r.balance
      })).sort((a, b) => b.grand_total - a.grand_total);
    }

    case 'unpaid_invoices': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      return invoices.filter(i => i.status === 'Posted' && i.payment_status !== 'Paid');
    }

    case 'customer_balance': {
      const p_company_id = sajilo.getCompanyId();
      const [{ data: lines }, { data: customers }] = await Promise.all([
        supabase.from('GeneralLedgerLine').select('entity_id, debit_amount, credit_amount').eq('company_id', p_company_id).eq('entity_type', 'Customer'),
        supabase.from('Customer').select('id, name').eq('company_id', p_company_id)
      ]);
      const cMap = {};
      if (customers) customers.forEach(c => cMap[c.id] = c.name);

      const map = {};
      (lines || []).forEach(l => {
        const id = l.entity_id;
        if (!id) return;
        const name = cMap[id] || 'Unknown';
        if (!map[id]) map[id] = { customer: name, total_invoiced: 0, total_paid: 0, balance: 0 };
        map[id].balance += (l.debit_amount || 0) - (l.credit_amount || 0);
        if (l.debit_amount > 0) map[id].total_invoiced += l.debit_amount;
        if (l.credit_amount > 0) map[id].total_paid += l.credit_amount;
      });
      return Object.values(map).map(r => ({
        ...r,
        total_invoiced: `NPR ${r.total_invoiced.toLocaleString('en-NP', { minimumFractionDigits: 2 })}`,
        total_paid: `NPR ${r.total_paid.toLocaleString('en-NP', { minimumFractionDigits: 2 })}`,
      }));
    }

    case 'ap_aging': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_ap_aging_rpc', { p_company_id });
      if (error) throw error;
      return (data || []).map(r => ({
        customer_name: r.vendor_name || 'Unknown',
        bucket: r.bucket,
        grand_total: r.balance
      })).sort((a, b) => b.grand_total - a.grand_total);
    }

    case 'unpaid_bills': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-invoice_date', 2000);
      return (bills || [])
        .filter(i => i.status === 'Posted' && i.payment_status !== 'Paid')
        .map(i => ({ invoice_number: i.invoice_number, invoice_date: i.invoice_date, customer_name: i.vendor_name, grand_total: i.grand_total, payment_status: i.payment_status }));
    }

    case 'vendor_balance': {
      const p_company_id = sajilo.getCompanyId();
      const [{ data: lines }, { data: vendors }] = await Promise.all([
        supabase.from('GeneralLedgerLine').select('entity_id, debit_amount, credit_amount').eq('company_id', p_company_id).eq('entity_type', 'Vendor'),
        supabase.from('Vendor').select('id, name').eq('company_id', p_company_id)
      ]);
      const vMap = {};
      if (vendors) vendors.forEach(v => vMap[v.id] = v.name);

      const map = {};
      (lines || []).forEach(l => {
        const id = l.entity_id;
        if (!id) return;
        const name = vMap[id] || 'Unknown';
        if (!map[id]) map[id] = { vendor: name, total_billed: 0, total_paid: 0, balance: 0 };
        map[id].balance += (l.credit_amount || 0) - (l.debit_amount || 0);
        if (l.credit_amount > 0) map[id].total_billed += l.credit_amount;
        if (l.debit_amount > 0) map[id].total_paid += l.debit_amount;
      });
      return Object.values(map).map(r => ({
        ...r,
        balance: `NPR ${r.balance.toLocaleString('en-NP', { minimumFractionDigits: 2 })}`,
        total_billed: `NPR ${r.total_billed.toLocaleString('en-NP', { minimumFractionDigits: 2 })}`,
      }));
    }

    case 'vat_summary':
    case 'vat_sales': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      return invoices.filter(i => i.status === 'Posted' && (i.total_tax_amount || 0) > 0 && inRange(i.invoice_date, fromDate, toDate));
    }

    case 'vat_purchases': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-invoice_date', 2000);
      return (bills || []).filter(i => i.status === 'Posted' && (i.vat_amount || 0) > 0 && inRange(i.invoice_date, fromDate, toDate))
        .map(i => ({ ...i, invoice_number: i.invoice_number, invoice_date: i.invoice_date, customer_name: i.vendor_name, goods_subtotal: i.subtotal }));
    }

    case 'gl_summary': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_gl_summary_rpc', {
        p_company_id,
        p_from_date: fromDate,
        p_to_date: toDate
      });
      if (error) throw error;
      return data || [];
    }

    case 'journal_report': {
      const journals = await sajilo.entities.GeneralLedgerJournal.filter({ status: 'Posted' }, 'entry_date', 5000);
      const filteredJournals = journals.filter(j => inRange(j.entry_date?.split('T')[0], fromDate, toDate));
      const jIds = new Set(filteredJournals.map(j => j.id));
      
      let lines = [];
      if (filteredJournals.length > 0) {
        const chunk = 100;
        const validJIds = Array.from(jIds);
        for (let i = 0; i < validJIds.length; i += chunk) {
          const { data } = await supabase.from('GeneralLedgerLine').select('*').in('journal_id', validJIds.slice(i, i + chunk));
          if (data) lines = lines.concat(data);
        }
      }

      const jMap = {};
      filteredJournals.forEach(j => { jMap[j.id] = { ...j, lines: [] }; });
      lines.forEach(l => {
        if (jMap[l.journal_id]) jMap[l.journal_id].lines.push(l);
      });
      return Object.values(jMap).sort((a,b) => a.entry_date.localeCompare(b.entry_date));
    }

    case 'txn_list': {
      const journals = await sajilo.entities.GeneralLedgerJournal.filter({ status: 'Posted' }, 'entry_date', 5000);
      const filteredJournals = journals.filter(j => inRange(j.entry_date?.split('T')[0], fromDate, toDate));
      const jMap = {};
      filteredJournals.forEach(j => { jMap[j.id] = j; });

      let lines = [];
      if (filteredJournals.length > 0) {
        const chunk = 100;
        const validJIds = Object.keys(jMap);
        for (let i = 0; i < validJIds.length; i += chunk) {
          const { data } = await supabase.from('GeneralLedgerLine').select('*').in('journal_id', validJIds.slice(i, i + chunk));
          if (data) lines = lines.concat(data);
        }
      }

      return lines.map(l => {
        const j = jMap[l.journal_id];
        return { ...l, entry_date: j?.entry_date?.split('T')[0] || '', journal_memo: j?.memo || '', voucher_no: j?.voucher_no || '' };
      });
    }

    case 'purchase_summary': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_purchase_summary_rpc', {
        p_company_id, p_from_date: fromDate, p_to_date: toDate
      });
      if (error) throw error;
      return (data || []).map(r => ({ ...r, invoice_date: r.entry_date, grand_total: r.net_expense }));
    }

    case 'purchase_by_vendor': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-invoice_date', 2000);
      const map = {};
      (bills || []).filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(i => {
        if (!map[i.vendor_name]) map[i.vendor_name] = { vendor: i.vendor_name, count: 0, total: 0 };
        map[i.vendor_name].count++;
        map[i.vendor_name].total += i.grand_total || 0;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    }

    case 'purchase_by_item': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-invoice_date', 2000);
      const map = {};
      (bills || []).filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate)).forEach(inv => {
        (inv.line_items || []).forEach(l => {
          const key = l.item_id || l.item_name;
          if (!map[key]) map[key] = { item_code: l.item_code, item_name: l.item_name, qty_bought: 0, cost: 0 };
          map[key].qty_bought += l.quantity || 0;
          map[key].cost += l.line_total || 0;
        });
      });
      return Object.values(map).sort((a, b) => b.cost - a.cost);
    }

    case 'ar_aging_summary': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_ar_aging_rpc', { p_company_id });
      if (error) throw error;
      const map = {};
      (data || []).forEach(r => {
        const cust = r.customer_name || 'Unknown';
        if (!map[cust]) map[cust] = { customer: cust, current: 0, '30d': 0, '60d': 0, '60d+': 0, total: 0 };
        const amt = r.balance;
        map[cust].total += amt;
        if (r.bucket === 'Current') map[cust].current += amt;
        else if (r.bucket === '1–30 days') map[cust]['30d'] += amt;
        else if (r.bucket === '31–60 days') map[cust]['60d'] += amt;
        else map[cust]['60d+'] += amt;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    }

    case 'ap_aging_summary': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_ap_aging_rpc', { p_company_id });
      if (error) throw error;
      const map = {};
      (data || []).forEach(r => {
        const vendor = r.vendor_name || 'Unknown';
        if (!map[vendor]) map[vendor] = { vendor, current: 0, '30d': 0, '60d': 0, '60d+': 0, total: 0 };
        const amt = r.balance;
        map[vendor].total += amt;
        if (r.bucket === 'Current') map[vendor].current += amt;
        else if (r.bucket === '1–30 days') map[vendor]['30d'] += amt;
        else if (r.bucket === '31–60 days') map[vendor]['60d'] += amt;
        else map[vendor]['60d+'] += amt;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    }

    default:
      return [];
  }
}