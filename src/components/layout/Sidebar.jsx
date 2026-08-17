import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Package, Settings,
  ChevronDown, ChevronRight, TrendingUp, Building2,
  Receipt, ClipboardList, Menu, X, Boxes, Wallet,
  Landmark, ShieldCheck, UserCog, Banknote, Factory, Handshake, BookOpen,
  Ruler, Tag, RotateCcw, SlidersHorizontal, ShoppingBag, BarChart2, TrendingDown, CreditCard,
  UserCheck, Truck, Plus, Search, LifeBuoy, ArrowRightLeft, Star, LogOut, Layers
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sajilo } from '@/api/sajiloClient';
import { usePermissions, useAuth } from '@/lib/AuthContext';
import { ADMIN_ROLES } from '@/lib/rbac';
import { useSettingsStore } from '@/store/settingsStore';
import { useModalStore } from '@/store/modalStore';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

export const buildNavGroups = (settings) => {
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
        ...(s.enable_godown_management ? [
          { icon: Building2, label: 'Godowns / Locations', path: '/inventory/godowns' },
          { icon: ArrowRightLeft, label: 'Stock Transfers', path: '/inventory/transfers' }
        ] : []),
        { icon: Package, label: 'Categories', path: '/inventory/categories' },
        { icon: Ruler, label: 'Units of Measure', path: '/inventory/uom' },
        { icon: SlidersHorizontal, label: 'Stock Adjustments', path: '/inventory/adjustments' },
        { icon: Tag, label: 'Discount Schemes', path: '/inventory/discounts' },
        ...(s.enable_stock_assembly !== false ? [{ icon: Layers, label: 'Stock Assembly', path: '/inventory/assembly' }] : []),
        { icon: Settings, label: 'Price Revision', path: '/inventory/price-revision' },
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

  if (s.enable_construction_module) {
    groups.push({
      label: 'CONSTRUCTION',
      items: [
        { icon: Building2, label: 'Projects', path: '/construction/projects' },
        { icon: Truck, label: 'Delivery Challans', path: '/construction/delivery-challans' },
        { icon: Receipt, label: 'Consolidated Billing', path: '/construction/consolidated-billing' },
      ]
    });
  }

  groups.push({
    label: 'SYSTEM & ANALYTICS',
    items: [
      { icon: BarChart2, label: 'Reports', path: '/reports' },
      { icon: Settings, label: 'Settings', path: '/settings' },
      { icon: LifeBuoy, label: 'Help & Support', path: '/help-support' },
    ]
  });

  return groups;
};

