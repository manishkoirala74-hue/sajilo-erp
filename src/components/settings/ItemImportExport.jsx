import { useState, useRef, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { postBulkOpeningStock, rollbackBulkImport, loadSettings } from '@/lib/glPostingService';
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, X, RefreshCw, AlertCircle as AlertCircleIcon, Undo2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import SearchableSelect from '@/components/shared/SearchableSelect';
import PartnerImportExport from '@/components/settings/PartnerImportExport';
import { format } from 'date-fns';

// CSV template columns - matches Item entity
const TEMPLATE_HEADERS = [
  'item_name', 'item_code', 'item_type', 'category_name',
  'unit_of_measure', 'purchase_uom', 'sales_uom',
  'selling_price', 'purchase_price', 'quantity_on_hand', 'reorder_level',
  'is_vat_applicable', 'is_active', 'barcode', 'hs_code', 'description',
  'purchase_account_name', 'sales_account_name', 'inventory_account_name', 'discount_scheme_name'
];

const EXAMPLE_ROW = [
  'Laptop HP ProBook', 'LAP-002', 'Product', 'IT Equipment',
  'PCS', '', '',
  '85000', '72000', '10', '5',
  'TRUE', 'TRUE', '', '8471.30', 'Sample laptop description',
  '', '', '', ''
];

const ITEM_TYPES = ['Product', 'Service', 'Raw Material', 'Semi-Finished Good', 'Finished Good'];

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
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase().replace(/ /g, '_'));
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
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

function validateRow(row, index, existingNames, existingCodes, catMap, uomSet) {
  const errors = [];
  const rowNum = index + 2; // 1-indexed + header

  if (!row.item_name?.trim()) errors.push(`Row ${rowNum}: Item Name is required.`);
  if (!row.selling_price || isNaN(Number(row.selling_price))) errors.push(`Row ${rowNum}: Selling Price must be a valid number.`);
  if (!row.purchase_price || isNaN(Number(row.purchase_price))) errors.push(`Row ${rowNum}: Purchase Price must be a valid number.`);
  if (row.quantity_on_hand !== '' && isNaN(Number(row.quantity_on_hand))) errors.push(`Row ${rowNum}: Quantity on Hand must be a number.`);
  if (Number(row.quantity_on_hand) < 0) errors.push(`Row ${rowNum}: Quantity on Hand cannot be negative.`);
  if (row.reorder_level !== '' && isNaN(Number(row.reorder_level))) errors.push(`Row ${rowNum}: Reorder Level must be a number.`);
  if (row.item_type && !ITEM_TYPES.includes(row.item_type)) errors.push(`Row ${rowNum}: Item Type "${row.item_type}" is not valid. Use: ${ITEM_TYPES.join(', ')}.`);
  if (!row.unit_of_measure?.trim()) errors.push(`Row ${rowNum}: Unit of Measure is required (e.g. PCS, KG, BOX).`);

  if (row.category_name?.trim()) {
    const cat = catMap[row.category_name.trim().toLowerCase()];
    if (!cat) {
      errors.push(`Row ${rowNum}: Category "${row.category_name}" does not exist. Please create it first.`);
    } else {
      row._category_id = cat.id; // Map the ID for the import payload
    }
  }

  if (row.unit_of_measure?.trim() && !uomSet.has(row.unit_of_measure.trim().toLowerCase())) {
    errors.push(`Row ${rowNum}: Unit of Measure "${row.unit_of_measure}" is not valid. Please create it in settings.`);
  }
  if (row.purchase_uom?.trim() && !uomSet.has(row.purchase_uom.trim().toLowerCase())) {
    errors.push(`Row ${rowNum}: Purchase UOM "${row.purchase_uom}" is not valid.`);
  }
  if (row.sales_uom?.trim() && !uomSet.has(row.sales_uom.trim().toLowerCase())) {
    errors.push(`Row ${rowNum}: Sales UOM "${row.sales_uom}" is not valid.`);
  }

  return errors;
}

