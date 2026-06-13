import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Search, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

/**
 * SearchableSelect — a drop-in replacement for <Select> that adds live filtering.
 * Uses Popover to render the dropdown in a Portal, preventing overflow clipping.
 */
export default function SearchableSelect({
  value,
  onValueChange,
  onChange,
  options = [],
  groups = null,
  placeholder = 'Select…',
  className,
  disabled = false,
  onCreateNew,
  createNewText = "Create New",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Focus search input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
      setActiveIndex(-1);
    }
  }, [open]);

  // Reset active index when search changes
  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  const filterOpts = (opts) =>
    opts.filter(o =>
      !search ||
      o.label?.toLowerCase().includes(search.toLowerCase()) ||
      o.sub?.toLowerCase().includes(search.toLowerCase())
    );

  // Flat array of currently visible options for keyboard navigation
  const flatVisibleOptions = groups
    ? groups.flatMap(g => filterOpts(g.options))
    : filterOpts(options);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < flatVisibleOptions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < flatVisibleOptions.length) {
        handleSelect(flatVisibleOptions[activeIndex].value);
      }
    }
  };

  // Resolve display label
  const allFlat = groups
    ? groups.flatMap(g => g.options)
    : options;
  const selected = allFlat.find(o => o.value === value);
  const displayLabel = selected ? selected.label : null;

  const handleSelect = (val) => {
    if (onValueChange) onValueChange(val);
    if (onChange) onChange(val);
    setOpen(false);
    setSearch('');
  };

  let currentIndex = 0;
  const renderOption = (opt) => {
    const isMatched = opt.value === value;
    const isHighlighted = currentIndex === activeIndex;
    const itemIndex = currentIndex++;
    
    return (
      <button
        key={opt.value}
        data-index={itemIndex}
        type="button"
        onClick={() => handleSelect(opt.value)}
        onMouseEnter={() => setActiveIndex(itemIndex)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left rounded-md transition-colors hover:bg-accent',
          isMatched && 'bg-accent font-medium',
          isHighlighted && 'bg-accent outline-none ring-1 ring-ring/50'
        )}
      >
        <Check className={cn('w-3.5 h-3.5 shrink-0', isMatched ? 'opacity-100 text-primary' : 'opacity-0')} />
        <span className="flex-1 truncate">{opt.label}</span>
        {opt.sub && <span className="text-xs text-muted-foreground font-mono shrink-0">{opt.sub}</span>}
      </button>
    );
  };

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
            onKeyDown={handleKeyDown}
            placeholder="Type to filter…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Options list */}
        <div className="overflow-y-auto max-h-72 p-1" ref={listRef}>
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
            flatVisibleOptions.length === 0
              ? <p className="px-3 py-4 text-sm text-center text-muted-foreground">No results</p>
              : filterOpts(options).map(renderOption)
          )}
        </div>
        {onCreateNew && (
          <div className="p-1 border-t bg-muted/10">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreateNew();
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-primary font-medium rounded-md hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              <Plus className="w-4 h-4" />
              {createNewText}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}