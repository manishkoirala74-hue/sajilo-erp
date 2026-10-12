import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Search, Check, ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * ERPCombobox — World-Class Virtualized Dropdown & Selection Engine.
 * Supports 10,000+ records at 60FPS using headless DOM virtualization.
 * Implements the standard ERP keyboard traversal contract:
 * - ArrowDown / ArrowUp: scroll and highlight
 * - Enter: commit and advance
 * - Tab: auto-commit highlighted match and advance
 * - Escape: cancel and close
 */
export const ERPCombobox = React.memo(React.forwardRef(function ERPCombobox({
  value,
  onValueChange,
  onChange,
  options = [],
  placeholder = "Select...",
  searchPlaceholder = "Type to search...",
  onCreateNew,
  createNewText = "Create New",
  className,
  onCommitNext,
  disabled = false,
  ...domProps
}, ref) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const parentScrollRef = useRef(null);

  // Fast in-memory search across label, code, and subtitle
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => 
      o.label?.toLowerCase().includes(q) || 
      o.code?.toLowerCase().includes(q) ||
      o.sub?.toLowerCase().includes(q)
    );
  }, [options, search]);

  // Reset active highlight when search changes
  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  // Headless Virtualizer — only renders visible rows in DOM viewport
  const rowVirtualizer = useVirtualizer({
    count: filteredOptions.length,
    getScrollElement: () => parentScrollRef.current,
    estimateSize: () => 44,
    overscan: 5,
  });

  // Keep scroll position aligned with keyboard selection
  useEffect(() => {
    if (open && activeIndex >= 0 && activeIndex < filteredOptions.length) {
      rowVirtualizer.scrollToIndex(activeIndex, { align: 'auto' });
    }
  }, [activeIndex, open, filteredOptions.length, rowVirtualizer]);

  const commitSelection = useCallback((val) => {
    if (onValueChange) onValueChange(val);
    if (onChange) onChange(val);
    setOpen(false);
    setSearch('');
    onCommitNext?.();
  }, [onValueChange, onChange, onCommitNext]);

  // Keyboard Navigation Contract
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[activeIndex]) {
        commitSelection(filteredOptions[activeIndex].value);
      }
    } else if (e.key === 'Tab') {
      // Auto-commit highlighted option on Tab (ERP standard)
      if (filteredOptions[activeIndex]) {
        commitSelection(filteredOptions[activeIndex].value);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setSearch('');
    }
  };

  const selectedOption = useMemo(() => 
    options.find(o => o.value === value), 
    [options, value]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          ref={ref}
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
            "focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            !selectedOption && "text-muted-foreground",
            className
          )}
          onKeyDown={(e) => {
            if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey))) {
              e.preventDefault();
              setOpen(true);
              if (e.key.length === 1) setSearch(e.key);
            }
          }}
          {...domProps}
        >
          <span className="truncate">{selectedOption?.label || placeholder}</span>
          <ChevronDown className={cn("h-4 w-4 opacity-50 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
      </PopoverTrigger>

      <PopoverContent 
        className="p-0 z-[100] w-[var(--radix-popover-trigger-width)] min-w-[320px] max-w-[500px]" 
        align="start"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {/* Search Input Box */}
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {/* Headless Virtualized List Container */}
        <div 
          ref={parentScrollRef} 
          className="overflow-y-auto max-h-[300px] p-1 scrollbar-hide-default"
        >
          {filteredOptions.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No matches found</div>
          ) : (
            <div 
              style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const opt = filteredOptions[virtualRow.index];
                const isMatched = opt.value === value;
                const isHighlighted = virtualRow.index === activeIndex;

                return (
                  <div
                    key={opt.value}
                    data-index={virtualRow.index}
                    onClick={() => commitSelection(opt.value)}
                    onMouseEnter={() => setActiveIndex(virtualRow.index)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer transition-colors",
                      isMatched && "bg-primary/10 text-primary font-medium",
                      isHighlighted && "bg-accent text-accent-foreground outline-none ring-1 ring-ring/40"
                    )}
                  >
                    <Check className={cn("w-3.5 h-3.5 shrink-0", isMatched ? "opacity-100 text-primary" : "opacity-0")} />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate">{opt.label}</span>
                      {(opt.code || opt.sub) && (
                        <span className="text-[11px] text-muted-foreground font-mono">{opt.code || opt.sub}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Optional Quick Create Button */}
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
}));

export default ERPCombobox;
