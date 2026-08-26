import { Link, useLocation } from 'react-router-dom';
import { Home, Receipt, PlusCircle, BarChart2, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/utils/haptics';

export default function BottomNavigation({ onOpenMenu, onOpenFab }) {
  const location = useLocation();
  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleFabClick = () => {
    triggerHaptic();
    onOpenFab();
  };

  const handleMenuClick = () => {
    triggerHaptic();
    onOpenMenu();
  };

  const handleNavClick = () => {
    triggerHaptic();
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border flex justify-around items-center h-auto min-h-[64px] py-1 px-2 pb-[env(safe-area-inset-bottom,16px)] z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] print:hidden">
      <Link to="/" onClick={handleNavClick} className={cn("flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-primary transition-colors touch-target", isActive('/') && "text-primary")}>
        <Home className="w-5 h-5 mb-1" />
        <span className="text-[10px] font-medium">Home</span>
      </Link>
      
      <Link to="/sales/invoices" onClick={handleNavClick} className={cn("flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-primary transition-colors touch-target relative", isActive('/sales/invoices') && "text-primary")}>
        <div className="relative">
          <Receipt className="w-5 h-5 mb-1" />
          {/* Notification Badge Placeholder - uncomment or link to global state when needed */}
          {/* <span className="absolute -top-1 -right-2 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[8px] text-white font-bold">3</span> */}
        </div>
        <span className="text-[10px] font-medium">Transactions</span>
      </Link>
      
      <button onClick={handleFabClick} className="flex flex-col items-center justify-center w-full h-full text-primary hover:text-primary/80 transition-colors touch-target">
        <div className="bg-primary/10 rounded-full p-2 mb-1">
          <PlusCircle className="w-6 h-6" />
        </div>
        <span className="text-[10px] font-medium sr-only">Create</span>
      </button>

      <Link to="/reports" onClick={handleNavClick} className={cn("flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-primary transition-colors touch-target", isActive('/reports') && "text-primary")}>
        <BarChart2 className="w-5 h-5 mb-1" />
        <span className="text-[10px] font-medium">Reports</span>
      </Link>

      <button onClick={handleMenuClick} className="flex flex-col items-center justify-center w-full h-full text-muted-foreground hover:text-primary transition-colors touch-target">
        <Menu className="w-5 h-5 mb-1" />
        <span className="text-[10px] font-medium">More</span>
      </button>
    </div>
  );
}
