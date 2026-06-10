import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useNavigate } from 'react-router-dom';

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const runCommand = (command) => {
    setOpen(false);
    command();
  };

  return (
    <>
      <div 
        className="hidden md:flex items-center gap-2 bg-muted/50 hover:bg-muted rounded-lg px-3 py-1.5 w-64 cursor-pointer border border-transparent transition-colors"
        onClick={() => setOpen(true)}
      >
        <Search className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground flex-1 select-none">Quick search...</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </div>

      <button
        onClick={() => setOpen(true)}
        className="md:hidden p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors touch-target"
      >
        <Search className="w-5 h-5" />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search menus, partners, items..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Suggestions">
            <CommandItem onSelect={() => runCommand(() => navigate('/sales/invoices/new'))}>
              Create Sales Invoice
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate('/partners/customers'))}>
              View Customers
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate('/inventory/items'))}>
              Search Items
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Modules">
            <CommandItem onSelect={() => runCommand(() => navigate('/sales/orders'))}>
              Sales
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate('/purchase/orders'))}>
              Purchases
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => navigate('/accounting/general-ledger'))}>
              Accounting
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
