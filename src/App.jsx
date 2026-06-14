import React from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { sajilo } from '@/api/sajiloClient';
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { DateFormatProvider } from '@/lib/DateFormatContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Toaster as SonnerToaster } from 'sonner';
import { ThemeProvider } from '@/lib/ThemeContext';

// Layout
import ERPLayout from '@/components/layout/ERPLayout';

// Pages
import Dashboard from '@/pages/Dashboard';
import BusinessPartners from '@/pages/partners/BusinessPartners';
import Customers from '@/pages/partners/Customers';
import Suppliers from '@/pages/partners/Suppliers';
import Items from '@/pages/inventory/Items';
import Categories from '@/pages/inventory/Categories';
import UnitOfMeasures from '@/pages/inventory/UnitOfMeasures';
import DiscountSchemes from '@/pages/inventory/DiscountSchemes';
import StockAdjustments from '@/pages/inventory/StockAdjustments';
import POSSales from '@/pages/pos/POSSales';
import PurchaseOrders from '@/pages/purchase/PurchaseOrders';
import PurchaseInvoices from '@/pages/purchase/PurchaseInvoices';
import PurchaseReturns from '@/pages/purchase/PurchaseReturns';
import SalesOrders from '@/pages/sales/SalesOrders';
import SalesInvoices from '@/pages/sales/SalesInvoices';
import SalesReturns from '@/pages/sales/SalesReturns';
import Quotations from '@/pages/sales/Quotations';
import Settings from '@/pages/Settings';
import Reports from '@/pages/Reports.jsx';
import EmployeeReceivableReport from '@/pages/reports/EmployeeReceivableReport';
import EmployeePayableReport from '@/pages/reports/EmployeePayableReport';
import CommunicationLogs from '@/pages/reports/CommunicationLogs';
import Profile from '@/pages/Profile';
import HelpSupport from '@/pages/HelpSupport';

// Accounting
import ChartOfAccounts from '@/pages/accounting/ChartOfAccounts';
import GeneralLedger from '@/pages/accounting/GeneralLedger';

// Treasury
import FinancialVouchers from '@/pages/treasury/FinancialVouchers';
import BankAccounts from '@/pages/treasury/BankAccounts';

// Fixed Assets
import FixedAssets from '@/pages/assets/FixedAssets';
import AssetCompliance from '@/pages/assets/AssetCompliance';
import DepreciationSchedules from '@/pages/assets/DepreciationSchedules';

// HR
import Employees from '@/pages/hr/Employees';
import PayrollRuns from '@/pages/hr/PayrollRuns';

// Manufacturing
import ManufacturingOrders from '@/pages/manufacturing/ManufacturingOrders';

// Services
import ServiceContracts from '@/pages/services/ServiceContracts';

// Auth pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ChangePassword from '@/pages/ChangePassword';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user, isAuthenticated } = useAuth();
  const [passwordExpiryDays, setPasswordExpiryDays] = React.useState(null);

  React.useEffect(() => {
    if (isAuthenticated) {
      sajilo.entities.CompanySettings.list().then(data => {
        if (data.length > 0) setPasswordExpiryDays(data[0].password_expiry_days ?? 0);
      });
    }
  }, [isAuthenticated]);

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Loading Sajilo ERP...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  // Force password change if admin created the account with a temp password
  if (isAuthenticated && user?.must_change_password) {
    return <ChangePassword user={user} reason="temp" onSuccess={() => window.location.reload()} />;
  }

  // Force password change if password has expired per system policy
  if (isAuthenticated && passwordExpiryDays > 0 && user?.password_last_changed) {
    const lastChanged = new Date(user.password_last_changed);
    const daysSince = Math.floor((Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince >= passwordExpiryDays) {
      return <ChangePassword user={user} reason="expiry" onSuccess={() => window.location.reload()} />;
    }
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="erp-theme">
      <Routes>
        {/* Public Auth Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected ERP Routes */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<ERPLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/partners" element={<BusinessPartners />} />
          <Route path="/partners/customers" element={<Customers />} />
          <Route path="/partners/suppliers" element={<Suppliers />} />
          <Route path="/inventory/items" element={<Items />} />
          <Route path="/inventory/categories" element={<Categories />} />
          <Route path="/inventory/uom" element={<UnitOfMeasures />} />
          <Route path="/inventory/discounts" element={<DiscountSchemes />} />
          <Route path="/inventory/adjustments" element={<StockAdjustments />} />
          <Route path="/pos" element={<POSSales />} />
          <Route path="/purchase/orders" element={<PurchaseOrders />} />
          <Route path="/purchase/invoices" element={<PurchaseInvoices />} />
          <Route path="/purchase/returns" element={<PurchaseReturns />} />
          <Route path="/sales/quotations" element={<Quotations />} />
          <Route path="/sales/orders" element={<SalesOrders />} />
          <Route path="/sales/invoices" element={<SalesInvoices />} />
          <Route path="/sales/returns" element={<SalesReturns />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help-support" element={<HelpSupport />} />
          {/* Reports */}
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/employee-receivables" element={<EmployeeReceivableReport />} />
          <Route path="/reports/employee-payables" element={<EmployeePayableReport />} />
          <Route path="/reports/communication-logs" element={<CommunicationLogs />} />
          <Route path="/profile" element={<Profile />} />

          {/* Accounting */}
          <Route path="/accounting/chart-of-accounts" element={<ChartOfAccounts />} />
          <Route path="/accounting/general-ledger" element={<GeneralLedger />} />

          {/* Treasury */}
          <Route path="/treasury/vouchers" element={<FinancialVouchers />} />
          <Route path="/treasury/bank-accounts" element={<BankAccounts />} />

          {/* Fixed Assets */}
          <Route path="/assets/register" element={<FixedAssets />} />
          <Route path="/assets/depreciation" element={<DepreciationSchedules />} />
          <Route path="/assets/compliance" element={<AssetCompliance />} />

          {/* HR */}
          <Route path="/hr/employees" element={<Employees />} />
          <Route path="/hr/payroll" element={<PayrollRuns />} />

          {/* Manufacturing */}
          <Route path="/manufacturing/orders" element={<ManufacturingOrders />} />

          {/* Services */}
          <Route path="/services/contracts" element={<ServiceContracts />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </ThemeProvider>
  );
};

import { GlobalVoucherDrawerProvider } from '@/lib/GlobalVoucherContext';
import GlobalVoucherDrawer from '@/components/shared/GlobalVoucherDrawer';

function App() {
  return (
    <GlobalVoucherDrawerProvider>
      <AuthProvider>
        <DateFormatProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <AuthenticatedApp />
              <GlobalVoucherDrawer />
            </Router>
            <Toaster />
            <SonnerToaster position="top-right" richColors />
          </QueryClientProvider>
        </DateFormatProvider>
      </AuthProvider>
    </GlobalVoucherDrawerProvider>
  );
}

export default App;