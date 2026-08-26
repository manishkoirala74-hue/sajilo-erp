import { useState } from 'react';
import { Drawer } from 'vaul';
import { Link } from 'react-router-dom';
import { 
  FileText, Receipt, Wallet, Banknote, UserCheck, 
  Truck, Boxes, BookOpen, X, Lock, MoreHorizontal
} from 'lucide-react';
import { useQuickActionsStore } from '@/store/quickActionsStore';
import { useAuth } from '@/lib/AuthContext';
import { triggerHaptic } from '@/utils/haptics';
import { cn } from '@/lib/utils';

const iconMap = {
  FileText, Receipt, Wallet, Banknote, UserCheck, 
  Truck, Boxes, BookOpen
};

export default function MobileActionSheet({ isOpen, onClose }) {
  const { pinnedActions } = useQuickActionsStore();
  const { activeFiscalYear } = useAuth();
  const [expanded, setExpanded] = useState(false);

  // The disabled paths logic similar to drawer
  const disabledPaths = [
    '/sales/invoices', '/purchase/invoices', '/treasury/vouchers'
  ];

  const handleClose = () => {
    setExpanded(false);
    onClose();
  };

  const handleActionClick = (isDisabled, e) => {
    triggerHaptic();
    if (isDisabled) {
      e.preventDefault();
    } else {
      handleClose();
    }
  };

  const visibleActions = expanded ? pinnedActions : pinnedActions.slice(0, 7);
  const hasMore = pinnedActions.length > 7 && !expanded;

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" />
        <Drawer.Content className="bg-card flex flex-col rounded-t-[10px] mt-24 fixed bottom-0 left-0 right-0 z-50 outline-none border border-border border-b-0 max-h-[85vh]">
          <div className="p-4 bg-card rounded-t-[10px] flex-1 overflow-y-auto scrollbar-none pb-[env(safe-area-inset-bottom,16px)]">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted mb-6" />
            
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">Quick Create</h2>
              <button onClick={() => { triggerHaptic(); handleClose(); }} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors touch-target">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-4 gap-y-6 gap-x-2 pb-4">
              {visibleActions.map((action) => {
                const Icon = iconMap[action.icon] || FileText;
                const isTransactional = disabledPaths.some(dp => action.path.includes(dp));
                const isDisabled = !activeFiscalYear && isTransactional;

                return (
                  <Link
                    key={action.id}
                    to={isDisabled ? '#' : action.path}
                    onClick={(e) => handleActionClick(isDisabled, e)}
                    className={cn(
                      "flex flex-col items-center gap-2 group relative touch-target",
                      isDisabled && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className={cn(`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform active:scale-95`, action.color)}>
                      <Icon className="w-6 h-6" />
                      {isDisabled && (
                        <div className="absolute -top-1 -right-1 bg-background rounded-full p-0.5 shadow-sm">
                          <Lock className="w-3 h-3 text-destructive" />
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-center text-muted-foreground group-hover:text-foreground leading-tight px-1">
                      {action.label}
                    </span>
                  </Link>
                );
              })}

              {hasMore && (
                <button
                  onClick={() => { triggerHaptic(); setExpanded(true); }}
                  className="flex flex-col items-center gap-2 group touch-target"
                >
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center transition-transform active:scale-95 bg-muted text-muted-foreground">
                    <MoreHorizontal className="w-6 h-6" />
                  </div>
                  <span className="text-[11px] font-medium text-center text-muted-foreground group-hover:text-foreground leading-tight px-1">
                    More
                  </span>
                </button>
              )}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
