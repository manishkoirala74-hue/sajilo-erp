import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Calendar, Check, ChevronDown, Search, Sparkles } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose
} from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  adToBS,
  bsToAD,
  BS_MONTHS,
  getTodayBS,
  getMonthPeriod,
  getBSMonthDays
} from '@/lib/nepaliDate';

/**
 * Dynamically generate financial report periods for BS or AD calendar
 * Guarantees zero hardcoded cutoff years; stays evergreen as years roll forward.
 */
export function generateDynamicReportPeriods(calendar = 'BS') {
  const periods = [];

  if (calendar === 'BS') {
    const todayBS = getTodayBS() || { year: 2082, month: 1, day: 1 };
    const curYear = todayBS.year;
    const curMonth = todayBS.month;

    // Nepali Fiscal Year starts in Shrawan (Month 4) and ends in Ashad (Month 3)
    const fyStartYear = curMonth >= 4 ? curYear : curYear - 1;
    const fyLabel = `${fyStartYear}/${String(fyStartYear + 1).slice(-2)}`;
    const prevFyLabel = `${fyStartYear - 1}/${String(fyStartYear).slice(-2)}`;

    // Quick Presets
    periods.push(
      {
        id: 'this_month',
        label: `This Month (${BS_MONTHS[curMonth - 1]} ${curYear})`,
        shortLabel: `${BS_MONTHS[curMonth - 1]} ${curYear}`,
        year: curYear,
        month: curMonth,
        type: 'preset_month',
        category: 'Presets'
      },
      {
        id: 'last_month',
        label: 'Last Month',
        shortLabel: 'Last Month',
        year: curMonth === 1 ? curYear - 1 : curYear,
        month: curMonth === 1 ? 12 : curMonth - 1,
        type: 'preset_month',
        category: 'Presets'
      },
      {
        id: 'this_fy',
        label: `This Fiscal Year (${fyLabel})`,
        shortLabel: `FY ${fyLabel}`,
        fyStartYear,
        type: 'preset_fy',
        category: 'Presets'
      },
      {
        id: 'last_fy',
        label: `Previous Fiscal Year (${prevFyLabel})`,
        shortLabel: `FY ${prevFyLabel}`,
        fyStartYear: fyStartYear - 1,
        type: 'preset_fy',
        category: 'Presets'
      }
    );

    // Rolling list of past 24 months + next 2 months
    let y = curMonth <= 10 ? curYear : curYear + 1;
    let m = curMonth <= 10 ? curMonth + 2 : (curMonth + 2) % 12;
    if (m === 0) m = 12;

    for (let i = 0; i < 26; i++) {
      const monthLabel = `${BS_MONTHS[m - 1]} ${y}`;
      periods.push({
        id: `bs-${y}-${String(m).padStart(2, '0')}`,
        label: monthLabel,
        shortLabel: monthLabel,
        year: y,
        month: m,
        type: 'month',
        category: 'Months'
      });
      m--;
      if (m === 0) {
        m = 12;
        y--;
      }
    }
  } else {
    // AD Calendar
    const today = new Date();
    const curYear = today.getFullYear();
    const curMonth = today.getMonth() + 1;

    periods.push(
      {
        id: 'this_month',
        label: 'This Month',
        shortLabel: 'This Month',
        year: curYear,
        month: curMonth,
        type: 'preset_month',
        category: 'Presets'
      },
      {
        id: 'last_month',
        label: 'Last Month',
        shortLabel: 'Last Month',
        year: curMonth === 1 ? curYear - 1 : curYear,
        month: curMonth === 1 ? 12 : curMonth - 1,
        type: 'preset_month',
        category: 'Presets'
      },
      {
        id: 'this_year',
        label: `This Year (${curYear})`,
        shortLabel: `${curYear}`,
        year: curYear,
        type: 'preset_ad_year',
        category: 'Presets'
      }
    );

    let y = curYear;
    let m = curMonth;
    for (let i = 0; i < 24; i++) {
      const d = new Date(Date.UTC(y, m - 1, 1));
      const monthLabel = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      periods.push({
        id: `ad-${y}-${String(m).padStart(2, '0')}`,
        label: monthLabel,
        shortLabel: monthLabel,
        year: y,
        month: m,
        type: 'month',
        category: 'Months'
      });
      m--;
      if (m === 0) {
        m = 12;
        y--;
      }
    }
  }

  periods.push({
    id: 'custom',
    label: 'Custom Date Range…',
    shortLabel: 'Custom Range',
    type: 'custom',
    category: 'Custom'
  });

  return periods;
}

