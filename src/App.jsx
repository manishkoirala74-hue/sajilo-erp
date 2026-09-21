import React, { Component } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { sajilo } from '@/api/sajiloClient';
import { queryClientInstance } from '@/lib/query-client'
import { createBrowserRouter, RouterProvider, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { DateFormatProvider } from '@/lib/DateFormatContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Toaster as SonnerToaster } from 'sonner';
import { ThemeProvider } from '@/lib/ThemeContext';
import ModalRegistry from '@/components/modals/ModalRegistry';
import { useModalStore } from '@/store/modalStore';

// Layout
import ERPLayout from '@/components/layout/ERPLayout';

// Pages
import Dashboard from '@/pages/Dashboard';
const BusinessPartners = React.lazy(() => import('@/pages/partners/BusinessPartners'));
const Customers = React.lazy(() => import('@/pages/partners/Customers'));
const Suppliers = React.lazy(() => import('@/pages/partners/Suppliers'));
const Items = React.lazy(() => import('@/pages/inventory/Items'));
const StockTransfers = React.lazy(() => import('@/pages/inventory/StockTransfers'));
const Categories = React.lazy(() => import('@/pages/inventory/Categories'));
const UnitOfMeasures = React.lazy(() => import('@/pages/inventory/UnitOfMeasures'));
const DiscountSchemes = React.lazy(() => import('@/pages/inventory/DiscountSchemes'));
const StockAdjustments = React.lazy(() => import('@/pages/inventory/StockAdjustments'));
const Godowns = React.lazy(() => import('@/pages/inventory/Godowns'));
const PriceRevisionWizard = React.lazy(() => import('./pages/inventory/PriceRevisionWizard'));
const StockAssemblyList = React.lazy(() => import('@/pages/inventory/StockAssemblyList'));
const POSSales = React.lazy(() => import('@/pages/pos/POSSales'));
const PurchaseOrders = React.lazy(() => import('@/pages/purchase/PurchaseOrders'));
const PurchaseInvoices = React.lazy(() => import('@/pages/purchase/PurchaseInvoices'));
const PurchaseReturns = React.lazy(() => import('@/pages/purchase/PurchaseReturns'));
const SalesOrders = React.lazy(() => import('@/pages/sales/SalesOrders'));
const SalesInvoices = React.lazy(() => import('@/pages/sales/SalesInvoices'));
const SalesReturns = React.lazy(() => import('@/pages/sales/SalesReturns'));
const Quotations = React.lazy(() => import('@/pages/sales/Quotations'));
const SettingsLayout = React.lazy(() => import('@/pages/settings/SettingsLayout'));
const PDFTemplatesList = React.lazy(() => import('@/pages/settings/PDFTemplatesList'));
const TemplateBuilder = React.lazy(() => import('@/pages/settings/TemplateBuilder'));
// Company
const CompanyManagementPage = React.lazy(() => import('@/pages/settings/company/CompanyManagementPage'));
const UserRoles = React.lazy(() => import('@/pages/settings/company/UserRoles'));
const PasswordPolicy = React.lazy(() => import('@/pages/settings/company/PasswordPolicy'));
const ApprovalControl = React.lazy(() => import('@/pages/settings/company/ApprovalControl'));
// Finance
const FiscalYear = React.lazy(() => import('@/pages/settings/finance/FiscalYear'));
const TaxVatMatrices = React.lazy(() => import('@/pages/settings/finance/TaxVatMatrices'));
const GLMapping = React.lazy(() => import('@/pages/settings/finance/GLMapping'));
const PayrollMapping = React.lazy(() => import('@/pages/settings/finance/PayrollMapping'));
const Depreciation = React.lazy(() => import('@/pages/settings/finance/Depreciation'));
// Operations
const ReceivableCollections = React.lazy(() => import('@/pages/settings/operations/ReceivableCollections'));
const VoucherSequence = React.lazy(() => import('@/pages/settings/operations/VoucherSequence'));
const InventorySettings = React.lazy(() => import('@/pages/settings/operations/InventorySettings'));
const QuickActionsSettings = React.lazy(() => import('@/pages/settings/operations/QuickActionsSettings'));
// Data
const SystemCutOver = React.lazy(() => import('@/pages/settings/data/SystemCutOver'));
const ItemImportExportPage = React.lazy(() => import('@/pages/settings/data/ItemImportExportPage'));
const DataUtilitiesPage = React.lazy(() => import('@/pages/settings/data/DataUtilitiesPage'));
// Integrations
const FeatureToggles = React.lazy(() => import('@/pages/settings/integrations/FeatureToggles'));
const RegionalSettings = React.lazy(() => import('@/pages/settings/integrations/RegionalSettings'));
const StorageLimits = React.lazy(() => import('@/pages/settings/integrations/StorageLimits'));
const CommunicationChannels = React.lazy(() => import('@/pages/settings/integrations/CommunicationChannels'));
const PaymentGateways = React.lazy(() => import('@/pages/settings/integrations/PaymentGateways'));
const Reports = React.lazy(() => import('@/pages/Reports.jsx'));
const EmployeeReceivableReport = React.lazy(() => import('@/pages/reports/EmployeeReceivableReport'));
const EmployeePayableReport = React.lazy(() => import('@/pages/reports/EmployeePayableReport'));
const UserActivityLog = React.lazy(() => import('@/pages/reports/UserActivityLog'));
const InventoryTurnoverReport = React.lazy(() => import('@/pages/reports/InventoryTurnoverReport'));
const CommunicationLogs = React.lazy(() => import('@/pages/reports/CommunicationLogs'));
const PriceRevisionHistory = React.lazy(() => import('@/pages/reports/PriceRevisionHistory'));
const GrossProfitMarginReport = React.lazy(() => import('@/pages/reports/GrossProfitMarginReport'));
const CustomerBillDue = React.lazy(() => import('@/pages/reports/CustomerBillDue'));
const SupplierBillDue = React.lazy(() => import('@/pages/reports/SupplierBillDue'));
const PurchasePriceChangeHistory = React.lazy(() => import('@/pages/reports/PurchasePriceChangeHistory'));
const NegativeStockExceptionReport = React.lazy(() => import('@/pages/reports/NegativeStockExceptionReport'));
const ComposeEmail = React.lazy(() => import('@/pages/email/ComposeEmail'));
const Profile = React.lazy(() => import('@/pages/Profile'));
const HelpSupport = React.lazy(() => import('@/pages/HelpSupport'));

// Accounting
const ChartOfAccounts = React.lazy(() => import('@/pages/accounting/ChartOfAccounts'));
const GeneralLedger = React.lazy(() => import('@/pages/accounting/GeneralLedger'));

// Treasury
const FinancialVouchers = React.lazy(() => import('@/pages/treasury/FinancialVouchers'));
const BankAccounts = React.lazy(() => import('@/pages/treasury/BankAccounts'));

// Fixed Assets
const FixedAssets = React.lazy(() => import('@/pages/assets/FixedAssets'));
const AssetCompliance = React.lazy(() => import('@/pages/assets/AssetCompliance'));
const DepreciationSchedules = React.lazy(() => import('@/pages/assets/DepreciationSchedules'));

// HR
const Employees = React.lazy(() => import('@/pages/hr/Employees'));
const PayrollRuns = React.lazy(() => import('@/pages/hr/PayrollRuns'));

// Manufacturing
const ManufacturingOrders = React.lazy(() => import('@/pages/manufacturing/ManufacturingOrders'));

// Services
const ServiceContracts = React.lazy(() => import('@/pages/services/ServiceContracts'));

// Construction
const ProjectMaster = React.lazy(() => import('@/pages/construction/ProjectMaster'));
const DeliveryChallans = React.lazy(() => import('@/pages/construction/DeliveryChallans'));
const ConsolidatedBilling = React.lazy(() => import('@/pages/construction/ConsolidatedBilling'));

// Auth pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ChangePassword from '@/pages/ChangePassword';
import Onboarding from '@/pages/Onboarding';

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
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<ERPLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/partners" element={<BusinessPartners />} />
          <Route path="/partners/customers" element={<Customers />} />
          <Route path="/partners/suppliers" element={<Suppliers />} />
          <Route path="/inventory/items" element={<Items />} />
          <Route path="/inventory/transfers" element={<StockTransfers />} />
          <Route path="/inventory/categories" element={<Categories />} />
          <Route path="/inventory/godowns" element={<Godowns />} />
          <Route path="/inventory/uom" element={<UnitOfMeasures />} />
          <Route path="/inventory/discounts" element={<DiscountSchemes />} />
          <Route path="/inventory/adjustments" element={<StockAdjustments />} />
          <Route path="/inventory/price-revision" element={<PriceRevisionWizard />} />
          <Route path="/inventory/assembly" element={<StockAssemblyList />} />
          <Route path="/pos" element={<POSSales />} />
          <Route path="/purchase/orders" element={<PurchaseOrders />} />
          <Route path="/purchase/invoices" element={<PurchaseInvoices />} />
          <Route path="/purchase/returns" element={<PurchaseReturns />} />
          <Route path="/sales/quotations" element={<Quotations />} />
          <Route path="/sales/orders" element={<SalesOrders />} />
          <Route path="/sales/invoices" element={<SalesInvoices />} />
          <Route path="/sales/returns" element={<SalesReturns />} />
          <Route path="/settings/*" element={<SettingsLayout />}>
            <Route path="company/management" element={<CompanyManagementPage />} />
            <Route path="company/roles" element={<UserRoles />} />
            <Route path="company/password" element={<PasswordPolicy />} />
            <Route path="company/approvals" element={<ApprovalControl />} />
            <Route path="finance/fiscal-year" element={<FiscalYear />} />
            <Route path="finance/tax-vat" element={<TaxVatMatrices />} />
            <Route path="finance/gl-mapping" element={<GLMapping />} />
            <Route path="finance/payroll-mapping" element={<PayrollMapping />} />
            <Route path="finance/depreciation" element={<Depreciation />} />
            <Route path="operations/collections" element={<ReceivableCollections />} />
            <Route path="operations/vouchers" element={<VoucherSequence />} />
            <Route path="operations/inventory" element={<InventorySettings />} />
            <Route path="operations/templates" element={<PDFTemplatesList />} />
            <Route path="operations/quick-actions" element={<QuickActionsSettings />} />
            <Route path="data/cut-over" element={<SystemCutOver />} />
            <Route path="data/import" element={<ItemImportExportPage />} />
            <Route path="data/utilities" element={<DataUtilitiesPage />} />
            <Route path="integrations/features" element={<FeatureToggles />} />
            <Route path="integrations/regional" element={<RegionalSettings />} />
            <Route path="integrations/storage" element={<StorageLimits />} />
            <Route path="integrations/communication" element={<CommunicationChannels />} />
            <Route path="integrations/payment" element={<PaymentGateways />} />
          </Route>
          <Route path="/settings/templates/builder/:id" element={<TemplateBuilder />} />
          <Route path="/help-support" element={<HelpSupport />} />
          <Route path="/email/compose" element={<ComposeEmail />} />
          {/* Reports */}
          <Route path="/reports" element={<Reports />} />
          <Route path="/reports/employee-receivables" element={<EmployeeReceivableReport />} />
          <Route path="/reports/employee-payables" element={<EmployeePayableReport />} />
          <Route path="/reports/communication-logs" element={<CommunicationLogs />} />
          <Route path="/reports/price-revision-history" element={<PriceRevisionHistory />} />
          <Route path="/reports/inventory-turnover" element={<InventoryTurnoverReport />} />
          <Route path="/reports/inventory/gross-profit-margin" element={<GrossProfitMarginReport />} />
          <Route path="/reports/customer-bill-due" element={<CustomerBillDue />} />
          <Route path="/reports/supplier-bill-due" element={<SupplierBillDue />} />
          <Route path="/reports/purchase-price-change-history" element={<PurchasePriceChangeHistory />} />
          <Route path="/reports/inventory/negative-stock-exceptions" element={<NegativeStockExceptionReport />} />
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

          {/* Construction */}
          <Route path="/construction/projects" element={<ProjectMaster />} />
          <Route path="/construction/delivery-challans" element={<DeliveryChallans />} />
          <Route path="/construction/consolidated-billing" element={<ConsolidatedBilling />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </ThemeProvider>
  );
};

