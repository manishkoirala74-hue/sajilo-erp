const fs = require('fs');

let code = fs.readFileSync('src/lib/reportDataFetcher.js', 'utf8');

const newFetchers = `
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
`;

code = code.replace("case 'ar_aging': {", newFetchers + "\n    case 'ar_aging': {");

fs.writeFileSync('src/lib/reportDataFetcher.js', code);
console.log("Patched reportDataFetcher.js");
