const fs = require('fs');

const filesToPatch = [
  { path: 'src/pages/sales/SalesInvoices.jsx', fn: 'openNew' },
  { path: 'src/pages/purchase/PurchaseInvoices.jsx', fn: 'openNew' },
  { path: 'src/pages/treasury/FinancialVouchers.jsx', fn: '(() => { setForm({ ...emptyVoucher, voucher_type: searchParams.get("type") || "Receipt" }); setOpen(true); })' },
  { path: 'src/pages/partners/Customers.jsx', fn: 'openNew' },
  { path: 'src/pages/partners/Suppliers.jsx', fn: 'openNew' },
  { path: 'src/pages/inventory/Items.jsx', fn: 'openNew' }
];

for (const { path, fn } of filesToPatch) {
  let content = fs.readFileSync(path, 'utf8');
  
  // Remove the hook from the beginning (which we added in the previous step)
  // Fix the regex to match the exact string, handling potential IIFE syntax
  const hookCodeRegex = /const \[searchParams, setSearchParams\] = useSearchParams\(\);[\s\S]*?setSearchParams\(searchParams, { replace: true }\);\s*}\s*}, \[searchParams, setSearchParams\]\);/g;
  content = content.replace(hookCodeRegex, '');
  
  // Now insert it AFTER the useEffect loadData or fetchData hooks
  const loadDataHookRegex = /useEffect\(\(\) => {[\s\S]*?}, \[\]\);/g;
  let match;
  let lastMatchIndex = 0;
  while ((match = loadDataHookRegex.exec(content)) !== null) {
    lastMatchIndex = match.index + match[0].length;
  }
  
  // If no useEffect found, find the last useState
  if (lastMatchIndex === 0) {
      const useStateRegex = /const \[.*?\] = useState\(.*?\);/g;
      while ((match = useStateRegex.exec(content)) !== null) {
          lastMatchIndex = match.index + match[0].length;
      }
  }
  
  if (lastMatchIndex > 0) {
    const properHookCode = `
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      ${fn === 'openNew' ? 'openNew();' : fn + '();'}
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
`;
    content = content.slice(0, lastMatchIndex) + properHookCode + content.slice(lastMatchIndex);
    fs.writeFileSync(path, content);
    console.log(`Repatched ${path} to move hook down.`);
  } else {
    console.log(`Failed to find injection point for ${path}`);
  }
}
