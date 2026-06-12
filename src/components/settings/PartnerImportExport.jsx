import { useState, useRef } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { provisionPartnerLedgers } from '@/lib/partnerLedgerService';
import { Upload, Download, CheckCircle2, XCircle, AlertTriangle, X, RefreshCw, Users, Truck, AlertCircle as AlertCircleIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import SearchableSelect from '@/components/shared/SearchableSelect';

// ── Template definitions ──────────────────────────────────────────────────────

const PARTNER_TEMPLATE_HEADERS = [
  'Partner Name', 'Tax PAN Number', 'Contact Number', 'City',
  'Billing Address', 'Opening Balance', 'Balance Type (Dr/Cr)',
  'Cross-Over (Treated as Vendor / Treat as Customer)'
];

const CUSTOMER_EXAMPLE = [
  'Ram Traders Pvt Ltd', '301234567', '9841000001', 'Kathmandu',
  'New Baneshwor, Kathmandu', '50000', 'Dr', 'FALSE'
];

const SUPPLIER_EXAMPLE = [
  'Himalayan Suppliers Ltd', '401234567', '9851000001', 'Pokhara',
  'Lakeside, Pokhara', '75000', 'Cr', 'FALSE'
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadCSV(filename, rows) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') inQ = !inQ;
      else if (line[i] === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += line[i];
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').replace(/^"|"$/g, '').trim(); });
    return obj;
  }).filter(r => Object.values(r).some(v => v));
}

// ── Opening balance journal poster ───────────────────────────────────────────

