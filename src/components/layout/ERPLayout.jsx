import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomNavigation from './BottomNavigation';
import MobileActionSheet from './MobileActionSheet';
import MobileMenuDrawer from './MobileMenuDrawer';
import { AlertCircle } from 'lucide-react';

const pageTitles = {
  '/': 'Dashboard',
  '/pos': 'Point of Sale',
  '/purchase/orders': 'Purchase Orders',
  '/purchase/invoices': 'Purchase Invoices',
  '/purchase/returns': 'Purchase Returns',
  '/sales/orders': 'Sales Orders',
  '/sales/invoices': 'Sales Invoices',
  '/sales/returns': 'Sales Returns',
  '/inventory/items': 'Inventory Items',
  '/inventory/categories': 'Item Categories',
  '/inventory/uom': 'Units of Measure',
  '/inventory/discounts': 'Discount Schemes',
  '/inventory/adjustments': 'Stock Adjustments',
  '/accounting/chart-of-accounts': 'Chart of Accounts',
  '/accounting/general-ledger': 'General Ledger Journal',
  '/treasury/vouchers': 'Financial Vouchers',
  '/assets/register': 'Fixed Assets',
  '/assets/compliance': 'Asset Compliance',
  '/hr/employees': 'Employees',
  '/hr/payroll': 'Payroll Runs',
  '/manufacturing/orders': 'Manufacturing Orders',
  '/services/contracts': 'Service Contracts',
  '/partners': 'Business Partners',
  '/settings': 'Settings',
  '/reports': 'Reports',
};

export default function ERPLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileFabOpen, setIsMobileFabOpen] = useState(false);
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Sajilo ERP';
  const { activeFiscalYear, activeCompany } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className="flex flex-col flex-1 overflow-hidden relative">
        <Topbar pageTitle={title} onMenuClick={() => setIsMobileMenuOpen(true)} />
        
        {activeCompany && !activeFiscalYear && (
          <div className="bg-destructive/15 border-b border-destructive/20 px-4 py-2 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <p className="text-sm font-medium text-destructive">
              Action Required: No Fiscal Year is configured for this company. Financial transactions are currently locked.
            </p>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 animate-fade-in">
          <Outlet />
        </main>
      </div>

      {/* Mobile only components */}
      <BottomNavigation 
        onOpenMenu={() => setIsMobileMenuOpen(true)} 
        onOpenFab={() => setIsMobileFabOpen(true)} 
      />
      <MobileActionSheet 
        isOpen={isMobileFabOpen} 
        onClose={() => setIsMobileFabOpen(false)} 
      />
      <MobileMenuDrawer 
        isOpen={isMobileMenuOpen} 
        onClose={() => setIsMobileMenuOpen(false)} 
      />
    </div>
  );
}