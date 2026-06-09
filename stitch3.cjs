const fs = require('fs');
const origLines = fs.readFileSync('scratch_original_gl.js', 'utf8').split('\n');

const missingPart = origLines.slice(557).join('\n');

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
    p_lock_cogs: false
  };
  const { data, error } = await sajilo.client.rpc('rpc_post_gl_transaction', payload);
  if (error) { toast.error('GL Error: ' + error.message); throw error; }
  return data;
}
`;

fs.appendFileSync('src/lib/glPostingService.js', '\n\n' + createJournalShim + '\n\n' + missingPart);
