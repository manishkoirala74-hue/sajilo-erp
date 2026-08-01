const fs = require('fs');
const files = [
  'src/components/settings/ItemImportExport.jsx',
  'src/components/settings/PartnerImportExport.jsx',
  'src/pages/Dashboard-Corporate-Admin.jsx',
  'src/pages/reports/PriceRevisionHistory.jsx',
  'src/pages/reports/PurchasePriceChangeHistory.jsx',
  'src/pages/sales/Quotations.jsx',
  'src/pages/sales/SalesInvoices.jsx',
  'src/pages/treasury/FinancialVouchers.jsx'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    
    // Add print:hidden to <Button tags if they don't have it
    content = content.replace(/(<Button[^>]*?)(>)/gi, (match, p1, p2) => {
      if (p1.includes('print:hidden')) return match;
      if (p1.includes('className=')) {
        return p1.replace(/className=(['\"])(.*?)\1/, 'className=\\ print:hidden\') + p2;
      } else {
        return p1 + ' className="print:hidden"' + p2;
      }
    });

    // For plain <button> elements
    content = content.replace(/(<button[^>]*?)(>)/gi, (match, p1, p2) => {
      if (p1.includes('print:hidden')) return match;
      if (p1.includes('className=')) {
        return p1.replace(/className=(['\"])(.*?)\1/, 'className=\\ print:hidden\') + p2;
      } else {
        return p1 + ' className="print:hidden"' + p2;
      }
    });

    fs.writeFileSync(f, content);
    console.log('Processed', f);
  }
});
