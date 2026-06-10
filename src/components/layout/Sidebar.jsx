import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Package, Settings,
  ChevronDown, ChevronRight, TrendingUp, Building2,
  Receipt, ClipboardList, Menu, X, Boxes, Wallet,
  Landmark, ShieldCheck, UserCog, Banknote, Factory, Handshake, BookOpen,
  Ruler, Tag, RotateCcw, SlidersHorizontal, ShoppingBag, BarChart2, TrendingDown, CreditCard,
  UserCheck, Truck, Plus, Search
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sajilo } from '@/api/sajiloClient';
import QuickCreateModal from './QuickCreateModal';

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
      label: 'INVENTORY & OPERATIONS',
      items: [
        { icon: Boxes, label: 'Items / Products', path: '/inventory/items' },
        { icon: Package, label: 'Categories', path: '/inventory/categories' },
        { icon: Ruler, label: 'Units of Measure', path: '/inventory/uom' },
        { icon: SlidersHorizontal, label: 'Stock Adjustments', path: '/inventory/adjustments' },
        { icon: Tag, label: 'Discount Schemes', path: '/inventory/discounts' },
        ...(s.enable_manufacturing_module !== false ? [{ icon: Factory, label: 'Mfg Orders', path: '/manufacturing/orders' }] : []),
        ...(s.enable_services_module !== false ? [{ icon: Handshake, label: 'Service Contracts', path: '/services/contracts' }] : []),
      ]
    },
    {
      label: 'FINANCE & ACCOUNTING',
      items: [
        { icon: BookOpen, label: 'Chart of Accounts', path: '/accounting/chart-of-accounts' },
        { icon: BarChart2, label: 'Journal Entry', path: '/accounting/general-ledger' },
        { icon: Wallet, label: 'Financial Vouchers', path: '/treasury/vouchers' },
        { icon: CreditCard, label: 'Cash & Bank', path: '/treasury/bank-accounts' },
        ...(s.enable_assets_module !== false ? [
          {
            label: 'FIXED ASSETS',
            isSubGroup: true,
            items: [
              { icon: Landmark, label: 'Asset Register', path: '/assets/register' },
              { icon: TrendingDown, label: 'Depreciation', path: '/assets/depreciation' },
            ]
          }
        ] : []),
        { icon: ShieldCheck, label: 'Compliance', path: '/assets/compliance' },
      ]
    }
  ];

  if (s.enable_hr_module !== false) {
    groups.push({
      label: 'HR & PAYROLL',
      items: [
        { icon: UserCog, label: 'Employees', path: '/hr/employees' },
        { icon: Banknote, label: 'Payroll Runs', path: '/hr/payroll' },
      ]
    });
  }

  groups.push({
    label: 'SYSTEM & ANALYTICS',
    items: [
      { icon: BarChart2, label: 'Reports', path: '/reports' },
      { icon: Settings, label: 'Settings', path: '/settings' },
    ]
  });

  return groups;
};

