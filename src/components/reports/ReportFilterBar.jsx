/**
 * ReportFilterBar — Decentralized, injected per report view.
 * Features arbitrary B.S. date input (day + month + year), column toggles, view switches.
 */
import { useState, useEffect } from 'react';
import { Filter, ChevronDown, ChevronUp, Eye, RefreshCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { adToBS, bsToAD, BS_MONTHS, isValidBSDate } from '@/lib/nepaliDate';

const BS_YEARS = [2078, 2079, 2080, 2081, 2082, 2083, 2084, 2085];

// ── Arbitrary BS Date Picker (day + month + year) ─────────────────────────────
export function BSDatePicker({ label, adValue, onChange }) {
  const init = adValue ? adToBS(adValue) : null;

  const [year,  setYear]  = useState(init?.year  || 2082);
  const [month, setMonth] = useState(init?.month || 1);
  const [day,   setDay]   = useState(init?.day   || 1);
  const [error, setError] = useState('');

  // Keep local state in sync when adValue changes externally
  useEffect(() => {
    if (!adValue) return;
    const bs = adToBS(adValue);
    if (bs) { setYear(bs.year); setMonth(bs.month); setDay(bs.day); }
  }, [adValue]);

  // Max days for the currently-selected year+month
  const maxDays = (() => {
    const BS_CALENDAR_MAP = [
      { year: 2078, months: [31,32,31,32,31,30,31,30,29,30,29,30] },
      { year: 2079, months: [31,32,31,32,31,30,31,30,29,30,29,31] },
      { year: 2080, months: [31,32,31,32,31,30,31,30,29,30,29,30] },
      { year: 2081, months: [31,32,31,32,31,30,31,30,29,30,29,31] },
      { year: 2082, months: [31,31,32,32,31,30,30,30,29,30,30,30] },
      { year: 2083, months: [31,31,32,32,31,30,30,30,30,29,30,30] },
      { year: 2084, months: [31,32,31,32,31,30,30,30,30,29,30,30] },
      { year: 2085, months: [31,32,31,32,31,31,29,30,30,29,30,30] },
    ];
    const row = BS_CALENDAR_MAP.find(r => r.year === year);
    return row ? row.months[month - 1] : 32;
  })();

  const commit = (y, m, d) => {
    const clampedDay = Math.min(d, maxDays);
    if (!isValidBSDate(y, m, clampedDay)) { setError('Invalid B.S. date'); return; }
    const ad = bsToAD(y, m, clampedDay);
    if (!ad) { setError('Cannot convert to A.D.'); return; }
    setError('');
    setDay(clampedDay);
    onChange(ad);
  };

  return (
    <div className="flex flex-col gap-1 min-w-[200px]">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label} (B.S.)</Label>
      <div className="flex gap-1">
        {/* Day */}
        <input
          type="number" min={1} max={maxDays} value={day}
          onChange={e => { const d = Number(e.target.value); setDay(d); commit(year, month, d); }}
          className="w-14 h-8 rounded-md border border-input bg-card px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring tabular-nums"
          placeholder="DD"
        />
        {/* Month */}
        <select
          value={month}
          onChange={e => { const m = Number(e.target.value); setMonth(m); commit(year, m, day); }}
          className="h-8 rounded-md border border-input bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {BS_MONTHS.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
        </select>
        {/* Year */}
        <select
          value={year}
          onChange={e => { const y = Number(e.target.value); setYear(y); commit(y, month, day); }}
          className="h-8 rounded-md border border-input bg-card px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {BS_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {error
        ? <span className="text-xs text-destructive">{error}</span>
        : adValue && <span className="text-xs text-muted-foreground">{adValue} (A.D.)</span>
      }
    </div>
  );
}

// ── Toggle Row ────────────────────────────────────────────────────────────────
function ToggleRow({ id, label, checked, onCheckedChange, description }) {
  return (
    <div className="flex items-center gap-2.5">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} className="scale-90" />
      <div>
        <Label htmlFor={id} className="text-xs font-semibold cursor-pointer">{label}</Label>
        {description && <p className="text-[11px] text-muted-foreground leading-none mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

// ── Main FilterBar ────────────────────────────────────────────────────────────
export default function ReportFilterBar({ filters, onChange, onApply, showApplyButton = false, extraOptions, className }) {
  const [collapsed, setCollapsed] = useState(false);
  const set = (key, val) => onChange({ ...filters, [key]: val });

  return (
    <div className={cn('bg-card border border-border rounded-xl overflow-hidden shadow-sm', className)}>
      <button
        onClick={() => setCollapsed(p => !p)}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-muted/50 hover:bg-slate-100 dark:bg-slate-500/20 transition-colors text-left border-b border-border"
      >
        <Filter className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground flex-1">Filters</span>
        {collapsed
          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
          : <ChevronUp   className="w-4 h-4 text-muted-foreground" />
        }
      </button>

      {!collapsed && (
        <div className="px-4 py-4 space-y-4">
          {/* Row 1: Date Range */}
          <div className="flex flex-wrap gap-6 items-end">
            <BSDatePicker label="From Date" adValue={filters.fromDate} onChange={v => set('fromDate', v)} />
            <BSDatePicker label="To Date"   adValue={filters.toDate}   onChange={v => set('toDate', v)} />
            {showApplyButton && onApply && (
              <button
                onClick={onApply}
                className="h-8 px-4 text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-1.5 self-end"
              >
                <RefreshCw className="w-3 h-3" /> Apply
              </button>
            )}
          </div>

          {/* Row 2: Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3 pt-2 border-t border-border">
            {/* View Options */}
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">View Options</p>
              <ToggleRow id="show-zero" label="ACC. WITH ZERO CLOSING AMT."
                description="Include fully settled accounts"
                checked={filters.showZeroBalance} onCheckedChange={v => set('showZeroBalance', v)} />
              <ToggleRow id="expand-all" label="EXPAND ALL"
                description="Auto-expand all account groups"
                checked={filters.expandAll} onCheckedChange={v => set('expandAll', v)} />
            </div>

            {/* Column Visibility */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3 h-3 text-muted-foreground" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Show Columns</p>
              </div>
              <ToggleRow id="col-opening" label="OPENING BALANCE"
                checked={filters.showOpeningBalance} onCheckedChange={v => set('showOpeningBalance', v)} />
              <ToggleRow id="col-closing" label="CLOSING BALANCE"
                checked={filters.showClosingBalance} onCheckedChange={v => set('showClosingBalance', v)} />
              <ToggleRow id="col-txn" label="TRANSACTIONS (Dr / Cr)"
                checked={filters.showTransactions} onCheckedChange={v => set('showTransactions', v)} />
            </div>

            {/* Extra report-specific options slot */}
            {extraOptions && (
              <div className="space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Additional Columns</p>
                {extraOptions}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}