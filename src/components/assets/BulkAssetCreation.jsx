import { useState, useCallback } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Plus, Trash2, Save, X, ChevronDown, ChevronsDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SearchableSelect from '@/components/shared/SearchableSelect';
import { cn } from '@/lib/utils';

const TODAY = new Date().toISOString().split('T')[0];

const emptyRow = () => ({
  asset_name: '',
  purchase_date: TODAY,
  gross_purchase_value: '',
  salvage_value: '',
  useful_life_months: '60',
  depreciation_method: 'Straight-Line',
  // Assets Ledger (replaces both "Category" and "Asset Cost Ledger")
  asset_ledger_id: '',
  asset_ledger_name: '',
  // Dep ledgers kept for completeness but not shown in this sheet
  accumulated_dep_ledger_id: '',
  accumulated_dep_ledger_name: '',
  dep_expense_ledger_id: '',
  dep_expense_ledger_name: '',
});

const DEP_METHODS = ['Straight-Line', 'Written-Down Value'];

// ── Dropdown cell ────────────────────────────────────────────────────────────
function DropdownCell({ value, options, onSelect, placeholder, width = 'w-48', getLabel, getId, isActive, onFocus }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = options.filter(o => {
    const lbl = getLabel ? getLabel(o) : o;
    return lbl.toLowerCase().includes(search.toLowerCase());
  });

  const selected = value ? (getLabel ? getLabel(options.find(o => getId(o) === value)) : value) : null;

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => { onFocus(); setOpen(v => !v); setSearch(''); }}
        className={cn(
          'flex items-center justify-between w-full h-8 px-2 text-xs border rounded bg-card hover:bg-muted/30 transition-colors gap-1',
          !selected && 'text-muted-foreground',
          isActive && 'border-primary ring-1 ring-primary ring-offset-0',
          open && 'border-primary ring-1 ring-primary'
        )}
      >
        <span className="truncate">{selected || placeholder}</span>
        <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className={cn('absolute top-full left-0 z-50 mt-1 bg-card border border-border rounded-lg shadow-lg', width)}>
          <div className="p-1.5 border-b border-border">
            <input
              autoFocus
              className="w-full text-xs px-2 py-1 border rounded outline-none"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.stopPropagation()}
            />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-2 text-center">No results</p>
            ) : filtered.map((o, i) => {
              const lbl = getLabel ? getLabel(o) : o;
              return (
                <button
                  key={i}
                  type="button"
                  className="w-full text-left text-xs px-3 py-1.5 hover:bg-muted/50 transition-colors truncate"
                  onClick={() => { onSelect(o); setOpen(false); setSearch(''); }}
                >
                  {lbl}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function BulkAssetCreation({ open, onClose, accounts, assets, onSaved, settings }) {
  const [rows, setRows] = useState(() => Array.from({ length: 10 }, emptyRow));
  const [saving, setSaving] = useState(false);
  const [activeCell, setActiveCell] = useState(null);
  const [offsetAccountId, setOffsetAccountId] = useState('');

  // Asset Ledger accounts: Asset-type sub-ledgers that are NOT accumulated dep / contra
  const assetLedgerOpts = accounts.filter(a =>
    a.ledger_type === 'Sub Ledger' &&
    a.is_active !== false &&
    a.account_type === 'Asset' &&
    !a.account_subtype?.toLowerCase().includes('accumulated') &&
    !a.account_subtype?.toLowerCase().includes('contra') &&
    !(a.account_name || '').toLowerCase().includes('accumulated')
  );

  const offsetAccountOpts = accounts.filter(a => a.ledger_type === 'Sub Ledger' && a.is_active !== false).map(a => ({
    value: a.id, label: a.account_name, sub: a.account_code
  }));

  const validRows = rows.filter(r => r.asset_name.trim());
  const totalGrossValue = validRows.reduce((sum, r) => sum + (parseFloat(r.gross_purchase_value) || 0), 0);
  const requiresJournal = totalGrossValue > 0;
  const isBalanced = !requiresJournal || !!offsetAccountId;

  const updateRow = (idx, field, value) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const setAccountField = (idx, idField, nameField, account) => {
    setRows(prev => prev.map((r, i) =>
      i === idx ? { ...r, [idField]: account.id, [nameField]: account.account_name } : r
    ));
  };

  const deleteRow = (idx) => setRows(prev => prev.filter((_, i) => i !== idx));
  const addRows = (count = 5) => setRows(prev => [...prev, ...Array.from({ length: count }, emptyRow)]);

  // ── Fill-down ──────────────────────────────────────────────────────────────
  const fillDown = useCallback(() => {
    if (!activeCell) return;
    const { rowIdx, colKey } = activeCell;
    const sourceRow = rows[rowIdx];

    const MULTI = {
      asset_ledger_id: ['asset_ledger_id', 'asset_ledger_name'],
    };

    setRows(prev => prev.map((r, i) => {
      if (i <= rowIdx) return r;
      if (MULTI[colKey]) {
        const [idField, nameField] = MULTI[colKey];
        return { ...r, [idField]: sourceRow[idField], [nameField]: sourceRow[nameField] };
      }
      return { ...r, [colKey]: sourceRow[colKey] };
    }));

    const filled = rows.length - rowIdx - 1;
    toast.success(`Filled down to ${filled} row${filled !== 1 ? 's' : ''}`);
  }, [activeCell, rows]);

  // ── Column order for tab-paste ─────────────────────────────────────────────
  const COL_ORDER = [
    'asset_name', 'purchase_date',
    'gross_purchase_value', 'salvage_value', 'useful_life_months',
    'depreciation_method',
  ];

  const validatePastedValue = useCallback((colKey, raw) => {
    const v = raw.trim();
    if (v === '') return null;
    if (colKey === 'asset_name') return v;
    if (colKey === 'depreciation_method') {
      const match = DEP_METHODS.find(m => m.toLowerCase() === v.toLowerCase());
      return match ?? null;
    }
    if (colKey === 'purchase_date') {
      const iso = (() => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        const dmy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
        return null;
      })();
      if (!iso) return null;
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : iso;
    }
    if (['gross_purchase_value', 'salvage_value', 'useful_life_months'].includes(colKey)) {
      const n = parseFloat(v.replace(/,/g, ''));
      return isNaN(n) ? null : String(n);
    }
    return null;
  }, []);

  const handlePaste = useCallback((e, rowIdx, startColKey) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    const lines = text.split('\n').map(l => l.replace(/\r$/, ''));
    const nonEmpty = lines.filter(l => l.trim());
    if (nonEmpty.length === 0) return;

    const isMultiCol = nonEmpty.some(l => l.includes('\t'));
    if (!isMultiCol) {
      if (nonEmpty.length <= 1) return;
      e.preventDefault();
      setRows(prev => {
        const updated = [...prev];
        nonEmpty.forEach((line, i) => {
          const val = line.trim();
          const targetIdx = rowIdx + i;
          if (targetIdx < updated.length) {
            updated[targetIdx] = { ...updated[targetIdx], asset_name: val };
          } else {
            const r = emptyRow(); r.asset_name = val; updated.push(r);
          }
        });
        return updated;
      });
      toast.success(`Pasted ${nonEmpty.length} asset names`);
      return;
    }

    e.preventDefault();
    const startColIdx = COL_ORDER.indexOf(startColKey);
    const effectiveStart = startColIdx === -1 ? 0 : startColIdx;
    let filled = 0, skipped = 0;

    setRows(prev => {
      const updated = [...prev];
      nonEmpty.forEach((line, i) => {
        const cells = line.split('\t');
        const targetIdx = rowIdx + i;
        while (updated.length <= targetIdx) updated.push(emptyRow());
        const patch = {};
        cells.forEach((cell, ci) => {
          const colKey = COL_ORDER[effectiveStart + ci];
          if (!colKey) return;
          const coerced = validatePastedValue(colKey, cell);
          if (coerced !== null) { patch[colKey] = coerced; filled++; }
          else if (cell.trim() !== '') { skipped++; }
        });
        updated[targetIdx] = { ...updated[targetIdx], ...patch };
      });
      return updated;
    });

    const msg = skipped > 0
      ? `Pasted ${nonEmpty.length} rows (${skipped} value${skipped > 1 ? 's' : ''} skipped — no match)`
      : `Pasted ${nonEmpty.length} rows successfully`;
    skipped > 0 ? toast.warning(msg) : toast.success(msg);
  }, [validatePastedValue]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (validRows.length === 0) { toast.error('Enter at least one asset name'); return; }
    if (requiresJournal && !offsetAccountId) { toast.error('Please select an offsetting account to balance the journal'); return; }
    
    setSaving(true);

    try {
      const startIndex = assets.length;
      let created = 0;
      const today = new Date().toISOString().slice(0, 10);
      
      const ledgerTotals = {}; // { asset_ledger_id: { amount, name } }

      // 1. Create Assets
      for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i];
        const code = `AST-${String(startIndex + i + 1).padStart(3, '0')}`;
        const gross   = parseFloat(r.gross_purchase_value) || 0;
        const salvage = parseFloat(r.salvage_value) || 0;

        const asset = await sajilo.entities.FixedAsset.create({
          asset_code: code,
          asset_name: r.asset_name.trim(),
          category: r.asset_ledger_name || '',
          purchase_date: r.purchase_date || TODAY,
          gross_purchase_value: gross,
          salvage_value: salvage,
          useful_life_months: parseInt(r.useful_life_months) || 60,
          depreciation_method: r.depreciation_method || 'Straight-Line',
          accumulated_depreciation: 0,
          net_book_value: Math.max(gross, salvage),
          status: 'Active',
          asset_ledger_id: r.asset_ledger_id || '',
          asset_ledger_name: r.asset_ledger_name || '',
          accumulated_dep_ledger_id: '',
          accumulated_dep_ledger_name: '',
          dep_expense_ledger_id: '',
          dep_expense_ledger_name: '',
          gl_posted: requiresJournal,
          payment_method_type: 'cash_bank',
          payment_account_id: '',
          payment_account_name: '',
          document_urls: [],
        });
        created++;

        if (r.asset_ledger_id && gross > 0) {
          if (!ledgerTotals[r.asset_ledger_id]) ledgerTotals[r.asset_ledger_id] = { amount: 0, name: r.asset_ledger_name };
          ledgerTotals[r.asset_ledger_id].amount += gross;
        }
      }

      // 2. Post Consolidated Journal
      if (requiresJournal) {
        const offsetAcc = accounts.find(a => a.id === offsetAccountId);
        const journalLines = [];
        
        // Debits (Assets)
        for (const [id, data] of Object.entries(ledgerTotals)) {
          journalLines.push({ account_id: id, account_name: data.name, debit_amount: data.amount, credit_amount: 0, description: 'Bulk Fixed Asset Import' });
        }
        
        // Credit (Offset)
        journalLines.push({ account_id: offsetAcc.id, account_name: offsetAcc.account_name, debit_amount: 0, credit_amount: totalGrossValue, description: 'Bulk Fixed Asset Import Offset' });

        const journal = await sajilo.entities.GeneralLedgerJournal.create({
          entry_date: today,
          description: `Bulk Fixed Asset Import (${created} assets)`,
          reference_module: 'Assets',
          status: 'Posted',
          total_debit: totalGrossValue,
          total_credit: totalGrossValue,
          is_balanced: true,
        });

        await sajilo.entities.GeneralLedgerLine.bulkCreate(journalLines.map(l => ({ ...l, journal_id: journal.id })));

        // Update COA balances
        const accountIds = new Set(journalLines.map(l => l.account_id));
        const coas = await sajilo.entities.ChartOfAccount.list();
        for (const accId of accountIds) {
          const acc = coas.find(a => a.id === accId);
          if (!acc) continue;
          const linesForAcc = journalLines.filter(l => l.account_id === accId);
          const totalDr = linesForAcc.reduce((sum, l) => sum + (Number(l.debit_amount) || 0), 0);
          const totalCr = linesForAcc.reduce((sum, l) => sum + (Number(l.credit_amount) || 0), 0);
          
          const isDebitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(acc.account_type);
          const delta = totalDr - totalCr;
          const change = isDebitNormal ? delta : -delta;
          
          await sajilo.entities.ChartOfAccount.update(acc.id, { current_balance: Math.round(((acc.current_balance || 0) + change) * 100) / 100 });
        }
      }

      toast.success(`${created} asset(s) created${requiresJournal ? ` and consolidated journal posted` : ''}`);
    } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
    setRows(Array.from({ length: 10 }, emptyRow));
    setActiveCell(null);
    setOffsetAccountId('');
    onSaved();
    onClose();
  };

  const handleClose = () => {
    setRows(Array.from({ length: 10 }, emptyRow));
    setActiveCell(null);
    setOffsetAccountId('');
    onClose();
  };

  const isActive = (rowIdx, colKey) => activeCell?.rowIdx === rowIdx && activeCell?.colKey === colKey;
  const focus    = (rowIdx, colKey) => setActiveCell({ rowIdx, colKey });

  const canFillDown = activeCell && (() => {
    const { rowIdx, colKey } = activeCell;
    if (rowIdx >= rows.length - 1) return false;
    const r = rows[rowIdx];
    const checkKey = colKey === 'asset_ledger_id' ? 'asset_ledger_id' : colKey;
    return r[checkKey] !== '' && r[checkKey] !== undefined;
  })();

  const COLS = [
    { key: 'asset_name',           label: 'Fixed Asset Name *', width: 'min-w-[200px]' },
    { key: 'asset_ledger_id',      label: 'Assets Ledger',      width: 'min-w-[220px]' },
    { key: 'purchase_date',        label: 'Purchase Date',      width: 'min-w-[140px]' },
    { key: 'gross_purchase_value', label: 'Gross Value',         width: 'min-w-[130px]' },
    { key: 'salvage_value',        label: 'Salvage Value',       width: 'min-w-[110px]' },
    { key: 'useful_life_months',   label: 'Life (Months)',       width: 'min-w-[100px]' },
    { key: 'depreciation_method',  label: 'Dep. Method',         width: 'min-w-[160px]' },
    { key: '_actions',             label: '',                    width: 'w-10' },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[95vw] w-full max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Bulk Asset Import</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Paste from Excel/Sheets — columns are auto-matched. The Assets Ledger directly maps to your Chart of Accounts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canFillDown && (
                <Button size="sm" variant="outline" className="gap-1 border-primary text-primary hover:bg-primary/10" onClick={fillDown}>
                  <ChevronsDown className="w-3.5 h-3.5" />
                  Fill Down
                </Button>
              )}
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                {validRows.length} valid row{validRows.length !== 1 ? 's' : ''}
              </span>
              <Button size="sm" variant="outline" onClick={() => addRows(5)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add 5 Rows
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving || validRows.length === 0 || !isBalanced}>
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {saving ? 'Saving…' : `Save ${validRows.length} Asset${validRows.length !== 1 ? 's' : ''}`}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* ── Grid ── */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-primary text-primary-foreground">
                <th className="px-2 py-2.5 text-left font-semibold border-r border-primary/20 w-8">#</th>
                {COLS.map(c => (
                  <th key={c.key} className={cn('px-2 py-2.5 text-left font-semibold border-r border-primary/20 whitespace-nowrap', c.width)}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isValid = row.asset_name.trim().length > 0;
                return (
                  <tr
                    key={idx}
                    className={cn(
                      'border-b border-border hover:bg-blue-50 dark:bg-blue-500/10/30 transition-colors',
                      isValid ? 'bg-card' : 'bg-muted/10'
                    )}
                  >
                    <td className="px-2 py-1.5 text-center text-muted-foreground border-r border-border font-mono w-8">
                      {idx + 1}
                    </td>

                    {/* Asset Name */}
                    <td className={cn('px-1.5 py-1 border-r border-border min-w-[200px]', isActive(idx, 'asset_name') && 'bg-primary/5')}>
                      <input
                        className={cn(
                          'w-full h-8 px-2 text-xs border rounded bg-card focus:outline-none focus:ring-1 focus:ring-primary transition-colors',
                          isActive(idx, 'asset_name') ? 'border-primary ring-1 ring-primary' : 'border-border/70'
                        )}
                        placeholder="Asset name…"
                        value={row.asset_name}
                        onChange={e => updateRow(idx, 'asset_name', e.target.value)}
                        onFocus={() => focus(idx, 'asset_name')}
                        onPaste={e => handlePaste(e, idx, 'asset_name')}
                      />
                    </td>

                    {/* Assets Ledger */}
                    <td className={cn('px-1.5 py-1 border-r border-border min-w-[220px]', isActive(idx, 'asset_ledger_id') && 'bg-primary/5')}>
                      <DropdownCell
                        value={row.asset_ledger_id}
                        options={assetLedgerOpts}
                        placeholder={assetLedgerOpts.length ? "Select assets ledger…" : "No Asset accounts found"}
                        width="w-72"
                        getLabel={o => o ? `${o.account_code} – ${o.account_name}` : ''}
                        getId={o => o?.id}
                        isActive={isActive(idx, 'asset_ledger_id')}
                        onFocus={() => focus(idx, 'asset_ledger_id')}
                        onSelect={o => { setAccountField(idx, 'asset_ledger_id', 'asset_ledger_name', o); focus(idx, 'asset_ledger_id'); }}
                      />
                    </td>

                    {/* Purchase Date */}
                    <td className={cn('px-1.5 py-1 border-r border-border min-w-[140px]', isActive(idx, 'purchase_date') && 'bg-primary/5')}>
                      <input
                        type="date"
                        className={cn(
                          'w-full h-8 px-2 text-xs border rounded bg-card focus:outline-none focus:ring-1 focus:ring-primary',
                          isActive(idx, 'purchase_date') ? 'border-primary ring-1 ring-primary' : 'border-border'
                        )}
                        value={row.purchase_date}
                        onChange={e => updateRow(idx, 'purchase_date', e.target.value)}
                        onFocus={() => focus(idx, 'purchase_date')}
                        onPaste={e => handlePaste(e, idx, 'purchase_date')}
                      />
                    </td>

                    {/* Gross Value */}
                    <td className={cn('px-1.5 py-1 border-r border-border min-w-[130px]', isActive(idx, 'gross_purchase_value') && 'bg-primary/5')}>
                      <input
                        type="number"
                        className={cn(
                          'w-full h-8 px-2 text-xs border rounded bg-card focus:outline-none focus:ring-1 focus:ring-primary text-right',
                          isActive(idx, 'gross_purchase_value') ? 'border-primary ring-1 ring-primary' : 'border-border'
                        )}
                        placeholder="0"
                        value={row.gross_purchase_value}
                        onChange={e => updateRow(idx, 'gross_purchase_value', e.target.value)}
                        onFocus={() => focus(idx, 'gross_purchase_value')}
                        onPaste={e => handlePaste(e, idx, 'gross_purchase_value')}
                      />
                    </td>

                    {/* Salvage Value */}
                    <td className={cn('px-1.5 py-1 border-r border-border min-w-[110px]', isActive(idx, 'salvage_value') && 'bg-primary/5')}>
                      <input
                        type="number"
                        className={cn(
                          'w-full h-8 px-2 text-xs border rounded bg-card focus:outline-none focus:ring-1 focus:ring-primary text-right',
                          isActive(idx, 'salvage_value') ? 'border-primary ring-1 ring-primary' : 'border-border'
                        )}
                        placeholder="0"
                        value={row.salvage_value}
                        onChange={e => updateRow(idx, 'salvage_value', e.target.value)}
                        onFocus={() => focus(idx, 'salvage_value')}
                        onPaste={e => handlePaste(e, idx, 'salvage_value')}
                      />
                    </td>

                    {/* Useful Life */}
                    <td className={cn('px-1.5 py-1 border-r border-border min-w-[100px]', isActive(idx, 'useful_life_months') && 'bg-primary/5')}>
                      <input
                        type="number"
                        className={cn(
                          'w-full h-8 px-2 text-xs border rounded bg-card focus:outline-none focus:ring-1 focus:ring-primary text-right',
                          isActive(idx, 'useful_life_months') ? 'border-primary ring-1 ring-primary' : 'border-border'
                        )}
                        placeholder="60"
                        value={row.useful_life_months}
                        onChange={e => updateRow(idx, 'useful_life_months', e.target.value)}
                        onFocus={() => focus(idx, 'useful_life_months')}
                        onPaste={e => handlePaste(e, idx, 'useful_life_months')}
                      />
                    </td>

                    {/* Dep Method */}
                    <td className={cn('px-1.5 py-1 border-r border-border min-w-[160px]', isActive(idx, 'depreciation_method') && 'bg-primary/5')}>
                      <DropdownCell
                        value={row.depreciation_method}
                        options={DEP_METHODS}
                        placeholder="Method…"
                        width="w-44"
                        isActive={isActive(idx, 'depreciation_method')}
                        onFocus={() => focus(idx, 'depreciation_method')}
                        onSelect={v => { updateRow(idx, 'depreciation_method', v); focus(idx, 'depreciation_method'); }}
                      />
                    </td>

                    {/* Delete row */}
                    <td className="px-1.5 py-1 w-10">
                      <button
                        type="button"
                        onClick={() => deleteRow(idx)}
                        className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Journal Mapping Section */}
        {requiresJournal && (
          <div className="px-6 py-4 border-t border-border bg-muted/10 shrink-0">
            <h4 className="text-sm font-semibold mb-2">Double-Entry Journal Validation</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Your import creates a total asset value of <strong className="font-mono">NPR {totalGrossValue.toLocaleString()}</strong>.
              Select an offsetting account to balance the journal entry.
            </p>
            <div className="bg-card border rounded-lg text-sm mb-3">
              <div className="grid grid-cols-12 gap-2 bg-muted/30 px-3 py-2 font-medium text-xs border-b">
                <div className="col-span-6">Account</div>
                <div className="col-span-3 text-right">Debit (Dr)</div>
                <div className="col-span-3 text-right">Credit (Cr)</div>
              </div>
              <div className="grid grid-cols-12 gap-2 px-3 py-2 items-center border-b">
                <div className="col-span-6 flex flex-col">
                  <span className="font-medium">Total Asset Ledgers</span>
                  <span className="text-xs text-muted-foreground">Mapped from rows above</span>
                </div>
                <div className="col-span-3 text-right font-mono text-emerald-600 dark:text-emerald-400">NPR {totalGrossValue.toLocaleString()}</div>
                <div className="col-span-3 text-right font-mono text-muted-foreground">0.00</div>
              </div>
              <div className="grid grid-cols-12 gap-2 px-3 py-2 items-center">
                <div className="col-span-6">
                  <SearchableSelect
                    value={offsetAccountId}
                    onValueChange={setOffsetAccountId}
                    options={offsetAccountOpts}
                    placeholder="Select Offset Account (e.g. Capital, Cash, Retained Earnings)"
                  />
                </div>
                <div className="col-span-3 text-right font-mono text-muted-foreground">0.00</div>
                <div className="col-span-3 text-right font-mono text-blue-600 dark:text-blue-400">NPR {totalGrossValue.toLocaleString()}</div>
              </div>
            </div>
            {!offsetAccountId && (
              <div className="flex items-center gap-2 mt-3 text-amber-600 dark:text-amber-400 text-xs font-medium">
                <AlertCircle className="w-4 h-4" /> Please select an offsetting account to balance the transaction and proceed.
              </div>
            )}
            {offsetAccountId && (
              <div className="flex items-center gap-2 mt-3 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4" /> Journal is balanced and ready to import.
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border bg-muted/20 shrink-0 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            💡 Paste from Excel/Sheets into any cell — tab-separated columns auto-fill; unrecognised values are skipped. Use <strong>Fill Down</strong> to copy a cell's value to all rows below.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || validRows.length === 0 || !isBalanced}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {saving ? 'Saving…' : `Save ${validRows.length} Asset${validRows.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}