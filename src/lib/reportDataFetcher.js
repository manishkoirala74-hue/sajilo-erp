import { sajilo, supabase } from '@/api/sajiloClient';

// Helper to check if a date string falls within range
function inRange(dateStr, from, to) {
  if (!dateStr) return false;
  return dateStr >= from && dateStr <= to;
}

export async function fetchReportData(reportId, fromDate, toDate) {
  switch (reportId) {

    case 'trial_balance': {
      const [accounts, journals, lines] = await Promise.all([
        sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 2000),
        sajilo.entities.GeneralLedgerJournal.filter({ status: 'Posted' }, 'entry_date', 10000),
        sajilo.entities.GeneralLedgerLine.list('', 50000)
      ]);

      const journalMap = {};
      journals.forEach(j => { 
        journalMap[j.id] = j.entry_date ? j.entry_date.split('T')[0] : ''; 
      });
      
      const accountTotals = {};
      lines.forEach(l => {
        const date = journalMap[l.journal_id];
        if (!date) return;
        
        if (!accountTotals[l.account_id]) {
          accountTotals[l.account_id] = { ob_dr: 0, ob_cr: 0, cur_dr: 0, cur_cr: 0 };
        }
        
        if (date < fromDate) {
          accountTotals[l.account_id].ob_dr += (l.debit_amount || 0);
          accountTotals[l.account_id].ob_cr += (l.credit_amount || 0);
        } else if (date >= fromDate && date <= toDate) {
          accountTotals[l.account_id].cur_dr += (l.debit_amount || 0);
          accountTotals[l.account_id].cur_cr += (l.credit_amount || 0);
        }
      });

      return accounts
        .filter(a => a.ledger_type === 'Sub Ledger' && a.account_code && a.account_code !== '—')
        .map(a => {
          const t = accountTotals[a.id] || { ob_dr: 0, ob_cr: 0, cur_dr: 0, cur_cr: 0 };
          const isDebitNormal = ['Asset','COGS','Expense','OPEX','Cost of Goods Sold','Other Expense'].includes(a.account_type);
          
          let ob_dr = 0, ob_cr = 0;
          if (isDebitNormal) {
            ob_dr = Number(a.opening_balance || 0);
          } else {
            ob_cr = Number(a.opening_balance || 0);
          }
          ob_dr += Number(t.ob_dr || 0);
          ob_cr += Number(t.ob_cr || 0);
          
          let net_ob_dr = 0, net_ob_cr = 0;
          const net_ob = ob_dr - ob_cr;
          if (isDebitNormal) {
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
          if (isDebitNormal) {
            if (net_cb >= 0) net_cb_dr = net_cb; else net_cb_cr = -net_cb;
          } else {
            if (net_cb <= 0) net_cb_cr = -net_cb; else net_cb_dr = net_cb;
          }

          return {
            id:           a.id,
            account_code: a.account_code,
            account_name: a.account_name,
            account_type: a.account_type,
            ledger_type:  a.ledger_type,
            parent_account_id: a.parent_account_id,
            opening_debit:  net_ob_dr,
            opening_credit: net_ob_cr,
            current_debit:  cur_dr,
            current_credit: cur_cr,
            closing_debit:  net_cb_dr,
            closing_credit: net_cb_cr,
            _isControlAccount: a._isControlAccount,
          };
        })
        .filter(a => 
          Math.abs(a.opening_debit) > 0.001 || 
          Math.abs(a.opening_credit) > 0.001 || 
          Math.abs(a.current_debit) > 0.001 || 
          Math.abs(a.current_credit) > 0.001 || 
          Math.abs(a.closing_debit) > 0.001 || 
          Math.abs(a.closing_credit) > 0.001
        );
    }

    case 'profit_loss': {
      // Fetch posted journals within date range
      const jRes = await supabase.from('GeneralLedgerJournal').select('id, entry_date').eq('status', 'Posted');
      const journals = jRes.data || [];
      const validJIds = journals.filter(j => inRange(j.entry_date, fromDate, toDate)).map(j => j.id);

      let lines = [];
      if (validJIds.length > 0) {
        // Chunk requests to avoid URL length limits
        const chunk = 100;
        for (let i = 0; i < validJIds.length; i += chunk) {
          const { data } = await supabase.from('GeneralLedgerLine').select('*').in('journal_id', validJIds.slice(i, i + chunk));
          if (data) lines = lines.concat(data);
        }
      }

      const accMap = {};
      lines.forEach(l => {
        if (!accMap[l.account_id]) accMap[l.account_id] = { id: l.account_id, code: l.account_code, name: l.account_name, type: l.account_type, balance: 0 };
        const delta = (l.debit_amount || 0) - (l.credit_amount || 0);
        const isDebitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(l.account_type);
        accMap[l.account_id].balance += (isDebitNormal ? delta : -delta);
      });

      const allAccounts = Object.values(accMap).filter(a => a.balance !== 0);
      const toRow = a => ({ account_code: a.code, account_name: a.name, balance: a.balance });

      const revenue_accounts = allAccounts.filter(a => ['Revenue','Other Income'].includes(a.type)).map(toRow);
      const cogs_accounts    = allAccounts.filter(a => ['COGS','Cost of Goods Sold'].includes(a.type)).map(toRow);
      const opex_accounts    = allAccounts.filter(a => ['OPEX','Expense','Other Expense'].includes(a.type)).map(toRow);

      const revenue = revenue_accounts.reduce((s, a) => s + a.balance, 0);
      const cogs    = cogs_accounts.reduce((s, a) => s + a.balance, 0);
      const opex    = opex_accounts.reduce((s, a) => s + a.balance, 0);
      return { revenue_accounts, cogs_accounts, opex_accounts, revenue, cogs, opex, gross_profit: revenue - cogs, net_profit: revenue - cogs - opex };
    }

    case 'balance_sheet': {
      // Balance sheet sums EVERYTHING up to toDate
      const jRes = await supabase.from('GeneralLedgerJournal').select('id, entry_date').eq('status', 'Posted');
      const journals = jRes.data || [];
      const validJIds = journals.filter(j => !toDate || (new Date(j.entry_date) <= new Date(toDate))).map(j => j.id);

      let lines = [];
      if (validJIds.length > 0) {
        const chunk = 100;
        for (let i = 0; i < validJIds.length; i += chunk) {
          const { data } = await supabase.from('GeneralLedgerLine').select('*').in('journal_id', validJIds.slice(i, i + chunk));
          if (data) lines = lines.concat(data);
        }
      }

      const accMap = {};
      lines.forEach(l => {
        if (!accMap[l.account_id]) accMap[l.account_id] = { id: l.account_id, code: l.account_code, name: l.account_name, type: l.account_type, balance: 0 };
        const delta = (l.debit_amount || 0) - (l.credit_amount || 0);
        const isDebitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(l.account_type);
        accMap[l.account_id].balance += (isDebitNormal ? delta : -delta);
      });

      const allAccounts = Object.values(accMap).filter(a => Math.abs(a.balance) > 0.01);
      const toRow = a => ({ account_code: a.code, account_name: a.name, balance: a.balance });

      const assets      = allAccounts.filter(a => a.type === 'Asset').map(toRow);
      const liabilities = allAccounts.filter(a => a.type === 'Liability').map(toRow);
      const equity      = allAccounts.filter(a => a.type === 'Equity').map(toRow);

      return {
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
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      return invoices.filter(i => i.status === 'Posted' && inRange(i.invoice_date, fromDate, toDate));
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

    case 'ar_aging': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      const today = new Date().toISOString().slice(0, 10);
      return invoices
        .filter(i => i.status === 'Posted' && i.payment_status !== 'Paid')
        .map(i => {
          const due = i.due_date || i.invoice_date;
          const days = due < today ? Math.floor((new Date(today) - new Date(due)) / 86400000) : 0;
          const bucket = days === 0 ? 'Current' : days <= 30 ? '1–30 days' : days <= 60 ? '31–60 days' : '60+ days';
          return { ...i, days_overdue: days, bucket };
        })
        .sort((a, b) => b.days_overdue - a.days_overdue);
    }

    case 'unpaid_invoices': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      return invoices.filter(i => i.status === 'Posted' && i.payment_status !== 'Paid');
    }

    case 'customer_balance': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      const map = {};
      invoices.filter(i => i.status === 'Posted').forEach(i => {
        if (!map[i.customer_name]) map[i.customer_name] = { customer: i.customer_name, total_invoiced: 0, total_paid: 0, balance: 0 };
        map[i.customer_name].total_invoiced += i.grand_total || 0;
        if (i.payment_status === 'Paid') map[i.customer_name].total_paid += i.grand_total || 0;
      });
      return Object.values(map).map(r => ({
        ...r,
        balance: r.total_invoiced - r.total_paid,
        total_invoiced: `NPR ${r.total_invoiced.toLocaleString('en-NP', { minimumFractionDigits: 2 })}`,
        total_paid: `NPR ${r.total_paid.toLocaleString('en-NP', { minimumFractionDigits: 2 })}`,
      }));
    }

    case 'ap_aging': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-bill_date', 2000);
      const today = new Date().toISOString().slice(0, 10);
      return (bills || [])
        .filter(i => i.status === 'Posted' && i.payment_status !== 'Paid')
        .map(i => {
          const due = i.due_date || i.bill_date;
          const days = due < today ? Math.floor((new Date(today) - new Date(due)) / 86400000) : 0;
          const bucket = days === 0 ? 'Current' : days <= 30 ? '1–30 days' : days <= 60 ? '31–60 days' : '60+ days';
          return { invoice_number: i.bill_number, invoice_date: i.bill_date, customer_name: i.vendor_name, due_date: i.due_date, grand_total: i.grand_total, days_overdue: days, bucket, payment_status: i.payment_status };
        })
        .sort((a, b) => b.days_overdue - a.days_overdue);
    }

    case 'unpaid_bills': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-bill_date', 2000);
      return (bills || [])
        .filter(i => i.status === 'Posted' && i.payment_status !== 'Paid')
        .map(i => ({ invoice_number: i.bill_number, invoice_date: i.bill_date, customer_name: i.vendor_name, grand_total: i.grand_total, payment_status: i.payment_status }));
    }

    case 'vendor_balance': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-bill_date', 2000);
      const map = {};
      (bills || []).filter(i => i.status === 'Posted').forEach(i => {
        if (!map[i.vendor_name]) map[i.vendor_name] = { vendor: i.vendor_name, total_billed: 0 };
        map[i.vendor_name].total_billed += i.grand_total || 0;
      });
      return Object.values(map).map(r => ({
        ...r,
        balance: `NPR ${r.total_billed.toLocaleString('en-NP', { minimumFractionDigits: 2 })}`,
        total_billed: `NPR ${r.total_billed.toLocaleString('en-NP', { minimumFractionDigits: 2 })}`,
      }));
    }

    case 'vat_summary':
    case 'vat_sales': {
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      return invoices.filter(i => i.status === 'Posted' && (i.total_tax_amount || 0) > 0 && inRange(i.invoice_date, fromDate, toDate));
    }

    case 'vat_purchases': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-bill_date', 2000);
      return (bills || []).filter(i => i.status === 'Posted' && (i.vat_amount || 0) > 0 && inRange(i.bill_date, fromDate, toDate))
        .map(i => ({ ...i, invoice_number: i.bill_number, invoice_date: i.bill_date, customer_name: i.vendor_name, goods_subtotal: i.subtotal }));
    }

    case 'gl_summary': {
      const [accounts, journals, lines] = await Promise.all([
        sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 2000),
        sajilo.entities.GeneralLedgerJournal.filter({ status: 'Posted' }, 'entry_date', 10000),
        sajilo.entities.GeneralLedgerLine.list('', 50000)
      ]);
      const journalMap = {};
      journals.forEach(j => { journalMap[j.id] = j.entry_date ? j.entry_date.split('T')[0] : ''; });
      
      const accountTotals = {};
      lines.forEach(l => {
        const date = journalMap[l.journal_id];
        if (!date || !inRange(date, fromDate, toDate)) return;
        if (!accountTotals[l.account_id]) accountTotals[l.account_id] = { dr: 0, cr: 0 };
        accountTotals[l.account_id].dr += (l.debit_amount || 0);
        accountTotals[l.account_id].cr += (l.credit_amount || 0);
      });

      return accounts.map(a => ({
        ...a,
        debit: accountTotals[a.id]?.dr || 0,
        credit: accountTotals[a.id]?.cr || 0
      })).filter(a => a.debit > 0 || a.credit > 0);
    }

    case 'journal_report': {
      const [journals, lines] = await Promise.all([
        sajilo.entities.GeneralLedgerJournal.filter({ status: 'Posted' }, 'entry_date', 5000),
        sajilo.entities.GeneralLedgerLine.list('', 20000)
      ]);
      const filteredJournals = journals.filter(j => inRange(j.entry_date?.split('T')[0], fromDate, toDate));
      const jIds = new Set(filteredJournals.map(j => j.id));
      const jMap = {};
      filteredJournals.forEach(j => { jMap[j.id] = { ...j, lines: [] }; });
      lines.forEach(l => {
        if (jIds.has(l.journal_id)) jMap[l.journal_id].lines.push(l);
      });
      return Object.values(jMap).sort((a,b) => a.entry_date.localeCompare(b.entry_date));
    }

    case 'txn_list': {
      const [journals, lines] = await Promise.all([
        sajilo.entities.GeneralLedgerJournal.filter({ status: 'Posted' }, 'entry_date', 5000),
        sajilo.entities.GeneralLedgerLine.list('', 20000)
      ]);
      const jMap = {};
      journals.forEach(j => { jMap[j.id] = j; });
      return lines.map(l => {
        const j = jMap[l.journal_id];
        return { ...l, entry_date: j?.entry_date?.split('T')[0] || '', journal_memo: j?.memo || '', voucher_no: j?.voucher_no || '' };
      }).filter(l => inRange(l.entry_date, fromDate, toDate));
    }

    case 'purchase_summary': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-bill_date', 2000);
      return (bills || []).filter(i => i.status === 'Posted' && inRange(i.bill_date, fromDate, toDate));
    }

    case 'purchase_by_vendor': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-bill_date', 2000);
      const map = {};
      (bills || []).filter(i => i.status === 'Posted' && inRange(i.bill_date, fromDate, toDate)).forEach(i => {
        if (!map[i.vendor_name]) map[i.vendor_name] = { vendor: i.vendor_name, count: 0, total: 0 };
        map[i.vendor_name].count++;
        map[i.vendor_name].total += i.grand_total || 0;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    }

    case 'purchase_by_item': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-bill_date', 2000);
      const map = {};
      (bills || []).filter(i => i.status === 'Posted' && inRange(i.bill_date, fromDate, toDate)).forEach(inv => {
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
      const invoices = await sajilo.entities.SalesInvoice.list('-invoice_date', 2000);
      const today = new Date().toISOString().slice(0, 10);
      const map = {};
      invoices.filter(i => i.status === 'Posted' && i.payment_status !== 'Paid').forEach(i => {
        const due = i.due_date || i.invoice_date;
        const days = due < today ? Math.floor((new Date(today) - new Date(due)) / 86400000) : 0;
        const cust = i.customer_name || 'Unknown';
        if (!map[cust]) map[cust] = { customer: cust, current: 0, '30d': 0, '60d': 0, '60d+': 0, total: 0 };
        const amt = i.grand_total || 0;
        map[cust].total += amt;
        if (days === 0) map[cust].current += amt;
        else if (days <= 30) map[cust]['30d'] += amt;
        else if (days <= 60) map[cust]['60d'] += amt;
        else map[cust]['60d+'] += amt;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    }

    case 'ap_aging_summary': {
      const bills = await sajilo.entities.PurchaseInvoice.list('-bill_date', 2000);
      const today = new Date().toISOString().slice(0, 10);
      const map = {};
      (bills || []).filter(i => i.status === 'Posted' && i.payment_status !== 'Paid').forEach(i => {
        const due = i.due_date || i.bill_date;
        const days = due < today ? Math.floor((new Date(today) - new Date(due)) / 86400000) : 0;
        const vendor = i.vendor_name || 'Unknown';
        if (!map[vendor]) map[vendor] = { vendor, current: 0, '30d': 0, '60d': 0, '60d+': 0, total: 0 };
        const amt = i.grand_total || 0;
        map[vendor].total += amt;
        if (days === 0) map[vendor].current += amt;
        else if (days <= 30) map[vendor]['30d'] += amt;
        else if (days <= 60) map[vendor]['60d'] += amt;
        else map[vendor]['60d+'] += amt;
      });
      return Object.values(map).sort((a, b) => b.total - a.total);
    }

    default:
      return [];
  }
}