import { GlobalVoucherDrawerProvider } from '@/lib/GlobalVoucherContext';
const GlobalVoucherDrawer = React.lazy(() => import('@/components/shared/GlobalVoucherDrawer'));

class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error, errorInfo) {
    console.error("Global Error Boundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#f8d7da', color: '#721c24', fontFamily: 'monospace' }}>
          <h2>Something went wrong.</h2>
          <details style={{ whiteSpace: 'pre-wrap' }}>
            <summary>Click for error details</summary>
            <br />
            <strong>{this.state.error && this.state.error.toString()}</strong>
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

import { NumberFormatProvider } from '@/lib/NumberFormatContext';
import { WorkspaceProvider } from '@/lib/WorkspaceContext';

function App() {
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        useModalStore.getState().openModal('COMMAND_PALETTE');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown); // Critical Cleanup
  }, []);

  return (
    <GlobalErrorBoundary>
      <QueryClientProvider client={queryClientInstance}>
        <GlobalVoucherDrawerProvider>
          <AuthProvider>
            <WorkspaceProvider>
              <DateFormatProvider>
                <NumberFormatProvider>
                  <RouterProvider router={createBrowserRouter([{ path: '*', element: <><AuthenticatedApp /><GlobalVoucherDrawer /><ModalRegistry /></> }])} />
                  <Toaster />
                  <SonnerToaster position="top-right" richColors />
                </NumberFormatProvider>
              </DateFormatProvider>
            </WorkspaceProvider>
          </AuthProvider>
        </GlobalVoucherDrawerProvider>
      </QueryClientProvider>
    </GlobalErrorBoundary>
  );
}

export default App;
