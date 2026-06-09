const fs = require('fs');

const orig = fs.readFileSync('scratch_original_gl.js', 'utf8');
let current = fs.readFileSync('src/lib/glPostingService.js', 'utf8');

// Extract from resolveDifferenceInTrialBalance down to warnMissingAccount
const resolveMatch = orig.match(/\/\/ \u2500\u2500\u2500 Resolve "Difference in Trial Balance"[\s\S]*?function warnMissingAccount[^\}]+}/);
const resolveBlock = resolveMatch ? resolveMatch[0] : '';

// Extract from postOpeningStock down to the end
const missingFunctionsMatch = orig.match(/\/\/ \u2500\u2500\u2500 7\. OPENING STOCK \(Import\)[\s\S]+/);
const missingFunctions = missingFunctionsMatch ? missingFunctionsMatch[0] : '';

// Create shim for createJournal
const createJournalShim = `
async function createJournal({ date, description, module, sourceId, sourceType, lines }) {
  let company_id = null;
  try {
    const me = await sajilo.auth.me();
    company_id = me.company_id;
  } catch (e) {
    company_id = sajilo.config?.company_id || null;
  }

  const payload = {
    p_company_id: company_id,
    p_entry_date: date,
    p_description: description,
    p_reference_module: module,
    p_source_document_id: sourceId,
    p_source_document_type: sourceType,
    p_lines: lines.map(l => ({
      account_id: l.account_id,
      debit_amount: Math.round((l.debit_amount || 0) * 100) / 100,
      credit_amount: Math.round((l.credit_amount || 0) * 100) / 100,
      description: l.description || description
    })),
    p_lock_cogs: false // The missing functions don't need COGS locking
  };
  const { data, error } = await sajilo.client.rpc('rpc_post_gl_transaction', payload);
  if (error) { toast.error('GL Error: ' + error.message); throw error; }
  return data;
}
`;

// Clean up current file end
current = current.replace(/\/\/ Additional handlers like postOpeningStock[\s\S]+/, '');

// Stitch everything
fs.writeFileSync('src/lib/glPostingService.js', current + '\n\n' + resolveBlock + '\n\n' + createJournalShim + '\n\n' + missingFunctions);
