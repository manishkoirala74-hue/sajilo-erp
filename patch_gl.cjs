const fs = require('fs');
let code = fs.readFileSync('src/lib/glPostingService.js', 'utf8');

// 1. Remove the old sign logic and replace lines.push with a helper function
code = code.replace(/const sign = isReversal \? -1 : 1;/g, '');
code = code.replace(/r2\(sign \* ([^)]+)\)/g, 'r2($1)');
code = code.replace(/r2\(sign \* ([^)]+)\)/g, 'r2($1)');

// Add pushLine helper
const helperCode = `
// Helper to push a line, automatically swapping DR and CR if isReversal is true
function pushLine(lines, isReversal, account_id, account_name, debit_amount, credit_amount, extras = {}) {
  if (isReversal) {
    lines.push({ account_id, account_name, debit_amount: r2(credit_amount), credit_amount: r2(debit_amount), ...extras });
  } else {
    lines.push({ account_id, account_name, debit_amount: r2(debit_amount), credit_amount: r2(credit_amount), ...extras });
  }
}
`;
code = code.replace(/function warnMissingAccount/, helperCode + '\nfunction warnMissingAccount');

// Replace all lines.push({ account_id... }) with pushLine(lines, isReversal, ...)
code = code.replace(/lines\.push\(\{ account_id: ([^,]+), account_name: ([^,]+), debit_amount: ([^,]+), credit_amount: ([^,}]+)(?:, ([^\}]+))? \}\);/g, 
  (match, id, name, dr, cr, extras) => {
    let ex = extras ? extras.trim() : '';
    if (ex) {
      return `pushLine(lines, isReversal, ${id}, ${name}, ${dr}, ${cr}, { ${ex} });`;
    }
    return `pushLine(lines, isReversal, ${id}, ${name}, ${dr}, ${cr});`;
  });

// Fix cost_at_sale fallback
code = code.replace(/cost_at_sale: line\.cost_at_sale\s*\n/g, 'cost_at_sale: line.cost_at_sale || item?.current_unit_cost || item?.weighted_average_cost || 0\n');
code = code.replace(/cost_at_sale: line\.cost_at_sale\s*\}/g, 'cost_at_sale: line.cost_at_sale || item?.current_unit_cost || item?.weighted_average_cost || 0 }');

// Specific fix for postPurchaseReturn / postSalesReturn / postStockAdjustment
// They might not have `isReversal` defined, let's check
fs.writeFileSync('src/lib/glPostingService.js', code);
console.log('Fixed glPostingService.js');
