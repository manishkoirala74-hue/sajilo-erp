"use client"

import * as React from "react"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover"

const SelectContext = React.createContext({})

const Select = ({ value, defaultValue, onValueChange, children, disabled, onOpenChange }) => {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [labels, setLabels] = React.useState({})
  const [items, setItems] = React.useState([])
  const [activeIndex, setActiveIndex] = React.useState(0)
  
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");
  const isControlled = value !== undefined;
  const actualValue = isControlled ? value : internalValue;

  const handleValueChange = React.useCallback((v) => {
    if (!isControlled) setInternalValue(v);
    if (onValueChange) onValueChange(v);
  }, [isControlled, onValueChange]);

  const handleOpenChange = React.useCallback((newOpen) => {
    setOpen(newOpen);
    if (onOpenChange) onOpenChange(newOpen);
    if (!newOpen) {
      setSearch("");
      setActiveIndex(0);
    }
  }, [onOpenChange]);

  const registerItem = React.useCallback((val, label) => {
    setLabels(prev => {
      if (prev[val] === label) return prev;
      return { ...prev, [val]: label }
    });
    setItems(prev => {
      const idx = prev.findIndex(item => item.value === val);
      if (idx >= 0) {
        if (prev[idx].label === label) return prev;
        const copy = [...prev];
        copy[idx] = { value: val, label };
        return copy;
      }
      return [...prev, { value: val, label }];
    });
  }, []);

  const unregisterItem = React.useCallback((val) => {
    setItems(prev => prev.filter(item => item.value !== val));
  }, []);

  // Filter items matching active search
  const visibleItems = React.useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(item => item.label && item.label.toLowerCase().includes(q));
  }, [items, search]);

  // Reset active highlight when search query shifts
  React.useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  return (
    <SelectContext.Provider value={{ 
      value: actualValue, 
      onValueChange: handleValueChange, 
      open, 
      setOpen: handleOpenChange, 
      search, 
      setSearch, 
      disabled, 
      labels, 
      registerItem,
      unregisterItem,
      items,
      visibleItems,
      activeIndex,
      setActiveIndex
    }}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <div className="relative w-full">
          {children}
        </div>
      </Popover>
    </SelectContext.Provider>
  )
}

const SelectTrigger = React.forwardRef(({ className, children, onClick, onKeyDown, ...props }, ref) => {
  const { 
    open, 
    setOpen, 
    disabled, 
    search, 
    setSearch, 
    value, 
    labels, 
    visibleItems, 
    activeIndex, 
    setActiveIndex, 
    onValueChange 
  } = React.useContext(SelectContext)
  
  let placeholder = "";
  React.Children.forEach(children, child => {
    if (React.isValidElement(child) && child.type.displayName === "SelectValue") {
      placeholder = child.props.placeholder || "";
    }
  });

  const displayLabel = value ? (labels[value] || value) : "";

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        setOpen(true);
        if (e.key.length === 1 && e.key !== ' ') {
          setSearch(e.key);
        }
      }
      onKeyDown?.(e);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < visibleItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : visibleItems.length - 1));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (visibleItems[activeIndex]) {
        e.preventDefault();
        onValueChange(visibleItems[activeIndex].value);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }

    onKeyDown?.(e);
  };

  return (
    <PopoverAnchor asChild>
      <div className={cn("relative w-full", className)}>
        <input
          ref={ref}
          disabled={disabled}
          placeholder={open && search ? placeholder : (displayLabel || placeholder)}
          value={open ? search : displayLabel}
          onChange={(e) => {
            if (!open) setOpen(true);
            setSearch(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          onClick={(e) => {
            if (!disabled) {
              setOpen(true);
              if (onClick) onClick(e);
            }
          }}
          className={cn(
            "flex h-11 sm:h-10 w-full rounded-xl border border-transparent bg-stone-100/80 px-3 py-2 pr-8 text-base sm:text-sm transition-all duration-200 ring-offset-background placeholder:text-stone-400 hover:bg-stone-200/50 focus:outline-none focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50",
            disabled && "cursor-not-allowed opacity-50 bg-stone-100"
          )}
          {...props}
        />
        <ChevronDown 
          className="absolute right-3 top-3.5 sm:top-2.5 h-4 w-4 opacity-50 cursor-pointer hover:opacity-100" 
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled) setOpen(!open);
          }}
        />
      </div>
    </PopoverAnchor>
  )
})
SelectTrigger.displayName = "SelectTrigger"

