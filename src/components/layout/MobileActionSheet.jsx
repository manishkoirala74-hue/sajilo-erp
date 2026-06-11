import { Drawer } from 'vaul';
import { Link } from 'react-router-dom';
import { 
  FileText, Receipt, Wallet, Banknote, UserCheck, 
  Truck, Boxes, BookOpen, X
} from 'lucide-react';

const actions = [
  { icon: FileText, label: 'Sales Invoice', path: '/sales/invoices?new=1', color: 'bg-blue-500/10 text-blue-500' },
  { icon: Receipt, label: 'Purchase Bill', path: '/purchase/invoices?new=1', color: 'bg-green-500/10 text-green-500' },
  { icon: Wallet, label: 'Receipt', path: '/treasury/vouchers?new=1&type=Receipt', color: 'bg-emerald-500/10 text-emerald-500' },
  { icon: Banknote, label: 'Payment', path: '/treasury/vouchers?new=1&type=Payment', color: 'bg-rose-500/10 text-rose-500' },
  { icon: BookOpen, label: 'Journal Voucher', path: '/treasury/vouchers?new=1&type=Journal', color: 'bg-purple-500/10 text-purple-500' },
  { icon: UserCheck, label: 'Customer', path: '/partners/customers?new=1', color: 'bg-indigo-500/10 text-indigo-500' },
  { icon: Truck, label: 'Supplier', path: '/partners/suppliers?new=1', color: 'bg-orange-500/10 text-orange-500' },
  { icon: Boxes, label: 'Item', path: '/inventory/items?new=1', color: 'bg-cyan-500/10 text-cyan-500' },
];

export default function MobileActionSheet({ isOpen, onClose }) {
  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" />
        <Drawer.Content className="bg-card flex flex-col rounded-t-[10px] mt-24 fixed bottom-0 left-0 right-0 z-50 outline-none border border-border border-b-0 max-h-[85vh]">
          <div className="p-4 bg-card rounded-t-[10px] flex-1 overflow-y-auto scrollbar-none">
            <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-muted mb-6" />
            
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-foreground">Quick Create</h2>
              <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors touch-target">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="grid grid-cols-4 gap-y-6 gap-x-2 pb-8">
              {actions.map((action, i) => (
                <Link
                  key={i}
                  to={action.path}
                  onClick={onClose}
                  className="flex flex-col items-center gap-2 group"
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform active:scale-95 ${action.color}`}>
                    <action.icon className="w-6 h-6" />
                  </div>
                  <span className="text-[11px] font-medium text-center text-muted-foreground group-hover:text-foreground leading-tight px-1">
                    {action.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
