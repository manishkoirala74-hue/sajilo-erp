/**
 * ReportFilterBar — Decentralized, injected per report view.
 * Features industry-standard Period / Month Selector (Tier 1),
 * dynamic rolling months, and expandable arbitrary B.S./A.D. date picker (Tier 2).
 */
import { useState, useEffect } from 'react';
import { Filter, ChevronDown, ChevronUp, Eye, RefreshCw, Calendar, SlidersHorizontal } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { adToBS, bsToAD, BS_MONTHS, isValidBSDate } from '@/lib/nepaliDate';
import { useDateFormat } from '@/lib/DateFormatContext';
import ReportPeriodSelector from '@/components/reports/ReportPeriodSelector';

const BS_YEARS = [2078, 2079, 2080, 2081, 2082, 2083, 2084, 2085, 2086, 2087];

// ── Arbitrary BS Date Picker (day + month + year) ─────────────────────────────
export function BSDatePicker({ label, adValue, onChange }) {
  const { displayBsDate, dateFormat } = useDateFormat();
  const init = adValue ? adToBS(adValue) : null;

  const [mode, setMode] = useState(dateFormat);
  const [year,  setYear]  = useState(init?.year  || 2082);
  const [month, setMonth] = useState(init?.month || 1);
  const [day,   setDay]   = useState(init?.day   || 1);
  const [error, setError] = useState('');

  useEffect(() => { setMode(dateFormat); }, [dateFormat]);

  // Keep local state in sync when adValue changes externally
  useEffect(() => {
    if (!adValue) return;
    const bs = adToBS(adValue);
    if (bs) { setYear(bs.year); setMonth(bs.month); setDay(bs.day); }
  }, [adValue]);

  const getTargetMonthMaxDays = (y, m) => {
    const BS_CALENDAR_MAP = [
      { year: 2078, months: [31,32,31,32,31,30,31,30,29,30,29,30] },
      { year: 2079, months: [31,32,31,32,31,30,31,30,29,30,29,31] },
      { year: 2080, months: [31,32,31,32,31,30,31,30,29,30,29,30] },
      { year: 2081, months: [31,32,31,32,31,30,31,30,29,30,29,31] },
      { year: 2082, months: [31,31,32,32,31,30,30,30,29,30,30,30] },
      { year: 2083, months: [31,31,32,32,31,30,30,30,30,29,30,30] },
      { year: 2084, months: [31,32,31,32,31,30,30,30,30,29,30,30] },
      { year: 2085, months: [31,32,31,32,31,31,29,30,30,29,30,30] },
      { year: 2086, months: [31,32,31,32,31,31,30,29,30,29,30,30] },
      { year: 2087, months: [31,32,31,32,31,31,30,29,30,29,30,30] },
    ];
    const row = BS_CALENDAR_MAP.find(r => r.year === y);
    return row ? row.months[m - 1] : 32;
  };

  const commit = (y, m, d) => {
    const maxDays = getTargetMonthMaxDays(y, m);
    const clampedDay = Math.min(d, maxDays);
    if (!isValidBSDate(y, m, clampedDay)) { setError('Invalid B.S. date'); return; }
    const ad = bsToAD(y, m, clampedDay);
    if (!ad) { setError('Cannot convert to A.D.'); return; }
    setError('');
    setDay(clampedDay);
    onChange(ad);
  };

  const toggleMode = () => setMode(m => m === 'AD' ? 'BS' : 'AD');
  const effectiveMode = displayBsDate ? mode : 'AD';

  if (effectiveMode === 'AD') {
    return (
      <div className="flex flex-col gap-1 min-w-[200px]">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label} (A.D.)</Label>
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={adValue || ''}
            onChange={e => onChange(e.target.value)}
            style={{ fontSize: '16px' }}
            className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring flex-1 text-foreground"
          />
          {displayBsDate && (
            <button
              type="button"
              onClick={toggleMode}
              title="Switch to Nepali (BS)"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-input bg-muted/50 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors shrink-0 h-9"
            >
              <Calendar className="w-3.5 h-3.5" />
              AD
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 min-w-[200px]">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label} (B.S.)</Label>
      <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
        {/* Day */}
        <input
          type="number"
          min={1}
          max={getTargetMonthMaxDays(year, month)}
          value={day}
          onChange={e => { const d = Number(e.target.value); setDay(d); commit(year, month, d); }}
          style={{ fontSize: '16px' }}
          className="w-14 h-9 rounded-lg border border-input bg-card px-2 text-sm text-center focus:outline-none focus:ring-1 focus:ring-ring tabular-nums text-foreground"
          placeholder="DD"
        />
        {/* Month */}
        <Select
          value={String(month)}
          onValueChange={v => { const m = Number(v); setMonth(m); commit(year, m, day); }}
        >
          <SelectTrigger className="h-9 w-28 bg-card px-2.5 text-xs sm:text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BS_MONTHS.map((name, i) => <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        {/* Year */}
        <Select
          value={String(year)}
          onValueChange={v => { const y = Number(v); setYear(y); commit(y, month, day); }}
        >
          <SelectTrigger className="h-9 w-24 bg-card px-2.5 text-xs sm:text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BS_YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={toggleMode}
          title="Switch to English (AD)"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-input bg-muted/50 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors shrink-0 h-9"
        >
          <Calendar className="w-3.5 h-3.5" />
          BS
        </button>
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
export default function ReportFilterBar({
  filters,
  onChange,
  onApply,
  showApplyButton = false,
  extraOptions,
  className
}) {
  const { displayBsDate, dateFormat } = useDateFormat();
  const effectiveCalendar = displayBsDate ? dateFormat : 'AD';

  const [collapsed, setCollapsed] = useState(false);
  const [periodId, setPeriodId] = useState('this_month');
  const [showCustomRange, setShowCustomRange] = useState(false);

  // Sync or infer initial period state
  useEffect(() => {
    if (!filters.fromDate || !filters.toDate) return;
    if (effectiveCalendar === 'BS') {
      const bsFrom = adToBS(filters.fromDate);
      const bsTo = adToBS(filters.toDate);
      if (bsFrom && bsTo && bsFrom.year === bsTo.year && bsFrom.month === bsTo.month && bsFrom.day === 1) {
        setPeriodId(`bs-${bsFrom.year}-${String(bsFrom.month).padStart(2, '0')}`);
      }
    }
  }, [filters.fromDate, filters.toDate, effectiveCalendar]);

  const handlePeriodChange = (selectedId, range) => {
    setPeriodId(selectedId);

    if (selectedId === 'custom') {
      setShowCustomRange(true);
      return;
    }

    if (range?.fromDate && range?.toDate) {
      onChange({
        ...filters,
        fromDate: range.fromDate,
        toDate: range.toDate
      });
    }
  };

  const set = (key, val) => onChange({ ...filters, [key]: val });

  return (
    <div className={cn('bg-card border border-border rounded-xl overflow-hidden shadow-sm', className)}>
      <button
        type="button"
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
          {/* Tier 1: Primary Period Selector + Actions */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-1">
            <div className="w-full sm:w-80 space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block">
                Period / Month
              </Label>
              <ReportPeriodSelector
                value={periodId}
                fromDate={filters.fromDate}
                toDate={filters.toDate}
                calendar={effectiveCalendar}
                onChange={handlePeriodChange}
              />
            </div>

            <div className="flex items-center gap-2 self-start sm:self-end">
              <button
                type="button"
                onClick={() => setShowCustomRange(p => !p)}
                className={cn(
                  'h-9 px-3 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5',
                  showCustomRange
                    ? 'bg-accent border-accent text-accent-foreground'
                    : 'bg-background border-input text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
                title="Toggle specific day-by-day dates"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {showCustomRange ? 'Hide Custom Dates' : 'Custom Dates…'}
              </button>

              {showApplyButton && onApply && (
                <button
                  type="button"
                  onClick={onApply}
                  className="h-9 px-4 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Apply
                </button>
              )}
            </div>
          </div>

          {/* Tier 2: Expandable Custom Date Range (Day-by-Day) */}
          {showCustomRange && (
            <div className="p-3.5 rounded-lg border border-dashed border-border bg-muted/20 space-y-2 animate-in fade-in-50 duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Arbitrary Day-by-Day Range
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Adjust exact start and end dates
                </span>
              </div>
              <div className="flex flex-wrap gap-4 items-end">
                <BSDatePicker label="From Date" adValue={filters.fromDate} onChange={v => set('fromDate', v)} />
                <BSDatePicker label="To Date"   adValue={filters.toDate}   onChange={v => set('toDate', v)} />
              </div>
            </div>
          )}

          {/* Row 2: Toggles & Display Options */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3 pt-3 border-t border-border">
            {/* View Options */}
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">View Options</p>
              <ToggleRow
                id="show-zero"
                label="ACC. WITH ZERO CLOSING AMT."
                description="Include fully settled accounts"
                checked={filters.showZeroBalance}
                onCheckedChange={v => set('showZeroBalance', v)}
              />
              <ToggleRow
                id="expand-all"
                label="EXPAND ALL"
                description="Auto-expand all account groups"
                checked={filters.expandAll}
                onCheckedChange={v => set('expandAll', v)}
              />
            </div>

            {/* Column Visibility */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3 h-3 text-muted-foreground" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Show Columns</p>
              </div>
              <ToggleRow
                id="col-opening"
                label="OPENING BALANCE"
                checked={filters.showOpeningBalance}
                onCheckedChange={v => set('showOpeningBalance', v)}
              />
              <ToggleRow
                id="col-closing"
                label="CLOSING BALANCE"
                checked={filters.showClosingBalance}
                onCheckedChange={v => set('showClosingBalance', v)}
              />
              <ToggleRow
                id="col-txn"
                label="TRANSACTIONS (Dr / Cr)"
                checked={filters.showTransactions}
                onCheckedChange={v => set('showTransactions', v)}
              />
              <ToggleRow
                id="col-bs-date"
                label="BS DATE COLUMN"
                checked={filters.showBsDate}
                onCheckedChange={v => set('showBsDate', v)}
              />
            </div>

            {/* Extra report-specific options slot */}
            {extraOptions && (
              <div className="space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Additional Options</p>
                {extraOptions}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}