export default function Sidebar({ collapsed, onToggle }) {
  const location = useLocation();
  const [settings, setSettings] = useState(null);
  const [navGroups, setNavGroups] = useState(buildNavGroups(null));
  const [expandedGroups, setExpandedGroups] = useState([]);
  const [expandedSubGroups, setExpandedSubGroups] = useState([]);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    sajilo.entities.CompanySettings.list().then(data => {
      const s = data[0] || {};
      setSettings(s);
      const groups = buildNavGroups(s);
      setNavGroups(groups);
      setExpandedGroups(groups.map(g => g.label));
    });
  }, []);

  useEffect(() => {
    const groups = buildNavGroups(settings);
    setNavGroups(groups);
    setExpandedGroups(prev => {
      const labels = groups.map(g => g.label);
      return labels;
    });
  }, [settings]);

  const toggleGroup = (label) => {
    setExpandedGroups(prev =>
      prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label]
    );
  };

  const toggleSubGroup = (label) => {
    setExpandedSubGroups(prev =>
      prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label]
    );
  };

  const isActive = (path) => location.pathname === path;

  // Filter groups
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return navGroups;
    const query = searchQuery.toLowerCase();
    
    return navGroups.map(group => {
      const items = group.items.map(item => {
        if (item.isSubGroup) {
          const subItems = item.items.filter(sub => sub.label.toLowerCase().includes(query));
          return subItems.length > 0 ? { ...item, items: subItems } : null;
        }
        return item.label.toLowerCase().includes(query) ? item : null;
      }).filter(Boolean);
      
      return items.length > 0 || group.label.toLowerCase().includes(query) ? { ...group, items: items.length > 0 ? items : group.items } : null;
    }).filter(Boolean);
  }, [navGroups, searchQuery]);

  // Auto-expand when searching
  const effectiveExpandedGroups = searchQuery ? filteredGroups.map(g => g.label) : expandedGroups;
  const effectiveExpandedSubGroups = searchQuery ? filteredGroups.flatMap(g => g.items.filter(i => i.isSubGroup).map(i => i.label)) : expandedSubGroups;

  return (
    <>
      <div className={cn(
        "hidden md:flex flex-col h-full bg-sidebar transition-all duration-300 border-r border-slate-700/50",
        collapsed ? "w-16" : "w-64"
      )}>
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            {!collapsed && (
              <div>
                <p className="text-white font-bold text-sm leading-none">Sajilo ERP</p>
                <p className="text-slate-400 text-xs mt-0.5">Enterprise Suite</p>
              </div>
            )}
          </div>
          <button
            onClick={onToggle}
            className="ml-auto text-slate-400 hover:text-white transition-colors p-1 rounded"
          >
            {collapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
          </button>
        </div>

        {/* Search Bar */}
        {!collapsed && (
          <div className="px-3 py-3 border-b border-slate-700/50 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 text-slate-200 text-sm rounded-md pl-9 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-slate-500 transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Quick Create Button */}
        {!collapsed && (
          <div className="px-3 py-4 border-b border-slate-700/50 shrink-0">
            <button
              onClick={() => setIsQuickCreateOpen(true)}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-2 px-4 rounded-lg font-medium text-sm transition-colors border border-slate-700 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Quick Create</span>
            </button>
          </div>
        )}
        {collapsed && (
          <div className="px-2 py-4 border-b border-slate-700/50 shrink-0 flex justify-center">
            <button
              onClick={() => setIsQuickCreateOpen(true)}
              className="w-10 h-10 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors border border-slate-700 shadow-sm"
              title="Quick Create"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          {filteredGroups.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-2 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors"
                >
                  {group.label}
                  {effectiveExpandedGroups.includes(group.label)
                    ? <ChevronDown className="w-3 h-3" />
                    : <ChevronRight className="w-3 h-3" />
                  }
                </button>
              )}

              {(collapsed || effectiveExpandedGroups.includes(group.label)) && (
                <div className="space-y-0.5 mt-1 mb-3">
                  {group.items.map((item, idx) => (
                    item.isSubGroup ? (
                      <div key={item.label} className="pl-0">
                        {!collapsed && (
                          <button
                            onClick={() => toggleSubGroup(item.label)}
                            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-400 hover:text-slate-300 transition-colors uppercase tracking-wide mt-2"
                          >
                            <span>{item.label}</span>
                            {effectiveExpandedSubGroups.includes(item.label)
                              ? <ChevronDown className="w-3 h-3" />
                              : <ChevronRight className="w-3 h-3" />
                            }
                          </button>
                        )}
                        {(collapsed || effectiveExpandedSubGroups.includes(item.label)) && (
                          <div className={cn("space-y-0.5", !collapsed && "pl-2 mt-1")}>
                            {item.items.map((subItem) => (
                              <Link
                                key={subItem.path}
                                to={subItem.path}
                                title={collapsed ? subItem.label : undefined}
                                className={cn(
                                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                                  isActive(subItem.path)
                                    ? "bg-primary text-white shadow-sm"
                                    : "text-slate-400 hover:text-white hover:bg-sidebar-hover"
                                )}
                              >
                                <subItem.icon className="w-4 h-4 shrink-0" />
                                {!collapsed && <span>{subItem.label}</span>}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <Link
                        key={item.path}
                        to={item.path}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                          isActive(item.path)
                            ? "bg-primary text-white shadow-sm"
                            : "text-slate-400 hover:text-white hover:bg-sidebar-hover"
                        )}
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
                      </Link>
                    )
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="p-4 border-t border-slate-700/50">
            <p className="text-slate-500 text-xs text-center">Sajilo ERP v1.0</p>
          </div>
        )}
      </div>

      <QuickCreateModal 
        isOpen={isQuickCreateOpen} 
        onClose={() => setIsQuickCreateOpen(false)} 
      />
    </>
  );
}