async function postOpeningBalanceJournal({ partner, isCustomer, journalDate, obAmount, balType, offsetAccount }) {
  const amount = Number(obAmount || 0);
  if (amount <= 0) return false;

  const equityAccId   = offsetAccount.id;
  const equityAccName = offsetAccount.account_name;

  // balType 'Dr' = partner owes us (normal for customers), 'Cr' = we owe partner (normal for suppliers)
  const isDebitBalance = (balType || 'Dr').toUpperCase().startsWith('D');

  let lines;
  if (isCustomer) {
    const arAccId = partner.receivable_account_id;
    if (!arAccId) return false;
    if (isDebitBalance) {
      // Normal customer: DR Customer Ledger / CR Difference in Trial Balance
      lines = [
        { account_id: arAccId,      account_name: partner.receivable_account_name || partner.name, debit_amount: amount, credit_amount: 0,      description: `Opening balance: ${partner.name}` },
        { account_id: equityAccId,  account_name: equityAccName,                                   debit_amount: 0,      credit_amount: amount,  description: `Opening balance: ${partner.name}` },
      ];
    } else {
      // Credit balance customer: DR Difference in Trial Balance / CR Customer Ledger
      lines = [
        { account_id: equityAccId,  account_name: equityAccName,                                   debit_amount: amount, credit_amount: 0,      description: `Opening balance: ${partner.name}` },
        { account_id: arAccId,      account_name: partner.receivable_account_name || partner.name, debit_amount: 0,      credit_amount: amount,  description: `Opening balance: ${partner.name}` },
      ];
    }
  } else {
    const apAccId = partner.payable_account_id;
    if (!apAccId) return false;
    if (!isDebitBalance) {
      // Normal supplier: DR Difference in Trial Balance / CR Supplier Ledger
      lines = [
        { account_id: equityAccId,  account_name: equityAccName,                                 debit_amount: amount, credit_amount: 0,      description: `Opening balance: ${partner.name}` },
        { account_id: apAccId,      account_name: partner.payable_account_name || partner.name,  debit_amount: 0,      credit_amount: amount,  description: `Opening balance: ${partner.name}` },
      ];
    } else {
      // Debit balance supplier: DR Supplier Ledger / CR Difference in Trial Balance
      lines = [
        { account_id: apAccId,      account_name: partner.payable_account_name || partner.name,  debit_amount: amount, credit_amount: 0,      description: `Opening balance: ${partner.name}` },
        { account_id: equityAccId,  account_name: equityAccName,                                 debit_amount: 0,      credit_amount: amount,  description: `Opening balance: ${partner.name}` },
      ];
    }
  }

  const journal = await sajilo.entities.GeneralLedgerJournal.create({
    entry_date: journalDate || new Date().toISOString().slice(0, 10),
    description: `Opening Balance — ${partner.name}`,
    reference_module: 'General',
    source_document_id: partner.id,
    source_document_type: 'BusinessPartner',
    status: 'Posted',
    total_debit: amount,
    total_credit: amount,
    is_balanced: true,
  });

  await sajilo.entities.GeneralLedgerLine.bulkCreate(
    lines.map(l => ({ journal_id: journal.id, ...l }))
  );

  // Update COA running balances for both lines
  for (const l of lines) {
    if (!l.account_id) continue;
    const accs = await sajilo.entities.ChartOfAccount.filter({ id: l.account_id }, 'account_code', 1);
    const acc = accs[0];
    if (!acc) continue;
    const debitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(acc.account_type);
    const delta = l.debit_amount - l.credit_amount;
    const change = debitNormal ? delta : -delta;
    await sajilo.entities.ChartOfAccount.update(acc.id, {
      current_balance: Math.round(((acc.current_balance || 0) + change) * 100) / 100,
    });
  }

  return true;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PartnerImportExport() {
  const [importType, setImportType] = useState('Customers'); // 'Customers' | 'Suppliers'
  const [step, setStep] = useState('idle');
  const [parsedRows, setParsedRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [offsetAccountId, setOffsetAccountId] = useState('');
  const [existingByTaxId, setExistingByTaxId] = useState({});
  const [existingByName, setExistingByName] = useState({});
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [duplicateAction, setDuplicateAction] = useState('skip');
  const fileRef = useRef();

  const isCustomer = importType === 'Customers';

  const totalDebitBalances = parsedRows.reduce((sum, row) => {
    if (errors.some(e => e.includes(`Row ${parsedRows.indexOf(row) + 2}:`))) return sum;
    const ob = Number(row['Opening Balance']) || 0;
    const isDr = (row['Balance Type (Dr/Cr)'] || 'Dr').toUpperCase().startsWith('D');
    return sum + (isDr ? ob : 0);
  }, 0);

  const totalCreditBalances = parsedRows.reduce((sum, row) => {
    if (errors.some(e => e.includes(`Row ${parsedRows.indexOf(row) + 2}:`))) return sum;
    const ob = Number(row['Opening Balance']) || 0;
    const isCr = (row['Balance Type (Dr/Cr)'] || 'Dr').toUpperCase().startsWith('C');
    return sum + (isCr ? ob : 0);
  }, 0);

  const requiresJournal = totalDebitBalances > 0 || totalCreditBalances > 0;
  const isBalanced = !requiresJournal || !!offsetAccountId;

  const offsetAccountOpts = accounts.filter(a => a.ledger_type === 'Sub Ledger' && a.is_active !== false).map(a => ({
    value: a.id, label: a.account_name, sub: a.account_code
  }));

  const handleDownloadTemplate = () => {
    const example = isCustomer ? CUSTOMER_EXAMPLE : SUPPLIER_EXAMPLE;
    downloadCSV(`${importType.toLowerCase()}_import_template.csv`, [PARTNER_TEMPLATE_HEADERS, example]);
    toast.success('Template downloaded!');
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStep('validating');
    setErrors([]);

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      setErrors(['The file appears to be empty or has no data rows.']);
      setStep('review');
      fileRef.current.value = '';
      return;
    }

    const errs = [];
    rows.forEach((row, i) => {
      const num = i + 2;
      if (!row['Partner Name']?.trim()) errs.push(`Row ${num}: "Partner Name" is required.`);
      const ob = row['Opening Balance'];
      if (ob && isNaN(Number(ob))) {
        errs.push(`Row ${num}: "Opening Balance" must be a valid number.`);
      } else if (ob && Number(ob) < 0) {
        errs.push(`Row ${num}: "Opening Balance" cannot be negative.`);
      }
      const bt = (row['Balance Type (Dr/Cr)'] || '').toUpperCase();
      if (ob && Number(ob) > 0 && bt && bt !== 'DR' && bt !== 'CR') {
        errs.push(`Row ${num}: "Balance Type" must be Dr or Cr.`);
      }
    });

    setParsedRows(rows);
    setErrors(errs);
    
    if (rows.length > 0) {
      // Only fetch active Sub Ledgers to save bandwidth and speed up validation
      const allAccounts = await sajilo.entities.ChartOfAccount.filter({ ledger_type: 'Sub Ledger', is_active: true }, 'account_name', 2000);
      setAccounts(allAccounts);

      // Fetch existing partners for duplicate detection
      const existing = await sajilo.entities.BusinessPartner.list('-created_date', 5000);
      const byTaxId = {};
      const byName = {};
      existing.forEach(p => { 
        if (p.tax_id_number) byTaxId[p.tax_id_number.trim()] = p; 
        if (p.name) byName[p.name.trim().toLowerCase()] = p;
      });
      setExistingByTaxId(byTaxId);
      setExistingByName(byName);

      let dupes = 0;
      rows.forEach(r => {
        const tId = r['Tax PAN Number']?.trim();
        const pName = r['Partner Name']?.trim()?.toLowerCase();
        if ((tId && byTaxId[tId]) || (pName && byName[pName])) dupes++;
      });
      setDuplicateCount(dupes);
    }
    
    setStep('review');
    fileRef.current.value = '';
  };

  const handleImport = async () => {
    setStep('importing');
    const user = await sajilo.auth.me();
    const settingsList = await sajilo.entities.CompanySettings.list();
    const settings = settingsList[0] || {};

    const groupId = isCustomer ? settings.gl_customer_ledger_group_id : settings.gl_supplier_ledger_group_id;
    const byTaxId = existingByTaxId;
    const byName = existingByName;

    let created = 0, updated = 0, failed = 0, skipped = 0, ledgersGen = 0, journalsPosted = 0;
    const errorLog = [...errors];
    const errorRows = new Set(errors.map(e => { const m = e.match(/^Row (\d+):/); return m ? Number(m[1]) - 2 : -1; }));

    // Helper to process a single row
    const processRow = async (i) => {
      if (errorRows.has(i)) return { status: 'failed' };
      const row = parsedRows[i];
      const partnerName = row['Partner Name']?.trim();
      const taxId = row['Tax PAN Number']?.trim();
      const obAmount = Number(row['Opening Balance'] || 0);
      const balType = (row['Balance Type (Dr/Cr)'] || 'Dr').toUpperCase().startsWith('C') ? 'Cr' : 'Dr';
      const journalDate = new Date().toISOString().slice(0, 10);
      const crossOver = ['true', '1', 'yes'].includes((row['Cross-Over (Treated as Vendor / Treat as Customer)'] || '').toLowerCase().trim());

      const basePayload = {
        name: partnerName,
        tax_id_number: taxId || undefined,
        phone: row['Contact Number']?.trim() || undefined,
        city: row['City']?.trim() || undefined,
        address: row['Billing Address']?.trim() || undefined,
        opening_balance: obAmount,
        opening_balance_type: balType,
        opening_balance_date: journalDate,
        is_customer: isCustomer || crossOver,
        is_vendor: !isCustomer || crossOver,
        treat_as_customer: !isCustomer && crossOver,
        treated_as_vendor: isCustomer && crossOver,
        is_active: true,
      };
      Object.keys(basePayload).forEach(k => basePayload[k] === undefined && delete basePayload[k]);

      try {
        const tIdMatch = taxId ? byTaxId[taxId] : null;
        const nameMatch = partnerName ? byName[partnerName.toLowerCase()] : null;
        const existingPartner = tIdMatch || nameMatch;
        let lGen = 0, jPosted = 0, act = '';

        if (existingPartner) {
          if (duplicateAction === 'skip') {
            return { status: 'skipped' };
          } else {
            await sajilo.entities.BusinessPartner.update(existingPartner.id, {
              phone: basePayload.phone,
              city: basePayload.city,
              address: basePayload.address,
            });
            act = 'updated';
          }
        } else {
          const partner = await sajilo.entities.BusinessPartner.create(basePayload);
          let ledgerUpdates = {};

          if (groupId) {
            const ledgerUpdates = await provisionPartnerLedgers(basePayload, settings);
            if (Object.keys(ledgerUpdates).length > 0) {
              await sajilo.entities.BusinessPartner.update(partner.id, ledgerUpdates);
              Object.assign(partner, ledgerUpdates);
              lGen += (ledgerUpdates.receivable_account_id && !ledgerUpdates.payable_account_id) || (ledgerUpdates.payable_account_id && !ledgerUpdates.receivable_account_id) ? 1 : (ledgerUpdates.receivable_account_id === ledgerUpdates.payable_account_id ? 1 : 2);
            }
          }

          }

          if (obAmount > 0) {
            const offsetAccount = accounts.find(a => a.id === offsetAccountId);
            const posted = await postOpeningBalanceJournal({ partner, isCustomer, journalDate, obAmount, balType, offsetAccount });
            if (posted) jPosted++;
          }
          act = 'created';
        }
        return { status: act, lGen, jPosted };
      } catch (err) {
        return { status: 'error', rowNum: i + 2, name: partnerName, msg: err?.message || '' };
      }
    };

    // Process in batches of 5 to avoid overwhelming the database while still parallelizing
    const batchSize = 5;
    for (let i = 0; i < parsedRows.length; i += batchSize) {
      const batchIndices = [];
      for (let j = 0; j < batchSize && i + j < parsedRows.length; j++) {
        batchIndices.push(i + j);
      }
      
      const results = await Promise.all(batchIndices.map(idx => processRow(idx)));
      
      for (const res of results) {
        if (res.status === 'failed') {
          failed++;
        } else if (res.status === 'error') {
          failed++;
          errorLog.push(`Row ${res.rowNum}: Failed to import "${res.name}". ${res.msg}`);
        } else if (res.status === 'created') {
          created++;
          ledgersGen += res.lGen || 0;
          journalsPosted += res.jPosted || 0;
        } else if (res.status === 'updated') {
          updated++;
        } else if (res.status === 'skipped') {
          skipped++;
        }
      }
    }

    const status = failed > 0 && created + updated === 0 ? 'Failed' : failed > 0 ? 'Partial' : 'Success';
    const summaryMsg = `User [${user?.email || 'Unknown'}] executed a Bulk ${importType} Import. Added ${created}, Updated ${updated}, Skipped ${skipped} ${importType}. Auto-generated ${ledgersGen} accounting ledgers and posted ${journalsPosted} opening balance journals.`;

    await sajilo.entities.PartnerImportLog.create({
      file_name: fileName,
      imported_by: user?.email || 'Unknown',
      import_type: importType,
      import_date: new Date().toISOString(),
      total_rows: parsedRows.length,
      created_count: created,
      updated_count: updated,
      failed_count: failed,
      ledgers_generated: ledgersGen,
      journals_posted: journalsPosted,
      status,
      errors: errorLog.slice(0, 50),
      summary_message: summaryMsg,
    });

    setResult({ created, updated, failed, skipped, ledgersGen, journalsPosted, status, errors: errorLog });
    setStep('done');
  };

  const reset = () => {
    setStep('idle'); setParsedRows([]); setErrors([]);
    setResult(null); setFileName('');
    setOffsetAccountId('');
    setDuplicateCount(0);
    setDuplicateAction('skip');
    setExistingByTaxId({});
    setExistingByName({});
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
        <Users className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground text-sm">Partner Import (Customers & Suppliers)</h3>
      </div>

      <div className="p-5 space-y-5">
        {/* Import Type Selector */}
        <div className="flex gap-2">
          {['Customers', 'Suppliers'].map(type => (
            <button key={type} onClick={() => { setImportType(type); reset(); }}
              className={cn('flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                importType === type
                  ? 'bg-primary text-white border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted/40')}>
              {type === 'Customers' ? <Users className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
              {type}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" className="border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-blue-500/10"
            onClick={() => fileRef.current?.click()} disabled={step === 'validating' || step === 'importing'}>
            <Upload className="w-4 h-4 mr-1.5" /> Import {importType}
          </Button>
          <Button variant="outline" className="border-green-200 dark:border-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-50 dark:bg-green-500/10"
            onClick={handleDownloadTemplate}>
            <Download className="w-4 h-4 mr-1.5" /> Download Template
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
        </div>

        <p className="text-xs text-muted-foreground">
          Download the template, fill in your {importType.toLowerCase()} data, then upload to bulk-import.
          Duplicate detection is by <strong>Tax PAN Number</strong> or <strong>Partner Name</strong>. New partners will have sub-ledgers auto-generated and opening balance journals posted automatically.
        </p>

        {/* Template column hints */}
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-xs font-semibold text-foreground mb-1.5">Template Columns:</p>
          <div className="flex flex-wrap gap-1.5">
            {PARTNER_TEMPLATE_HEADERS.map(h => (
              <span key={h} className="text-xs bg-card border border-border rounded px-2 py-0.5 font-mono text-muted-foreground">{h}</span>
            ))}
          </div>
        </div>

        {/* Validating */}
        {step === 'validating' && (
          <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm">Validating "{fileName}"…</span>
          </div>
        )}

        {/* Importing */}
        {step === 'importing' && (
          <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-400">Importing {importType}… generating ledgers and posting journals, please wait.</span>
          </div>
        )}

        {/* Review */}
        {step === 'review' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Review: {fileName}</h4>
              <Button variant="ghost" size="sm" onClick={reset}><X className="w-4 h-4 mr-1" /> Cancel</Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-foreground">{parsedRows.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total Rows</p>
              </div>
              <div className={cn('rounded-lg p-3 text-center', errors.length > 0 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10')}>
                <p className={cn('text-xl font-bold', errors.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>{errors.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Validation Errors</p>
              </div>
            </div>

            {errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-4 space-y-1.5 max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4" /> Validation Errors — fix in your file and re-upload:
                </p>
                {errors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400 pl-5">• {e}</p>)}
              </div>
            )}

            {duplicateCount > 0 && errors.length === 0 && (
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Duplicate Detection
                </h4>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 mb-3">
                  We found <strong>{duplicateCount}</strong> records in your file with Tax PAN Numbers or Names that already exist in the system.
                </p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="dupAction" value="skip" checked={duplicateAction === 'skip'} onChange={() => setDuplicateAction('skip')} className="accent-amber-600" />
                    Skip duplicates
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="dupAction" value="override" checked={duplicateAction === 'override'} onChange={() => setDuplicateAction('override')} className="accent-amber-600" />
                    Update existing data
                  </label>
                </div>
              </div>
            )}

            {/* Journal Mapping Section */}
            {requiresJournal && errors.length === 0 && (
              <div className="bg-muted/10 border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold mb-2">Double-Entry Journal Validation</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  This import will create a total of <strong className="font-mono">NPR {totalDebitBalances.toLocaleString()}</strong> in Debits and <strong className="font-mono">NPR {totalCreditBalances.toLocaleString()}</strong> in Credits across individual partner ledgers.
                  Select an offsetting account to balance these individual transactions.
                </p>
                <div className="bg-card border rounded-lg text-sm mb-3">
                  <div className="grid grid-cols-12 gap-2 bg-muted/30 px-3 py-2 font-medium text-xs border-b">
                    <div className="col-span-12">Offset Account Selection</div>
                  </div>
                  <div className="p-3">
                    <SearchableSelect
                      value={offsetAccountId}
                      onValueChange={setOffsetAccountId}
                      options={offsetAccountOpts}
                      placeholder="Select Offset Account (e.g. Opening Balance Equity, Retained Earnings)"
                    />
                  </div>
                </div>
                {!offsetAccountId && (
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-medium">
                    <AlertCircleIcon className="w-4 h-4" /> Please select an offsetting account to proceed.
                  </div>
                )}
                {offsetAccountId && (
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                    <CheckCircle2 className="w-4 h-4" /> Ready to post individual journals balanced against the selected account.
                  </div>
                )}
              </div>
            )}

            {errors.length === 0 ? (
              <Button onClick={handleImport} className="w-full" disabled={!isBalanced}>
                <Upload className="w-4 h-4 mr-2" />
                Import {parsedRows.length} {importType}
              </Button>
            ) : (
              <Button variant="outline" onClick={reset} className="w-full">Fix errors and re-upload</Button>
            )}
          </div>
        )}

        {/* Done */}
        {step === 'done' && result && (
          <div className="space-y-4">
            <div className={cn('flex items-center gap-3 p-4 rounded-lg border',
              result.status === 'Success' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
              : result.status === 'Partial' ? 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20')}>
              {result.status === 'Success'
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                : <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0" />}
              <div>
                <p className="text-sm font-semibold">
                  {result.status === 'Success' ? 'Import completed!' : result.status === 'Partial' ? 'Completed with issues.' : 'Import failed.'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.created} created · {result.updated} updated · {result.skipped} skipped · {result.failed} failed ·{' '}
                  {result.ledgersGen} ledgers generated · {result.journalsPosted} journals posted
                </p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3 max-h-36 overflow-y-auto">
                {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">• {e}</p>)}
              </div>
            )}
            <Button variant="outline" onClick={reset} className="w-full">Import Another File</Button>
          </div>
        )}
      </div>
    </div>
  );
}