const SelectValue = React.forwardRef(() => null)
SelectValue.displayName = "SelectValue"

const SelectContent = React.forwardRef(({ className, children, position = "popper", ...props }, ref) => {
  const { open, visibleItems } = React.useContext(SelectContext)

  return (
    <>
      {!open && (
        <div className="hidden" style={{ display: 'none' }} aria-hidden="true">
          {children}
        </div>
      )}
      {open && (
        <PopoverContent
          ref={ref}
          className={cn(
            "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md p-0",
            position === "popper" && "w-[var(--radix-popover-trigger-width)]",
            className
          )}
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          {...props}
        >
          <div className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1 scrollbar-hide-default" role="listbox">
            {visibleItems.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No results found.</div>
            ) : (
              children
            )}
          </div>
        </PopoverContent>
      )}
    </>
  )
})
SelectContent.displayName = "SelectContent"

const SelectItem = React.forwardRef(({ className, children, value, disabled, ...props }, ref) => {
  const { 
    value: selectedValue, 
    onValueChange, 
    setOpen, 
    search, 
    registerItem, 
    unregisterItem,
    visibleItems,
    activeIndex,
    setActiveIndex
  } = React.useContext(SelectContext)

  const textContent = React.useMemo(() => {
    let text = "";
    const extract = (node) => {
      if (typeof node === 'string' || typeof node === 'number') text += node;
      else if (Array.isArray(node)) node.forEach(extract);
      else if (React.isValidElement(node)) extract(node.props.children);
    };
    extract(children);
    return text.trim();
  }, [children]);

  React.useEffect(() => {
    registerItem(value, textContent);
    return () => unregisterItem(value);
  }, [value, textContent, registerItem, unregisterItem]);

  if (search && textContent && !textContent.toLowerCase().includes(search.toLowerCase())) {
    return null;
  }

  const isSelected = selectedValue === value;
  const itemIndex = visibleItems.findIndex(i => i.value === value);
  const isHighlighted = itemIndex >= 0 && itemIndex === activeIndex;

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isSelected}
      data-disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onValueChange(value);
          setOpen(false);
        }
      }}
      onMouseEnter={() => {
        if (itemIndex >= 0) setActiveIndex(itemIndex);
      }}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none transition-colors",
        disabled && "pointer-events-none opacity-50",
        isSelected && "bg-accent text-accent-foreground font-medium",
        isHighlighted && "bg-accent/80 text-accent-foreground ring-1 ring-ring/30",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        {isSelected && <Check className="h-4 w-4 text-primary" />}
      </span>
      {children}
    </div>
  )
})
SelectItem.displayName = "SelectItem"

const SelectGroup = React.forwardRef(({ className, children, ...props }, ref) => (
  <div ref={ref} className={cn("p-1", className)} {...props}>
    {children}
  </div>
))
SelectGroup.displayName = "SelectGroup"

const SelectLabel = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground", className)} {...props} />
))
SelectLabel.displayName = "SelectLabel"

const SelectSeparator = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
))
SelectSeparator.displayName = "SelectSeparator"

const SelectScrollUpButton = React.forwardRef(() => null)
SelectScrollUpButton.displayName = "SelectScrollUpButton"
const SelectScrollDownButton = React.forwardRef(() => null)
SelectScrollDownButton.displayName = "SelectScrollDownButton"

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
}