/**
 * Resolves exact startAD and endAD strings for any selected period metadata
 */
export function resolvePeriodDateRange(period, calendar = 'BS') {
  if (!period || period.type === 'custom') {
    return null;
  }

  if (period.type === 'month' || period.type === 'preset_month') {
    const res = getMonthPeriod(calendar, period.year, period.month);
    return {
      fromDate: res.startAD,
      toDate: res.endAD,
      label: res.label
    };
  }

  if (period.type === 'preset_fy' && calendar === 'BS') {
    const fyStart = period.fyStartYear;
    const startAD = bsToAD(fyStart, 4, 1); // Shrawan 1
    const endMonthDays = getBSMonthDays(fyStart + 1, 3);
    const endAD = bsToAD(fyStart + 1, 3, endMonthDays); // Ashad last day
    return {
      fromDate: startAD,
      toDate: endAD,
      label: period.label
    };
  }

  if (period.type === 'preset_ad_year') {
    return {
      fromDate: `${period.year}-01-01`,
      toDate: `${period.year}-12-31`,
      label: `${period.year}`
    };
  }

  return null;
}

export default function ReportPeriodSelector({
  value,
  fromDate,
  toDate,
  onChange,
  calendar = 'BS',
  className,
  disabled = false
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Dynamic period options
  const periods = useMemo(() => generateDynamicReportPeriods(calendar), [calendar]);

  // Determine current display label
  const activePeriod = useMemo(() => {
    if (value) {
      const match = periods.find(p => p.id === value);
      if (match) return match;
    }
    // Try matching based on fromDate and toDate
    if (fromDate && toDate && calendar === 'BS') {
      const bsFrom = adToBS(fromDate);
      const bsTo = adToBS(toDate);
      if (bsFrom && bsTo && bsFrom.year === bsTo.year && bsFrom.month === bsTo.month && bsFrom.day === 1) {
        const id = `bs-${bsFrom.year}-${String(bsFrom.month).padStart(2, '0')}`;
        const match = periods.find(p => p.id === id);
        if (match) return match;
      }
    }
    return periods.find(p => p.id === 'this_month') || periods[0];
  }, [value, fromDate, toDate, calendar, periods]);

  // Filter periods in real-time
  const filteredPeriods = useMemo(() => {
    if (!search.trim()) return periods;
    const q = search.toLowerCase().trim();
    return periods.filter(p => {
      if (p.label.toLowerCase().includes(q)) return true;
      if (p.id.toLowerCase().includes(q)) return true;
      if (p.year && String(p.year).includes(q)) return true;
      if (p.month && String(p.month) === q) return true;
      return false;
    });
  }, [periods, search]);

  // Reset active index when search or open state changes
  useEffect(() => {
    setActiveIndex(0);
  }, [search, open]);

  // Scroll active item into view
  useEffect(() => {
    if (open && activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex, open]);

  const handleSelect = useCallback(
    period => {
      setOpen(false);
      setSearch('');

      if (period.id === 'custom') {
        onChange?.('custom', null);
        return;
      }

      const range = resolvePeriodDateRange(period, calendar);
      onChange?.(period.id, range);
    },
    [calendar, onChange]
  );

  const handleKeyDown = useCallback(
    e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (prev < filteredPeriods.length - 1 ? prev + 1 : prev));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredPeriods[activeIndex]) {
          handleSelect(filteredPeriods[activeIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    },
    [filteredPeriods, activeIndex, handleSelect]
  );

  // Common inner content rendered inside Desktop Popover or Mobile Drawer
  const renderListContent = (isDrawer = false) => (
    <div className="flex flex-col h-full max-h-[75vh] sm:max-h-[380px]">
      {/* Search Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/40 sticky top-0 z-10">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type month or year (e.g. Kartik 2081)…"
          style={{ fontSize: '16px' }} // Critical: Eliminates iOS Safari auto-zoom
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground font-medium"
          autoFocus={!isDrawer}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-xs text-muted-foreground hover:text-foreground px-1 py-0.5 rounded"
          >
            Clear
          </button>
        )}
      </div>

      {/* Quick Chips for Common Presets */}
      {!search && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/60 bg-muted/20 overflow-x-auto scrollbar-hide shrink-0">
          <button
            type="button"
            onClick={() => {
              const tm = periods.find(p => p.id === 'this_month');
              if (tm) handleSelect(tm);
            }}
            className="px-2.5 py-1 text-[11px] font-semibold bg-background border border-border rounded-full hover:bg-primary/10 hover:text-primary transition-colors shrink-0"
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => {
              const lm = periods.find(p => p.id === 'last_month');
              if (lm) handleSelect(lm);
            }}
            className="px-2.5 py-1 text-[11px] font-semibold bg-background border border-border rounded-full hover:bg-primary/10 hover:text-primary transition-colors shrink-0"
          >
            Last Month
          </button>
          {calendar === 'BS' && (
            <button
              type="button"
              onClick={() => {
                const tfy = periods.find(p => p.id === 'this_fy');
                if (tfy) handleSelect(tfy);
              }}
              className="px-2.5 py-1 text-[11px] font-semibold bg-background border border-border rounded-full hover:bg-primary/10 hover:text-primary transition-colors shrink-0"
            >
              This Fiscal Year
            </button>
          )}
        </div>
      )}

      {/* Options List */}
      <div ref={listRef} className="overflow-y-auto flex-1 p-1 divide-y divide-border/20">
        {filteredPeriods.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No matching periods found for &ldquo;{search}&rdquo;
          </div>
        ) : (
          filteredPeriods.map((period, index) => {
            const isSelected = activePeriod?.id === period.id;
            const isHighlighted = index === activeIndex;

            return (
              <button
                key={period.id}
                data-index={index}
                type="button"
                onClick={() => handleSelect(period)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2.5 sm:py-2 text-left rounded-md transition-colors',
                  isHighlighted && 'bg-accent text-accent-foreground',
                  isSelected && !isHighlighted && 'bg-primary/10 text-primary font-medium'
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {period.type === 'custom' ? (
                    <Calendar className="w-4 h-4 text-primary shrink-0" />
                  ) : period.type.startsWith('preset') ? (
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate">{period.label}</span>
                </div>
                {isSelected && <Check className="w-4 h-4 text-primary shrink-0 ml-2" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  const triggerButton = (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 py-2 text-xs sm:text-sm font-medium shadow-sm transition-all hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 text-foreground',
        className
      )}
    >
      <div className="flex items-center gap-2 truncate">
        <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="truncate">{activePeriod ? activePeriod.shortLabel || activePeriod.label : 'Select Period…'}</span>
      </div>
      <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
    </button>
  );

  // 1. Mobile Experience: vaul-powered Drawer (bottom sheet)
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
        <DrawerContent className="p-0 max-h-[85vh] rounded-t-2xl">
          <DrawerHeader className="px-4 py-3 border-b border-border flex items-center justify-between text-left">
            <div>
              <DrawerTitle className="text-sm font-bold">Select Period / Month</DrawerTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Pick or search month and fiscal year</p>
            </div>
            <DrawerClose asChild>
              <button type="button" className="text-xs font-semibold px-2 py-1 text-muted-foreground hover:text-foreground">
                Done
              </button>
            </DrawerClose>
          </DrawerHeader>
          {renderListContent(true)}
        </DrawerContent>
      </Drawer>
    );
  }

  // 2. Desktop Experience: Radix Popover
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="p-0 w-[320px] shadow-lg rounded-xl border border-border bg-popover text-popover-foreground overflow-hidden"
        onOpenAutoFocus={e => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {renderListContent(false)}
      </PopoverContent>
    </Popover>
  );
}