export default function Sidebar({ collapsed, onToggle }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, activeFiscalYear } = useAuth();
  const { sidebarVisibility } = usePermissions();
  const [settings, setSettings] = useState(null);
  const [navGroups, setNavGroups] = useState(buildNavGroups(null));
  const [expandedGroups, setExpandedGroups] = useState([]);
  const [expandedSubGroups, setExpandedSubGroups] = useState([]);
  const openModal = useModalStore(state => state.openModal);

  // Favorites state
  const [favoritePaths, setFavoritePaths] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('sajilo_sidebar_favorites') || '[]');
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('sajilo_sidebar_favorites', JSON.stringify(favoritePaths));
  }, [favoritePaths]);

  const serverSettings = useSettingsStore(state => state.serverSettings);

  useEffect(() => {
    if (serverSettings && Object.keys(serverSettings).length > 0) {
      setSettings(serverSettings);
    } else {
      sajilo.entities.CompanySettings.list().then(data => {
        const s = data[0] || {};
        setSettings(s);
      });
    }
  }, [serverSettings]);

  useEffect(() => {
    const groups = buildNavGroups(settings);
    setNavGroups(groups);
    setExpandedGroups(prev => {
      const labels = groups.map(g => g.label);
      return labels;
    });
  }, [settings]);

  // Global Ctrl+K is now handled in App.jsx

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

  const toggleFavorite = (e, path) => {
    e.preventDefault();
    e.stopPropagation();
    setFavoritePaths(prev => {
      if (prev.includes(path)) {
        return prev.filter(p => p !== path);
      }
      if (prev.length >= 7) {
        toast.error('Maximum favorites reached. Please unpin an item first.');
        return prev;
      }
      return [...prev, path];
    });
  };

  const isActive = (path) => location.pathname === path;

  // Flatten all items for favorites lookup
  const allNavItems = useMemo(() => {
    const items = [];
    navGroups.forEach(group => {
      group.items.forEach(item => {
        if (item.isSubGroup) {
          item.items.forEach(sub => items.push(sub));
        } else {
          items.push(item);
        }
      });
    });
    return items;
  }, [navGroups]);

  // Extract favorite items
  const favoriteItems = useMemo(() => {
    return favoritePaths.map(path => allNavItems.find(i => i.path === path)).filter(Boolean);
  }, [favoritePaths, allNavItems]);

  // Filter groups
  const filteredGroups = useMemo(() => {
    const isAdmin = ADMIN_ROLES.includes(user?.role);
    
    return navGroups.map(group => {
      let items = group.items.map(item => {
        if (item.isSubGroup) {
          let subItems = item.items;
          // Apply RBAC
          if (!isAdmin) {
             subItems = subItems.filter(sub => sidebarVisibility.includes(sub.path) || sub.path === '/');
          }
          return subItems.length > 0 ? { ...item, items: subItems } : null;
        }
        
        // Root Items
        let keep = true;
        // Apply RBAC
        if (!isAdmin) {
           keep = sidebarVisibility.includes(item.path) || item.path === '/' || item.path === '/settings' || item.path === '/reports';
        }
        
        return keep ? item : null;
      }).filter(Boolean);
      
      return items.length > 0 ? { ...group, items } : null;
    }).filter(Boolean);
  }, [navGroups, sidebarVisibility, user]);

  // Inject favorites group if appropriate
  const displayGroups = useMemo(() => {
    if (favoriteItems.length === 0) return filteredGroups;
    return [
      { label: 'FAVORITES', items: favoriteItems, isFavoriteGroup: true },
      ...filteredGroups
    ];
  }, [filteredGroups, favoriteItems]);

  // Auto-expand when searching
  const effectiveExpandedGroups = [...expandedGroups, 'FAVORITES'];
  const effectiveExpandedSubGroups = expandedSubGroups;

  // NavItem sub-component for rendering links consistently
  const NavItem = ({ item, isSub = false, isFavoriteGroup = false }) => {
    const active = isActive(item.path);
    const isFav = favoritePaths.includes(item.path);
    
    const disabledPaths = [
      '/pos', '/sales/invoices', '/sales/returns', 
      '/purchase/invoices', '/purchase/returns', '/treasury/vouchers'
    ];
    const isDisabled = !activeFiscalYear && disabledPaths.includes(item.path);
    
    return (
      <Link
        to={isDisabled ? '#' : item.path}
        title={collapsed ? item.label : undefined}
        onClick={(e) => {
          if (isDisabled) {
            e.preventDefault();
            toast.error("No active fiscal year. Please create one to access transactions.");
          }
        }}
        className={cn(
          "group relative flex items-center gap-3 px-3 py-1.5 min-h-[40px] rounded-lg text-sm font-medium transition-all duration-200",
          active
            ? "bg-primary text-white shadow-sm"
            : "text-slate-400 hover:text-white hover:bg-sidebar-hover",
          !collapsed && isSub && "ml-2",
          isDisabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <item.icon className="w-4 h-4 shrink-0" />
        <span className={cn(
          "whitespace-nowrap overflow-hidden transition-all duration-300 flex-1",
          collapsed ? "opacity-0 w-0 hidden md:block" : "opacity-100"
        )}>
          {item.label}
        </span>
        {!collapsed && (
          <button
            onClick={(e) => toggleFavorite(e, item.path)}
            className={cn(
              "shrink-0 transition-all duration-200 hover:scale-110 flex items-center justify-center w-6 h-6 rounded-md",
              active ? "text-white/80 hover:bg-white/10" : "text-slate-500 hover:text-yellow-400 hover:bg-slate-700/50",
              isFavoriteGroup 
                ? "opacity-0 group-hover:opacity-100 text-yellow-400" 
                : "opacity-0 group-hover:opacity-100",
              (!isFavoriteGroup && isFav) && "hidden" // completely hide star from main list if pinned
            )}
            title={isFavoriteGroup ? "Remove from Favorites" : "Add to Favorites"}
          >
            {isFavoriteGroup ? (
              <Star className="w-3.5 h-3.5 fill-current" />
            ) : (
              !isFav && <Star className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </Link>
    );
  };

  return (
    <>
      <div className={cn(
        "hidden md:flex flex-col h-full bg-sidebar transition-all duration-300 border-r border-slate-700/30 shadow-[4px_0_24px_rgba(0,0,0,0.02)] relative z-40 print:hidden",
        collapsed ? "w-[72px]" : "w-64"
      )}>
        {/* Logo */}
        <div className="flex items-center h-16 px-4 shrink-0 relative">
          <div className="flex items-center gap-3 w-full">
            <div className={cn(
              "w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0 transition-all duration-300",
              collapsed && "mx-auto"
            )}>
              <Building2 className="w-4 h-4 text-white" />
            </div>
            {!collapsed && (
              <div className="flex-1 overflow-hidden transition-opacity duration-300 whitespace-nowrap">
                <p className="text-white font-bold text-sm leading-none">Sajilo ERP</p>
                <p className="text-slate-400 text-xs mt-0.5">Enterprise Suite</p>
              </div>
            )}
          </div>
          <button
            onClick={onToggle}
            className="absolute -right-3 top-5 bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors p-1 rounded-full shadow-sm z-50"
          >
            {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3 rotate-90" />}
          </button>
        </div>

        {/* Search Bar */}
        {!collapsed && (
          <div className="px-3 py-2 shrink-0">
            <button
              onClick={() => openModal('COMMAND_PALETTE')}
              className="w-full flex items-center bg-slate-800/40 hover:bg-slate-800/80 border border-transparent hover:border-slate-700 text-slate-400 text-sm rounded-md px-3 py-1.5 transition-all focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <Search className="w-4 h-4 mr-2 shrink-0" />
              <span className="flex-1 text-left truncate">Search or jump to...</span>
              <kbd className="hidden sm:inline-flex items-center gap-1 font-sans text-[10px] bg-slate-700 rounded px-1.5 h-5 text-slate-300">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
          </div>
        )}

        {/* Quick Action Button */}
        <div className={cn("px-3 py-3 shrink-0", collapsed && "flex justify-center")}>
          <button
            onClick={() => openModal('COMMAND_PALETTE')}
            title={collapsed ? "Quick Action" : undefined}
            className={cn(
              "flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary py-1.5 rounded-lg font-medium text-sm transition-colors border border-primary/20 shadow-sm",
              collapsed ? "w-10 h-10 px-0" : "w-full px-4"
            )}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Quick Action</span>}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-3 space-y-1 scrollbar-hide-default">
          {displayGroups.map((group) => (
            <div key={group.label} className={cn(group.isFavoriteGroup && "mb-4")}>
              {!collapsed && (
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center justify-between px-2 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider hover:text-slate-300 transition-colors"
                >
                  {group.label}
                  {effectiveExpandedGroups.includes(group.label)
                    ? <ChevronDown className="w-3 h-3 opacity-50" />
                    : <ChevronRight className="w-3 h-3 opacity-50" />
                  }
                </button>
              )}

              {(collapsed || effectiveExpandedGroups.includes(group.label)) && (
                <div className="space-y-0.5 mt-0.5 mb-2">
                  {group.items.map((item, idx) => (
                    item.isSubGroup ? (
                      <div key={item.label} className="pl-0">
                        {!collapsed && (
                          <button
                            onClick={() => toggleSubGroup(item.label)}
                            className="w-full flex items-center justify-between px-3 py-1.5 min-h-[36px] text-xs font-semibold text-slate-400 hover:text-slate-300 transition-colors uppercase tracking-wide mt-1"
                          >
                            <span>{item.label}</span>
                            {effectiveExpandedSubGroups.includes(item.label)
                              ? <ChevronDown className="w-3 h-3 opacity-50" />
                              : <ChevronRight className="w-3 h-3 opacity-50" />
                            }
                          </button>
                        )}
                        {(collapsed || effectiveExpandedSubGroups.includes(item.label)) && (
                          <div className={cn("space-y-0.5", !collapsed && "mt-1")}>
                            {item.items.map((subItem) => (
                              <NavItem key={subItem.path} item={subItem} isSub={true} />
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <NavItem key={item.path} item={item} isFavoriteGroup={group.isFavoriteGroup} />
                    )
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Sticky Footer User Profile */}
        <div className="p-3 mt-auto shrink-0 border-t border-slate-700/30">
          {collapsed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center justify-center p-1.5 rounded-lg hover:bg-slate-800 transition-colors focus:outline-none focus:ring-1 focus:ring-slate-700">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-56 ml-2 bg-slate-800 border-slate-700 text-slate-200">
                <div className="px-2 py-1.5">
                  <div className="text-sm font-semibold text-white">{user?.name}</div>
                  <div className="text-xs text-slate-400 truncate">{user?.email}</div>
                </div>
                <DropdownMenuSeparator className="bg-slate-700" />
                <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer hover:bg-slate-700 focus:bg-slate-700">
                  <Settings className="w-4 h-4 mr-2 text-slate-400" /> Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-red-400 focus:bg-red-950 focus:text-red-300 mt-1">
                  <LogOut className="w-4 h-4 mr-2" /> Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-700/50 group focus:outline-none">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm">
                    {user?.name?.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">{user?.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user?.email || 'Admin'}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center" className="w-[230px] mb-2 bg-slate-800 border-slate-700 text-slate-200">
                <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer hover:bg-slate-700 focus:bg-slate-700 py-2">
                  <Settings className="w-4 h-4 mr-2 text-slate-400" /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-slate-700" />
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-red-400 focus:bg-red-950 focus:text-red-300 py-2">
                  <LogOut className="w-4 h-4 mr-2" /> Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </>
  );
}
