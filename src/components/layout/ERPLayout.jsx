import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomNavigation from './BottomNavigation';
import MobileActionSheet from './MobileActionSheet';
import MobileMenuDrawer from './MobileMenuDrawer';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const navigate = useNavigate();
  const { activeFiscalYear, activeCompany, fiscalYears, fyIsError, fyError, fyIsLoading, user } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className="flex flex-col flex-1 overflow-hidden relative">
        <Topbar pageTitle={title} onMenuClick={() => setIsMobileMenuOpen(true)} />
        
        {activeCompany && !activeFiscalYear && (
          <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 overflow-hidden">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <p className="text-sm font-medium text-destructive">
                To begin recording financial transactions, please configure an active Fiscal Year.
              </p>
            </div>
            <Button 
              variant="destructive" 
              size="sm" 
              className="shrink-0"
              onClick={() => navigate('/app/settings/finance/fiscal-year')}
            >
              Configure Fiscal Year <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
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