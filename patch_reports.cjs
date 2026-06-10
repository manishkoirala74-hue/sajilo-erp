const fs = require('fs');
let code = fs.readFileSync('src/lib/reportDataFetcher.js', 'utf8');

// sales_summary
code = code.replace(
  /case 'sales_summary': \{[\s\S]*?return invoices\.filter[^}]+\}/,
  `case 'sales_summary': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_sales_summary_rpc', {
        p_company_id, p_from_date: fromDate, p_to_date: toDate
      });
      if (error) throw error;
      return (data || []).map(r => ({ ...r, invoice_date: r.entry_date, grand_total: r.net_revenue }));
    }`
);

// customer_balance
code = code.replace(
  /case 'customer_balance': \{[\s\S]*?return Object\.values\(map\)\.map\([^}]+\}\)\);\s*\}/,
  `case 'customer_balance': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_customer_balances_rpc', {
        p_company_id, p_from_date: fromDate, p_to_date: toDate
      });
      if (error) throw error;
      return (data || []).map(r => ({
        customer: r.customer_name || 'Unknown',
        balance: r.balance,
        total_invoiced: \`NPR \${r.total_invoiced.toLocaleString('en-NP', { minimumFractionDigits: 2 })}\`,
        total_paid: \`NPR \${r.total_paid.toLocaleString('en-NP', { minimumFractionDigits: 2 })}\`
      }));
    }`
);

// ar_aging
code = code.replace(
  /case 'ar_aging': \{[\s\S]*?\.sort\(\(a, b\) => b\.days_overdue - a\.days_overdue\);\s*\}/,
  `case 'ar_aging': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_ar_aging_rpc', { p_company_id });
      if (error) throw error;
      return (data || []).map(r => ({
        customer_name: r.customer_name || 'Unknown',
        bucket: r.bucket,
        grand_total: r.balance
      })).sort((a, b) => b.grand_total - a.grand_total);
    }`
);

// ar_aging_summary
code = code.replace(
  /case 'ar_aging_summary': \{[\s\S]*?return Object\.values\(map\)\.sort\(\(a, b\) => b\.total - a\.total\);\s*\}/,
  `case 'ar_aging_summary': {
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
    }`
);

// purchase_summary
code = code.replace(
  /case 'purchase_summary': \{[\s\S]*?return \(bills \|\| \[\]\)\.filter[^}]+\}/,
  `case 'purchase_summary': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_purchase_summary_rpc', {
        p_company_id, p_from_date: fromDate, p_to_date: toDate
      });
      if (error) throw error;
      return (data || []).map(r => ({ ...r, invoice_date: r.entry_date, grand_total: r.net_expense }));
    }`
);

// vendor_balance
code = code.replace(
  /case 'vendor_balance': \{[\s\S]*?return Object\.values\(map\)\.map\([^}]+\}\)\);\s*\}/,
  `case 'vendor_balance': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_vendor_balances_rpc', {
        p_company_id, p_from_date: fromDate, p_to_date: toDate
      });
      if (error) throw error;
      return (data || []).map(r => ({
        vendor: r.vendor_name || 'Unknown',
        balance: \`NPR \${r.balance.toLocaleString('en-NP', { minimumFractionDigits: 2 })}\`,
        total_billed: \`NPR \${r.total_billed.toLocaleString('en-NP', { minimumFractionDigits: 2 })}\`
      }));
    }`
);

// ap_aging
code = code.replace(
  /case 'ap_aging': \{[\s\S]*?\.sort\(\(a, b\) => b\.days_overdue - a\.days_overdue\);\s*\}/,
  `case 'ap_aging': {
      const p_company_id = sajilo.getCompanyId();
      const { data, error } = await supabase.rpc('get_ap_aging_rpc', { p_company_id });
      if (error) throw error;
      return (data || []).map(r => ({
        customer_name: r.vendor_name || 'Unknown',
        bucket: r.bucket,
        grand_total: r.balance
      })).sort((a, b) => b.grand_total - a.grand_total);
    }`
);

// ap_aging_summary
code = code.replace(
  /case 'ap_aging_summary': \{[\s\S]*?return Object\.values\(map\)\.sort\(\(a, b\) => b\.total - a\.total\);\s*\}/,
  `case 'ap_aging_summary': {
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
    }`
);

fs.writeFileSync('src/lib/reportDataFetcher.js', code);
console.log('Successfully patched reportDataFetcher.js');