function ItemImportCard({ onImportCompleted }) {
  const [step, setStep] = useState('idle'); // idle | validating | review | importing | done
  const [parsedRows, setParsedRows] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [duplicates, setDuplicates] = useState([]); // [{row, existing}]
  const [overrideAll, setOverrideAll] = useState(false);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [offsetAccountId, setOffsetAccountId] = useState('');
  const [inventoryAccountId, setInventoryAccountId] = useState('');
  const fileRef = useRef();

  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);

  const totalOpeningStockValue = parsedRows.reduce((sum, row) => {
    if (validationErrors.some(e => e.includes(`Row ${parsedRows.indexOf(row) + 2}:`))) return sum;
    const qty = Number(row.quantity_on_hand) || 0;
    const price = Number(row.purchase_price) || 0;
    return sum + (qty * price);
  }, 0);
  
  const requiresJournal = totalOpeningStockValue > 0;
  const isBalanced = !requiresJournal || (!!offsetAccountId && !!inventoryAccountId);

  const subLedgerOpts = accounts.filter(a => a.ledger_type === 'Sub Ledger' && a.is_active !== false).map(a => ({
    value: a.id, label: a.account_name, sub: a.account_code
  }));

  const handleDownloadTemplate = () => {
    downloadCSV('item_import_template.csv', [TEMPLATE_HEADERS, EXAMPLE_ROW]);
    toast.success('Template downloaded!');
  };

  const handleExport = async () => {
    try {
      toast.info('Preparing export…');
      const items = await sajilo.entities.Item.list('-created_date', 5000);
      const rows = [TEMPLATE_HEADERS, ...items.map(it => TEMPLATE_HEADERS.map(h => {
        const v = it[h];
        if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
        return v ?? '';
      }))];
      downloadCSV(`items_export_${new Date().toISOString().slice(0,10)}.csv`, rows);
      toast.success(`Exported ${items.length} items`);
    } catch {
      toast.error('Export failed. Please try again.');
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setStep('validating');
    setValidationErrors([]);
    setDuplicates([]);

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      setValidationErrors(['The file appears to be empty or has no data rows.']);
      setStep('review');
      return;
    }

    // Load existing items for duplicate check
    const existingItems = await sajilo.entities.Item.list('-created_date', 5000);
    const existingNameMap = {};
    const existingCodeMap = {};
    existingItems.forEach(it => {
      if (it.item_name) existingNameMap[it.item_name.toLowerCase()] = it;
      if (it.item_code) existingCodeMap[it.item_code.toLowerCase()] = it;
    });

    // Load Categories and UOMs for strict validation
    const categories = await sajilo.entities.ItemCategory.list('category_name');
    const uoms = await sajilo.entities.UnitOfMeasure.list('uom_code');
    const catMap = {};
    categories.forEach(c => {
      if (c.category_name) catMap[c.category_name.toLowerCase()] = c;
    });
    const uomSet = new Set(uoms.map(u => u.uom_code?.toLowerCase()));
    if (uomSet.size === 0) {
      // Fallback defaults just in case database is empty but standard ones exist
      uomSet.add('pcs'); uomSet.add('kg'); uomSet.add('box');
    }

    const allErrors = [];
    const dupes = [];

    rows.forEach((row, i) => {
      const errs = validateRow(row, i, existingNameMap, existingCodeMap, catMap, uomSet);
      allErrors.push(...errs);
      if (row.item_name && existingNameMap[row.item_name.toLowerCase()]) {
        dupes.push({ rowIndex: i, rowNum: i + 2, item_name: row.item_name, existing: existingNameMap[row.item_name.toLowerCase()] });
      }
    });

    setParsedRows(rows);
    setValidationErrors(allErrors);
    setDuplicates(dupes);
    
    if (rows.length > 0) {
      const allAccounts = await sajilo.entities.ChartOfAccount.list();
      setAccounts(allAccounts);
    }
    
    setStep('review');
    fileRef.current.value = '';
  };

  const handleImport = async () => {
    setStep('importing');
    const user = await sajilo.auth.me();
    const existingItems = await sajilo.entities.Item.list('-created_date', 5000);
    const existingNameMap = {};
    existingItems.forEach(it => { if (it.item_name) existingNameMap[it.item_name.toLowerCase()] = it; });

    const dupeNames = new Set(duplicates.map(d => d.item_name.toLowerCase()));
    let created = 0, updated = 0, skipped = 0, failed = 0;
    const errorLog = [...validationErrors];
    const errorRows = new Set(validationErrors.map(e => { const m = e.match(/^Row (\d+):/); return m ? Number(m[1]) - 2 : -1; }));

    const created_item_ids = [];
    const newItemsWithStock = [];

    for (let i = 0; i < parsedRows.length; i++) {
      if (errorRows.has(i)) { failed++; continue; }
      const row = parsedRows[i];
      const nameLower = row.item_name?.toLowerCase();
      const isDupe = dupeNames.has(nameLower);

      if (isDupe && !overrideAll) { skipped++; continue; }

      const payload = {
        item_name: row.item_name?.trim(),
        item_code: row.item_code?.trim() || undefined,
        item_type: row.item_type?.trim() || 'Product',
        category_name: row.category_name?.trim() || undefined,
        category_id: row._category_id || undefined,
        unit_of_measure: row.unit_of_measure?.trim() || 'PCS',
        purchase_uom: row.purchase_uom?.trim() || undefined,
        sales_uom: row.sales_uom?.trim() || undefined,
        selling_price: Number(row.selling_price) || 0,
        purchase_price: Number(row.purchase_price) || 0,
        quantity_on_hand: row.quantity_on_hand !== '' ? Math.max(0, Number(row.quantity_on_hand)) : 0,
        reorder_level: row.reorder_level !== '' ? Number(row.reorder_level) : 0,
        is_vat_applicable: row.is_vat_applicable?.toString().toLowerCase() === 'true',
        is_active: row.is_active?.toString().toLowerCase() !== 'false',
        barcode: row.barcode?.trim() || undefined,
        hs_code: row.hs_code?.trim() || undefined,
        description: row.description?.trim() || undefined,
        purchase_account_name: row.purchase_account_name?.trim() || undefined,
        sales_account_name: row.sales_account_name?.trim() || undefined,
        inventory_account_name: row.inventory_account_name?.trim() || undefined,
        discount_scheme_name: row.discount_scheme_name?.trim() || undefined,
      };
      // Remove undefined keys
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      try {
        if (isDupe && overrideAll) {
          const existing = existingNameMap[nameLower];
          delete payload.id;
          delete payload.is_physical; // Generated column
          delete payload.quantity_on_hand; // STRICT COMPLIANCE: Prevent duplicate stock journals
          await sajilo.entities.Item.update(existing.id, payload);
          updated++;
        } else {
          const newItem = await sajilo.entities.Item.create(payload);
          created++;
          if (newItem && newItem.id) {
            created_item_ids.push(newItem.id);
            if (payload.quantity_on_hand > 0) {
               newItemsWithStock.push({
                 id: newItem.id,
                 quantity_on_hand: payload.quantity_on_hand,
                 purchase_price: payload.purchase_price
               });
            }
          }
        }
      } catch (err) {
        failed++;
        errorLog.push(`Row ${i + 2}: Failed to save item "${row.item_name}". ${err.message || ''}`);
      }
    }

    // Post opening stock GL entries for newly created items with qty > 0 via Bulk RPC
    let journal_id = null;
    if (newItemsWithStock.length > 0) {
      try {
        const glSettings = await loadSettings();
        journal_id = await postBulkOpeningStock(newItemsWithStock, glSettings, new Date().toISOString().slice(0, 10), offsetAccountId, inventoryAccountId);
      } catch (err) {
        errorLog.push(`Failed to post bulk opening stock: ${err.message}`);
        failed++; // Mark overall process as partial or failed if financials failed
      }
    }

    const status = failed > 0 && created + updated === 0 ? 'Failed' : failed > 0 ? 'Partial' : 'Success';
    let log_id = null;
    try {
      const logEntry = await sajilo.entities.ItemImportLog.create({
        file_name: fileName,
        imported_by: user?.email || 'Unknown',
        import_date: new Date().toISOString(),
        total_rows: parsedRows.length,
        items_created: created,
        items_updated: updated,
        items_skipped: skipped,
        items_failed: failed,
        status,
        errors: errorLog.slice(0, 50),
        metadata: { created_item_ids, journal_id }
      });
      log_id = logEntry?.id;
    } catch (e) {
      console.error("Failed to write import log", e);
    }

    setResult({ created, updated, skipped, failed, status, errors: errorLog, log_id, metadata: { created_item_ids, journal_id } });
    setStep('done');
    if (onImportCompleted) onImportCompleted();
  };

  const executeUndo = async () => {
    if (!result?.log_id) return;
    setIsUndoing(true);
    try {
      await rollbackBulkImport(result.log_id);
      setResult(prev => ({ ...prev, status: 'Rolled Back' }));
      setShowUndoConfirm(false);
      if (onImportCompleted) onImportCompleted();
    } catch (err) {
      // Error handled by service toast
    } finally {
      setIsUndoing(false);
    }
  };

  const reset = () => {
    setStep('idle'); setParsedRows([]); setValidationErrors([]);
    setDuplicates([]); setOverrideAll(false); setResult(null); setFileName('');
    setOffsetAccountId('');
    setInventoryAccountId('');
  };

  const canUndo = result && (result.status === 'Success' || result.status === 'Partial') && result.metadata?.created_item_ids?.length > 0;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
        <FileSpreadsheet className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground text-sm">Items Import / Export</h3>
      </div>

      <div className="p-5 space-y-5">
        {/* Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-muted-foreground mr-1">Products</span>
          <Button variant="outline" className="border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:bg-blue-500/10 print:hidden"
            onClick={() => fileRef.current?.click()} disabled={step === 'validating' || step === 'importing'}>
            <Upload className="w-4 h-4 mr-1.5" /> Import
          </Button>
          <Button variant="outline" className="border-green-200 dark:border-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-50 dark:bg-green-500/10 print:hidden"
            onClick={handleDownloadTemplate}>
            <Download className="w-4 h-4 mr-1.5" /> Download Template
          </Button>
          <Button variant="outline" className="border-pink-200 dark:border-pink-500/20 text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:bg-pink-500/10 print:hidden"
            onClick={handleExport}>
            <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Export
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileSelect} />
        </div>

        <p className="text-xs text-muted-foreground">
          Download the template, fill in your item data, then upload the file to bulk-import or update items.
          Supported formats: <strong>.csv</strong>.
        </p>

        {/* Validating spinner */}
        {step === 'validating' && (
          <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg">
            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
            <span className="text-sm">Validating "{fileName}"…</span>
          </div>
        )}

        {/* Importing spinner */}
        {step === 'importing' && (
          <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-700 dark:text-blue-400">Importing items… please wait.</span>
          </div>
        )}

        {/* Review Step */}
        {step === 'review' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Review: {fileName}</h4>
              <Button variant="ghost" size="sm" onClick={reset} className="print:hidden"><X className="w-4 h-4 mr-1" /> Cancel</Button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/40 rounded-lg p-3 text-center">
                <p className="text-xl font-bold text-foreground">{parsedRows.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total Rows</p>
              </div>
              <div className={cn('rounded-lg p-3 text-center', validationErrors.length > 0 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10')}>
                <p className={cn('text-xl font-bold', validationErrors.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>{validationErrors.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Validation Errors</p>
              </div>
              <div className={cn('rounded-lg p-3 text-center', duplicates.length > 0 ? 'bg-yellow-50 dark:bg-yellow-500/10' : 'bg-muted/40')}>
                <p className={cn('text-xl font-bold', duplicates.length > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-foreground')}>{duplicates.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Duplicates Found</p>
              </div>
            </div>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-4 space-y-1.5 max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4" /> Validation Errors — please fix these in your file and re-upload:
                </p>
                {validationErrors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400 pl-5">• {e}</p>)}
              </div>
            )}

            {/* Duplicates */}
            {duplicates.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/20 rounded-lg p-4 space-y-3">
                <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> {duplicates.length} duplicate item name(s) found:
                </p>
                <ul className="space-y-1 max-h-32 overflow-y-auto">
                  {duplicates.map((d, i) => (
                    <li key={i} className="text-xs text-yellow-700 dark:text-yellow-400 pl-5">• Row {d.rowNum}: "{d.item_name}"</li>
                  ))}
                </ul>
                <div className="flex items-center gap-3 pt-1">
                  <input type="checkbox" id="override" checked={overrideAll} onChange={e => setOverrideAll(e.target.checked)}
                    className="w-4 h-4 accent-yellow-600" />
                  <label htmlFor="override" className="text-xs font-medium text-yellow-800 dark:text-yellow-300 cursor-pointer">
                    Override existing items with data from the file
                  </label>
                </div>
                {!overrideAll && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">Duplicate rows will be <strong>skipped</strong> unless you check the box above.</p>
                )}
              </div>
            )}

            {/* Journal Mapping Section */}
            {requiresJournal && validationErrors.length === 0 && (
              <div className="bg-muted/10 border border-border rounded-lg p-4">
                <h4 className="text-sm font-semibold mb-2">Double-Entry Journal Validation</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  This import brings in an initial stock value of <strong className="font-mono">NPR {totalOpeningStockValue.toLocaleString()}</strong>.
                  Select an offsetting account to balance the journal entry.
                </p>
                <div className="bg-card border rounded-lg text-sm mb-3">
                  <div className="grid grid-cols-12 gap-2 bg-muted/30 px-3 py-2 font-medium text-xs border-b">
                    <div className="col-span-6">Account</div>
                    <div className="col-span-3 text-right">Debit (Dr)</div>
                    <div className="col-span-3 text-right">Credit (Cr)</div>
                  </div>
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b">
                    <div className="col-span-6">
                      <SearchableSelect
                        value={inventoryAccountId}
                        onValueChange={setInventoryAccountId}
                        options={subLedgerOpts}
                        placeholder="Select Inventory Asset Account (Debit)"
                      />
                    </div>
                    <div className="col-span-3 text-right font-mono text-emerald-600 dark:text-emerald-400">NPR {totalOpeningStockValue.toLocaleString()}</div>
                    <div className="col-span-3 text-right font-mono text-muted-foreground">0.00</div>
                  </div>
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 items-center">
                    <div className="col-span-6">
                      <SearchableSelect
                        value={offsetAccountId}
                        onValueChange={setOffsetAccountId}
                        options={subLedgerOpts}
                        placeholder="Select Offset Account (e.g. Capital, Opening Balance Equity) (Credit)"
                      />
                    </div>
                    <div className="col-span-3 text-right font-mono text-muted-foreground">0.00</div>
                    <div className="col-span-3 text-right font-mono text-blue-600 dark:text-blue-400">NPR {totalOpeningStockValue.toLocaleString()}</div>
                  </div>
                </div>
                {(!offsetAccountId || !inventoryAccountId) && (
                  <div className="flex items-center gap-2 mt-3 text-amber-600 dark:text-amber-400 text-xs font-medium">
                    <AlertCircleIcon className="w-4 h-4" /> Please select both Debit and Credit accounts to proceed.
                  </div>
                )}
              </div>
            )}

            {/* Proceed button — only if no validation errors */}
            {validationErrors.length === 0 ? (
              <Button onClick={handleImport} className="w-full print:hidden" disabled={!isBalanced}>
                <Upload className="w-4 h-4 mr-2" />
                Import {parsedRows.length - (overrideAll ? 0 : duplicates.length)} Item(s)
                {!overrideAll && duplicates.length > 0 && ` (${duplicates.length} skipped)`}
              </Button>
            ) : (
              <Button variant="outline" onClick={reset} className="w-full print:hidden">
                Fix errors in your file and re-upload
              </Button>
            )}
          </div>
        )}

        {/* Done */}
        {step === 'done' && result && (
          <div className="space-y-4">
            <div className={cn('flex items-center gap-3 p-4 rounded-lg border',
              result.status === 'Success' ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20'
              : result.status === 'Rolled Back' ? 'bg-muted border-border'
              : result.status === 'Partial' ? 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20'
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20')}>
              {result.status === 'Success'
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                : result.status === 'Rolled Back' 
                ? <Undo2 className="w-5 h-5 text-muted-foreground shrink-0" />
                : <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0" />}
              <div>
                <p className="text-sm font-semibold">
                  {result.status === 'Success' ? 'Import completed successfully!' : result.status === 'Rolled Back' ? 'Import was rolled back.' : result.status === 'Partial' ? 'Import completed with some issues.' : 'Import failed.'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {result.created} created · {result.updated} updated · {result.skipped} skipped · {result.failed} failed
                </p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-3 max-h-36 overflow-y-auto">
                {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600 dark:text-red-400">• {e}</p>)}
              </div>
            )}
            
            <div className="flex gap-3 print:hidden">
              <Button variant="outline" onClick={reset} className="flex-1">Import Another File</Button>
              {canUndo && (
                <Button variant="destructive" onClick={() => setShowUndoConfirm(true)} className="flex-1" disabled={isUndoing}>
                  <Undo2 className="w-4 h-4 mr-2" /> Undo this Import
                </Button>
              )}
            </div>

            {/* Undo Confirmation Modal */}
            {showUndoConfirm && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-background rounded-xl p-6 max-w-md w-full shadow-xl border border-border">
                  <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
                    <AlertTriangle className="w-6 h-6" />
                    <h3 className="text-lg font-bold">Undo Bulk Import?</h3>
                  </div>
                  <p className="text-sm text-muted-foreground mb-6">
                    This action will permanently delete the imported items and reverse the associated Opening Stock financial journals. 
                    If any of these items have already been sold or moved, the rollback will be aborted by the system to protect accounting integrity.
                  </p>
                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setShowUndoConfirm(false)} disabled={isUndoing}>Cancel</Button>
                    <Button variant="destructive" onClick={executeUndo} disabled={isUndoing}>
                      {isUndoing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Yes, Undo Import
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ImportHistoryTable({ refreshTrigger }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [undoLogId, setUndoLogId] = useState(null);
  const [isUndoing, setIsUndoing] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await sajilo.entities.ItemImportLog.list('-created_at', 20);
      setLogs(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [refreshTrigger]);

  const handleUndoClick = (logId) => {
    setUndoLogId(logId);
  };

  const executeUndo = async () => {
    if (!undoLogId) return;
    setIsUndoing(true);
    try {
      await rollbackBulkImport(undoLogId);
      await fetchLogs();
      setUndoLogId(null);
    } catch (err) {
      // Error handled by service toast
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mt-6">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
        <RotateCcw className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground text-sm">Import History</h3>
      </div>
      <div className="p-0 overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/30 text-xs uppercase text-muted-foreground border-b border-border">
            <tr>
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">File Name</th>
              <th className="px-5 py-3 font-medium">Imported By</th>
              <th className="px-5 py-3 font-medium">Total Rows</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No import history found.</td></tr>
            ) : (
              logs.map(log => {
                const canUndo = (log.status === 'Success' || log.status === 'Partial') && log.metadata?.created_item_ids?.length > 0;
                return (
                  <tr key={log.id} className="hover:bg-muted/10">
                    <td className="px-5 py-3 text-muted-foreground">{format(new Date(log.created_at), 'MMM dd, yyyy HH:mm')}</td>
                    <td className="px-5 py-3 font-medium">{log.file_name}</td>
                    <td className="px-5 py-3">{log.imported_by}</td>
                    <td className="px-5 py-3">{log.total_rows}</td>
                    <td className="px-5 py-3">
                      <span className={cn('px-2 py-1 rounded-full text-[10px] font-semibold tracking-wide',
                        log.status === 'Success' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                        : log.status === 'Rolled Back' ? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                        : log.status === 'Partial' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                      )}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canUndo && (
                        <Button variant="ghost" size="sm" onClick={() => handleUndoClick(log.id)} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 h-8 px-2">
                          <Undo2 className="w-3.5 h-3.5 mr-1" /> Undo
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Undo Confirmation Modal (Shared styling) */}
      {undoLogId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl p-6 max-w-md w-full shadow-xl border border-border">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold">Undo Bulk Import?</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              This action will permanently delete the imported items and reverse the associated Opening Stock financial journals. 
              If any of these items have already been sold or moved, the rollback will be aborted by the system to protect accounting integrity.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setUndoLogId(null)} disabled={isUndoing}>Cancel</Button>
              <Button variant="destructive" onClick={executeUndo} disabled={isUndoing}>
                {isUndoing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                Yes, Undo Import
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ItemImportExport() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <div className="space-y-6">
      <ItemImportCard onImportCompleted={() => setRefreshTrigger(v => v + 1)} />
      <ImportHistoryTable refreshTrigger={refreshTrigger} />
      <PartnerImportExport />
    </div>
  );
}
