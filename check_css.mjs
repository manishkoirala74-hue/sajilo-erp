import fs from 'fs';

const code = fs.readFileSync('d:/OneDrive/E-Book/Google Antigravity/erp-sajilo/src/components/reports/FinancialReportTable.jsx', 'utf8');

if (code.includes('hidden md:table-cell') || code.includes('sm:hidden')) {
  console.log("CSS hidden classes found!");
} else {
  console.log("No hidden classes found in table.");
}
