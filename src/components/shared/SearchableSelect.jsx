import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

/**
 * SearchableSelect — a drop-in replacement for <Select> that adds live filtering.
 * Uses Popover to render the dropdown in a Portal, preventing overflow clipping.
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
  const inputRef = useRef(null);

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
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setSearch(''); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
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
      </PopoverTrigger>

      <PopoverContent 
        className="p-0 z-[100]" 
        align="start"
        style={{ width: 'var(--radix-popover-trigger-width)', minWidth: '12rem' }}
      >
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
        <div className="overflow-y-auto max-h-72 p-1">
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
      </PopoverContent>
    </Popover>
  );
}