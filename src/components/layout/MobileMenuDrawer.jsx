import { Drawer } from 'vaul';
import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import {
  LayoutDashboard, FileText, Package, Settings,
  ChevronDown, ChevronRight, TrendingUp, Building2,
  Receipt, ClipboardList, Boxes, Wallet, 
  BookOpen, Ruler, RotateCcw, SlidersHorizontal, 
  ShoppingBag, BarChart2, CreditCard,
  UserCheck, Truck, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Helper to build nav (reused from Sidebar logic or simplified)
const buildNavGroups = (settings) => {
  const s = settings || {};
  const groups = [
    {
      label: 'OVERVIEW',
      items: [{ icon: LayoutDashboard, label: 'Dashboard', path: '/' }]
    },
    {
      label: 'SALES & POS',
      items: [
        { icon: UserCheck, label: 'Customers', path: '/partners/customers' },
        ...(s.enable_pos_module !== false ? [{ icon: ShoppingBag, label: 'POS Sales', path: '/pos' }] : []),
        { icon: FileText, label: 'Quotations', path: '/sales/quotations' },
        { icon: ClipboardList, label: 'Sales Orders', path: '/sales/orders' },
        { icon: TrendingUp, label: 'Sales Invoices', path: '/sales/invoices' },
        { icon: RotateCcw, label: 'Sales Returns', path: '/sales/returns' },
      ]
    },
    {
      label: 'PURCHASES',
      items: [
        { icon: Truck, label: 'Suppliers', path: '/partners/suppliers' },
        ...(s.enable_purchase_orders !== false ? [{ icon: ClipboardList, label: 'Purchase Orders', path: '/purchase/orders' }] : []),
        { icon: Receipt, label: 'Purchase Invoices', path: '/purchase/invoices' },
        { icon: RotateCcw, label: 'Purchase Returns', path: '/purchase/returns' },
      ]
    },
    {
      label: 'INVENTORY',
      items: [
        { icon: Boxes, label: 'Items', path: '/inventory/items' },
        { icon: Package, label: 'Categories', path: '/inventory/categories' },
        { icon: Ruler, label: 'Units', path: '/inventory/uom' },
        { icon: SlidersHorizontal, label: 'Adjustments', path: '/inventory/adjustments' },
      ]
    },
    {
      label: 'FINANCE & ACCOUNTING',
      items: [
        { icon: BookOpen, label: 'Chart of Accounts', path: '/accounting/chart-of-accounts' },
        { icon: BarChart2, label: 'Journal Entry', path: '/accounting/general-ledger' },
        { icon: Wallet, label: 'Vouchers', path: '/treasury/vouchers' },
        { icon: CreditCard, label: 'Cash & Bank', path: '/treasury/bank-accounts' },
      ]
    },
    {
      label: 'SYSTEM',
      items: [
        { icon: BarChart2, label: 'Reports', path: '/reports' },
        { icon: Settings, label: 'Settings', path: '/settings' },
      ]
    }
  ];
  return groups;
};

export default function MobileMenuDrawer({ isOpen, onClose }) {
  const location = useLocation();
  const [navGroups, setNavGroups] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState([]);

  useEffect(() => {
    sajilo.entities.CompanySettings.list().then(data => {
      const s = data[0] || {};
      const groups = buildNavGroups(s);
      setNavGroups(groups);
      setExpandedGroups([groups[0].label, groups[1].label]); // Expand first few by default
    }).catch(() => {
      const groups = buildNavGroups({});
      setNavGroups(groups);
      setExpandedGroups([groups[0].label]);
    });
  }, []);

  const toggleGroup = (label) => {
    setExpandedGroups(prev =>
      prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label]
    );
  };

  const isActive = (path) => location.pathname === path;

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()} direction="left">
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm" />
        <Drawer.Content className="bg-sidebar flex flex-col h-full w-[280px] fixed bottom-0 left-0 top-0 z-50 outline-none border-r border-slate-700/50">
          <div className="flex items-center justify-between h-16 px-4 border-b border-slate-700/50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-none">Sajilo ERP</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors touch-target">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto py-4 px-2 scrollbar-none">
            {navGroups.map((group) => (
              <div key={group.label} className="mb-2">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-3 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors touch-target"
                >
                  {group.label}
                  {expandedGroups.includes(group.label) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                
                {expandedGroups.includes(group.label) && (
                  <div className="space-y-1 mt-1 mb-3 pl-1">
                    {group.items.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all touch-target",
                          isActive(item.path)
                            ? "bg-primary text-white shadow-sm"
                            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                        )}
                      >
                        <item.icon className="w-5 h-5 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
