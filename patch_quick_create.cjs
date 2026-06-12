const fs = require('fs');

const fixQuickCreatePaths = (content) => {
  return content
    .replace(/\/sales\/invoices\/new/g, '/sales/invoices?new=1')
    .replace(/\/purchase\/invoices\/new/g, '/purchase/invoices?new=1')
    .replace(/\/treasury\/vouchers\/new\?type=receipt/g, '/treasury/vouchers?new=1&type=Receipt')
    .replace(/\/treasury\/vouchers\/new\?type=payment/g, '/treasury/vouchers?new=1&type=Payment')
    .replace(/\/accounting\/general-ledger\/new/g, '/treasury/vouchers?new=1&type=Journal')
    .replace(/\/partners\/customers\/new/g, '/partners/customers?new=1')
    .replace(/\/partners\/suppliers\/new/g, '/partners/suppliers?new=1')
    .replace(/\/inventory\/items\/new/g, '/inventory/items?new=1');
};

const mobileSheetPath = 'src/components/layout/MobileActionSheet.jsx';
fs.writeFileSync(mobileSheetPath, fixQuickCreatePaths(fs.readFileSync(mobileSheetPath, 'utf8')));

const desktopModalPath = 'src/components/layout/QuickCreateModal.jsx';
fs.writeFileSync(desktopModalPath, fixQuickCreatePaths(fs.readFileSync(desktopModalPath, 'utf8')));

const filesToPatch = [
  { path: 'src/pages/sales/SalesInvoices.jsx', fn: 'openNew' },
  { path: 'src/pages/purchase/PurchaseInvoices.jsx', fn: 'openNew' },
  { path: 'src/pages/treasury/FinancialVouchers.jsx', fn: '() => { setForm({ ...emptyVoucher, voucher_type: searchParams.get("type") || "Receipt" }); setOpen(true); }' },
  { path: 'src/pages/partners/Customers.jsx', fn: 'openNew' },
  { path: 'src/pages/partners/Suppliers.jsx', fn: 'openNew' },
  { path: 'src/pages/inventory/Items.jsx', fn: 'openNew' }
];

for (const { path, fn } of filesToPatch) {
  let content = fs.readFileSync(path, 'utf8');
  
  // Add import if missing
  if (!content.includes('useSearchParams')) {
    content = content.replace("from 'react-router-dom';", ""); // Clean up potential partials
    const routerImports = "import { useSearchParams } from 'react-router-dom';\n";
    content = routerImports + content;
  }
  
  // Inject the hook at the beginning of the component
  const compNameMatch = content.match(/export default function ([A-Za-z0-9_]+)\(\) {/);
  if (compNameMatch) {
    const compName = compNameMatch[1];
    const hookCode = `
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      ${fn === 'openNew' ? 'openNew();' : fn + '();'}
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
`;
    if (!content.includes("searchParams.get('new')")) {
      content = content.replace(`export default function ${compName}() {`, `export default function ${compName}() {${hookCode}`);
      fs.writeFileSync(path, content);
      console.log(`Patched ${path}`);
    }
  }
}
