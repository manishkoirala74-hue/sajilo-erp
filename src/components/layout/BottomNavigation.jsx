import { Link, useLocation } from 'react-router-dom';
import { Home, Receipt, PlusCircle, BarChart2, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function BottomNavigation({ onOpenMenu, onOpenFab }) {
  const location = useLocation();
  const isActive = (path) => location.pathname === path;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around items-center h-16 px-2 pb-safe z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <Link to="/" className={cn("flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-primary transition-colors touch-target", isActive('/') && "text-primary")}>
        <Home className="w-5 h-5 mb-1" />
        <span className="text-[10px] font-medium">Home</span>
      </Link>
      
      <Link to="/sales/invoices" className={cn("flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-primary transition-colors touch-target", isActive('/sales/invoices') && "text-primary")}>
        <Receipt className="w-5 h-5 mb-1" />
        <span className="text-[10px] font-medium">Transactions</span>
      </Link>
      
      <button onClick={onOpenFab} className="flex flex-col items-center justify-center w-full h-full text-primary hover:text-primary/80 transition-colors touch-target">
        <div className="bg-primary/10 rounded-full p-2 mb-1">
          <PlusCircle className="w-6 h-6" />
        </div>
        <span className="text-[10px] font-medium sr-only">Create</span>
      </button>

      <Link to="/reports" className={cn("flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-primary transition-colors touch-target", isActive('/reports') && "text-primary")}>
        <BarChart2 className="w-5 h-5 mb-1" />
        <span className="text-[10px] font-medium">Reports</span>
      </Link>

      <button onClick={onOpenMenu} className="flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-primary transition-colors touch-target">
        <Menu className="w-5 h-5 mb-1" />
        <span className="text-[10px] font-medium">More</span>
      </button>
    </div>
  );
}
