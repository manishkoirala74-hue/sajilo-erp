
const fs = require('fs');
let code = fs.readFileSync('new_pl.js', 'utf8');

const replacements = [
  {
    find: '{sections.opening_stock.accounts.length > 0 && (\n                <>\n                  <tr><td colSpan={4} className=\'px-3 py-1.5 font-medium text-slate-700 pl-4 pt-2\'>Opening Stock</td></tr>\n                  <PLSection sectionObj={sections.opening_stock} />\n                </>\n              )}',
    replace: '<tr><td colSpan={4} className=\'px-3 py-1.5 font-medium text-slate-700 pl-4 pt-2\'>Opening Stock</td></tr>\n              {sections.opening_stock.accounts.length > 0 ? (\n                <PLSection sectionObj={sections.opening_stock} />\n              ) : (\n                <tr className=\'text-slate-500\'><td className=\'px-3 py-1.5 pl-8 border-none italic\'>(No opening stock recorded)</td><td colSpan={3} className=\'border-none\'></td></tr>\n              )}'
  },
  {
    find: '{sections.purchases.accounts.length > 0 && (\n                <>\n                  <tr><td colSpan={4} className=\'px-3 py-1.5 font-medium text-slate-700 pl-4 pt-2\'>Add: Purchases</td></tr>\n                  <PLSection sectionObj={sections.purchases} />\n                </>\n              )}',
    replace: '<tr><td colSpan={4} className=\'px-3 py-1.5 font-medium text-slate-700 pl-4 pt-2\'>Add: Purchases</td></tr>\n              {sections.purchases.accounts.length > 0 ? (\n                <PLSection sectionObj={sections.purchases} />\n              ) : (\n                <tr className=\'text-slate-500\'><td className=\'px-3 py-1.5 pl-8 border-none italic\'>(No purchases recorded)</td><td colSpan={3} className=\'border-none\'></td></tr>\n              )}'
  },
  {
    find: '{sections.cogs_other.accounts.length > 0 && (\n                <>\n                  <tr><td colSpan={4} className=\'px-3 py-1.5 font-medium text-slate-700 pl-4 pt-2\'>Add: Direct Expenses</td></tr>\n                  <PLSection sectionObj={sections.cogs_other} />\n                </>\n              )}',
    replace: '<tr><td colSpan={4} className=\'px-3 py-1.5 font-medium text-slate-700 pl-4 pt-2\'>Add: Direct Expenses</td></tr>\n              {sections.cogs_other.accounts.length > 0 ? (\n                <PLSection sectionObj={sections.cogs_other} />\n              ) : (\n                <tr className=\'text-slate-500\'><td className=\'px-3 py-1.5 pl-8 border-none italic\'>(No direct expenses recorded)</td><td colSpan={3} className=\'border-none\'></td></tr>\n              )}'
  },
  {
    find: '{sections.closing_stock.accounts.length > 0 && (\n                <>\n                  <tr><td colSpan={4} className=\'px-3 py-1.5 font-medium text-slate-700 pl-4 pt-2\'>Less: Closing Stock</td></tr>\n                  <PLSection sectionObj={sections.closing_stock} isDeduction={true} />\n                </>\n              )}',
    replace: '<tr><td colSpan={4} className=\'px-3 py-1.5 font-medium text-slate-700 pl-4 pt-2\'>Less: Closing Stock</td></tr>\n              {sections.closing_stock.accounts.length > 0 ? (\n                <PLSection sectionObj={sections.closing_stock} isDeduction={true} />\n              ) : (\n                <tr className=\'text-slate-500\'><td className=\'px-3 py-1.5 pl-8 border-none italic\'>(No closing stock recorded)</td><td colSpan={3} className=\'border-none\'></td></tr>\n              )}'
  }
];

let replaced = true;
replacements.forEach(r => {
  if(code.indexOf(r.find) === -1) {
    console.log('Failed to find string to replace:', r.find.substring(0, 30));
    replaced = false;
  }
  code = code.replace(r.find, r.replace);
});

if(replaced) {
  fs.writeFileSync('new_pl.js', code);
  let mainCode = fs.readFileSync('src/components/reports/ReportViewer.jsx', 'utf8');
  const startIdx = mainCode.indexOf('function ProfitLossReport({'); 
  const endMarker = '// -- Balance Sheet'; 
  const endIdx = mainCode.indexOf(endMarker); 
  mainCode = mainCode.substring(0, startIdx) + code + '\n\n' + mainCode.substring(endIdx); 
  fs.writeFileSync('src/components/reports/ReportViewer.jsx', mainCode);
  console.log('Successfully made sections unconditional');
}

