import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * SearchableSelect — a drop-in replacement for <Select> that adds live filtering.
 *
 * Props:
 *   value        – current selected value (string)
 *   onValueChange– callback(value)
 *   options      – array of { value, label, sub? }  (sub = small grey hint text)
 *   placeholder  – string shown when nothing is selected
 *   className    – applied to the trigger button
 *   disabled     – boolean
 *   groups       – optional array of { label, options[] } for grouped lists
 */
export default function SearchableSelect({
  value,
  onValueChange,
  options = [],
  groups = null,
  placeholder = 'Select…',
  className,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const filterOpts = (opts) =>
    opts.filter(o =>
      !search ||
      o.label?.toLowerCase().includes(search.toLowerCase()) ||
      o.sub?.toLowerCase().includes(search.toLowerCase())
    );

  // Resolve display label
  const allFlat = groups
    ? groups.flatMap(g => g.options)
    : options;
  const selected = allFlat.find(o => o.value === value);
  const displayLabel = selected ? selected.label : null;

  const handleSelect = (val) => {
    onValueChange(val);
    setOpen(false);
    setSearch('');
  };

  const renderOption = (opt) => (
    <button
      key={opt.value}
      type="button"
      onClick={() => handleSelect(opt.value)}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left rounded-md transition-colors hover:bg-accent',
        opt.value === value && 'bg-accent font-medium'
      )}
    >
      <Check className={cn('w-3.5 h-3.5 shrink-0', opt.value === value ? 'opacity-100 text-primary' : 'opacity-0')} />
      <span className="flex-1 truncate">{opt.label}</span>
      {opt.sub && <span className="text-xs text-muted-foreground font-mono shrink-0">{opt.sub}</span>}
    </button>
  );

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !displayLabel && 'text-muted-foreground',
          className
        )}
      >
        <span className="truncate">{displayLabel || placeholder}</span>
        <ChevronDown className={cn('h-4 w-4 opacity-50 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[12rem] max-h-72 flex flex-col rounded-md border bg-popover shadow-md overflow-hidden">
          {/* Search box */}
          <div className="flex items-center gap-2 px-2 py-1.5 border-b bg-muted/30">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type to filter…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Options list */}
          <div className="overflow-y-auto flex-1 p-1">
            {groups ? (
              groups.map(g => {
                const filtered = filterOpts(g.options);
                if (filtered.length === 0 && search) return null;
                return (
                  <div key={g.label}>
                    <p className="px-2 py-1 text-xs font-bold text-muted-foreground uppercase tracking-wider">{g.label}</p>
                    {filtered.map(renderOption)}
                  </div>
                );
              })
            ) : (
              filterOpts(options).length === 0
                ? <p className="px-3 py-4 text-sm text-center text-muted-foreground">No results</p>
                : filterOpts(options).map(renderOption)
            )}
          </div>
        </div>
      )}
    </div>
  );
}