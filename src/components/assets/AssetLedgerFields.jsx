/**
 * Three mandatory GL ledger pickers for the Fixed Asset form:
 *  1. Asset Cost Ledger       — Non-Current Asset accounts
 *  2. Accumulated Dep. Ledger — Contra-Asset accounts
 *  3. Dep. Expense Ledger     — OPEX / FOH accounts
 */
import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import SearchableSelect from '@/components/shared/SearchableSelect';
import { AlertCircle } from 'lucide-react';

export default function AssetLedgerFields({ accounts = [], form, onChange, showValidation }) {
  // Asset Cost Ledger: all Asset-type sub-ledgers that are NOT accumulated depreciation / contra
  const assetCostAccounts = useMemo(() =>
    accounts.filter(a =>
      a.account_type === 'Asset' &&
      a.ledger_type === 'Sub Ledger' &&
      a.is_active !== false &&
      !((a.account_subtype || '').toLowerCase().includes('accum') ||
        (a.account_subtype || '').toLowerCase().includes('contra') ||
        (a.account_name || '').toLowerCase().includes('accumulated'))
    ).map(a => ({ value: a.id, label: `${a.account_code} — ${a.account_name}` })),
    [accounts]
  );

  // Accumulated Depreciation: accounts named/subtyped as accumulated depreciation or contra-asset
  const accumDepAccounts = useMemo(() => {
    const specific = accounts.filter(a =>
      a.ledger_type === 'Sub Ledger' &&
      a.is_active !== false &&
      (
        (a.account_subtype || '').toLowerCase().includes('accum') ||
        (a.account_subtype || '').toLowerCase().includes('contra') ||
        (a.account_name || '').toLowerCase().includes('accum') ||
        (a.account_name || '').toLowerCase().includes('depreciation')
      )
    );
    // Fallback to all asset sub-ledgers
    const fallback = accounts.filter(a =>
      a.account_type === 'Asset' &&
      a.ledger_type === 'Sub Ledger' &&
      a.is_active !== false
    );
    return (specific.length > 0 ? specific : fallback)
      .map(a => ({ value: a.id, label: `${a.account_code} — ${a.account_name}` }));
  }, [accounts]);

  // Depreciation Expense: OPEX / Expense type sub-ledgers
  const depExpenseAccounts = useMemo(() =>
    accounts.filter(a =>
      ['OPEX', 'Expense', 'Other Expense'].includes(a.account_type) &&
      a.ledger_type === 'Sub Ledger' &&
      a.is_active !== false
    ).map(a => ({ value: a.id, label: `${a.account_code} — ${a.account_name}` })),
    [accounts]
  );

  const handleSelect = (field, idField, nameField, accountList) => (val) => {
    const acc = accounts.find(a => a.id === val);
    onChange(idField, val);
    onChange(nameField, acc?.account_name || '');
  };

  const missing = (val) => showValidation && !val;

  return (
    <div className="col-span-2 border border-border rounded-xl p-4 space-y-4 bg-muted/20">
      <p className="text-sm font-semibold text-foreground flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-primary inline-block" />
        GL Ledger Mapping
        <span className="text-xs font-normal text-muted-foreground ml-1">(required for Active assets)</span>
      </p>

      {/* Asset Cost Ledger */}
      <div>
        <Label className={missing(form.asset_ledger_id) ? 'text-destructive' : ''}>
          Asset Cost Ledger * <span className="text-xs text-muted-foreground font-normal">(Non-Current Asset)</span>
        </Label>
        <SearchableSelect
          options={assetCostAccounts}
          value={form.asset_ledger_id || ''}
          onValueChange={handleSelect('asset_ledger', 'asset_ledger_id', 'asset_ledger_name', accounts)}
          placeholder="Search asset cost accounts…"
        />
        {missing(form.asset_ledger_id) && (
          <p className="text-xs text-destructive flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" /> Required for Active assets</p>
        )}
      </div>

      {/* Accumulated Depreciation Ledger */}
      <div>
        <Label className={missing(form.accumulated_dep_ledger_id) ? 'text-destructive' : ''}>
          Accumulated Depreciation Ledger * <span className="text-xs text-muted-foreground font-normal">(Contra-Asset)</span>
        </Label>
        <SearchableSelect
          options={accumDepAccounts}
          value={form.accumulated_dep_ledger_id || ''}
          onValueChange={handleSelect('accumulated_dep', 'accumulated_dep_ledger_id', 'accumulated_dep_ledger_name', accounts)}
          placeholder="Search accumulated dep. accounts…"
        />
        {missing(form.accumulated_dep_ledger_id) && (
          <p className="text-xs text-destructive flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" /> Required for Active assets</p>
        )}
      </div>

      {/* Depreciation Expense Ledger */}
      <div>
        <Label className={missing(form.dep_expense_ledger_id) ? 'text-destructive' : ''}>
          Depreciation Expense Ledger * <span className="text-xs text-muted-foreground font-normal">(OPEX / FOH)</span>
        </Label>
        <SearchableSelect
          options={depExpenseAccounts}
          value={form.dep_expense_ledger_id || ''}
          onValueChange={handleSelect('dep_expense', 'dep_expense_ledger_id', 'dep_expense_ledger_name', accounts)}
          placeholder="Search depreciation expense accounts…"
        />
        {missing(form.dep_expense_ledger_id) && (
          <p className="text-xs text-destructive flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" /> Required for Active assets</p>
        )}
      </div>
    </div>
  );
}