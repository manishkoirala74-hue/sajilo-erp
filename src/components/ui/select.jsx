"use client"

import * as React from "react"
import { Check, ChevronDown } from "lucide-react"
import { Command as CommandPrimitive } from "cmdk"
import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command"

const SelectContext = React.createContext({})

const Select = ({ value, defaultValue, onValueChange, children, disabled, onOpenChange }) => {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [labels, setLabels] = React.useState({})
  
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");
  const isControlled = value !== undefined;
  const actualValue = isControlled ? value : internalValue;

  const handleValueChange = (v) => {
    if (!isControlled) setInternalValue(v);
    if (onValueChange) onValueChange(v);
  }

  const handleOpenChange = (newOpen) => {
    setOpen(newOpen);
    if (onOpenChange) onOpenChange(newOpen);
    if (!newOpen) setSearch(""); 
  }

  const registerItem = React.useCallback((val, label) => {
    setLabels(prev => {
      if (prev[val] === label) return prev;
      return { ...prev, [val]: label }
    })
  }, [])

  return (
    <SelectContext.Provider value={{ 
      value: actualValue, onValueChange: handleValueChange, open, setOpen: handleOpenChange, search, setSearch, disabled, labels, registerItem 
    }}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <Command shouldFilter={false} className="overflow-visible bg-transparent">
          {children}
        </Command>
      </Popover>
    </SelectContext.Provider>
  )
}

const SelectTrigger = React.forwardRef(({ className, children, onClick, ...props }, ref) => {
  const { open, setOpen, disabled, search, setSearch, value, labels } = React.useContext(SelectContext)
  
  let placeholder = "";
  React.Children.forEach(children, child => {
    if (React.isValidElement(child) && child.type.displayName === "SelectValue") {
      placeholder = child.props.placeholder || "";
    }
  });

  const displayValue = open ? search : (value ? (labels[value] || value) : "");

  return (
    <PopoverAnchor asChild>
      <div className={cn("relative w-full", className)}>
        <CommandPrimitive.Input
          ref={ref}
          disabled={disabled}
          placeholder={placeholder}
          value={displayValue}
          onValueChange={(v) => {
            if (!open) setOpen(true);
            setSearch(v);
          }}
          onClick={(e) => {
            setOpen(true);
            if (onClick) onClick(e);
          }}
          className={cn(
            "flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 pr-8 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
            disabled && "cursor-not-allowed opacity-50 bg-muted/50"
          )}
          {...props}
        />
        <ChevronDown 
          className="absolute right-3 top-2.5 h-4 w-4 opacity-50 cursor-pointer hover:opacity-100" 
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

const SelectContent = React.forwardRef(({ className, children, position = "popper", searchable = true, ...props }, ref) => {
  const { open } = React.useContext(SelectContext)

  return (
    <>
      {!open && (
        <div className="hidden" style={{ display: 'none' }} aria-hidden="true">
          <CommandList>{children}</CommandList>
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
          <CommandList className="max-h-[300px] overflow-y-auto overflow-x-hidden p-1">
            <CommandEmpty>No results found.</CommandEmpty>
            {children}
          </CommandList>
        </PopoverContent>
      )}
    </>
  )
})
SelectContent.displayName = "SelectContent"

const SelectItem = React.forwardRef(({ className, children, value, disabled, ...props }, ref) => {
  const { value: selectedValue, onValueChange, setOpen, search, registerItem } = React.useContext(SelectContext)

  const textContent = React.useMemo(() => {
    let text = "";
    const extract = (node) => {
      if (typeof node === 'string' || typeof node === 'number') text += node;
      else if (Array.isArray(node)) node.forEach(extract);
      else if (React.isValidElement(node)) extract(node.props.children);
    };
    extract(children);
    return text;
  }, [children]);

  React.useEffect(() => {
    registerItem(value, textContent);
  }, [value, textContent, registerItem]);

  if (search && textContent && !textContent.toLowerCase().includes(search.toLowerCase())) {
    return null;
  }

  const isSelected = selectedValue === value;

  return (
    <CommandItem
      ref={ref}
      value={String(value)}
      disabled={disabled}
      onSelect={() => {
        if (!disabled) {
          onValueChange(value);
          setOpen(false);
        }
      }}
      className={cn(
        "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
        isSelected ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/50",
        className
      )}
      {...props}
    >
      <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
        {isSelected && <Check className="h-4 w-4 text-primary" />}
      </span>
      {children}
    </CommandItem>
  )
})
SelectItem.displayName = "SelectItem"

const SelectGroup = React.forwardRef(({ className, ...props }, ref) => (
  <CommandGroup ref={ref} className={cn("p-1", className)} {...props} />
))
SelectGroup.displayName = "SelectGroup"

const SelectLabel = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-2 py-1.5 text-sm font-semibold text-muted-foreground", className)} {...props} />
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
