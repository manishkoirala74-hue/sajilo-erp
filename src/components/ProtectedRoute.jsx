import { useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth, usePermissions } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { AlertCircle } from 'lucide-react';
import { canAccessRoute } from '@/lib/permissionResolver';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-border border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const AccessDenied = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh]">
    <h1 className="text-4xl font-bold text-foreground mb-2">403</h1>
    <h2 className="text-xl font-semibold text-muted-foreground mb-4">Access Restricted</h2>
    <p className="text-slate-500 mb-6 max-w-md text-center">
      You do not have permission to access this page in the selected company workspace.
    </p>
    <a href="/" className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
      Return to Dashboard
    </a>
  </div>
);

const FiscalYearRequired = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh]">
    <AlertCircle className="w-16 h-16 text-destructive mb-4" />
    <h1 className="text-3xl font-bold text-foreground mb-2">Active Fiscal Year Required</h1>
    <h2 className="text-xl font-medium text-muted-foreground mb-4">Cannot Access Transactions</h2>
    <p className="text-slate-500 mb-6 max-w-md text-center">
      To view or create transactions, your company must have an active fiscal year. Please navigate to Settings &gt; Financial Settings &gt; Fiscal Years to create and set an active fiscal year.
    </p>
    <a href="/settings/finance/fiscal-year" className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
      Go to Fiscal Year Settings
    </a>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { user, isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth, activeFiscalYear, activeCompany } = useAuth();
  const { activeRole } = usePermissions();
  const location = useLocation();

  useEffect(() => {
    if (!authChecked && !isLoadingAuth) {
      checkUserAuth();
    }
  }, [authChecked, isLoadingAuth, checkUserAuth]);

  if (isLoadingAuth || !authChecked) {
    return fallback;
  }

  if (authError) {
    if (authError.type === 'incomplete_profile') {
      if (location.pathname !== '/onboarding') {
        return <Navigate to="/onboarding" replace />;
      }
      return <Outlet />;
    }
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  // Zero-Trust Route Authorization Check (Fail-Closed)
  const isAllowed = canAccessRoute(location.pathname, user, activeRole, null, activeCompany);
  if (!isAllowed) {
    return <AccessDenied />;
  }

  // Global Fiscal Year Guardrail for transactions
  const transactionRoutes = [
    '/pos', '/sales/quotations', '/sales/orders', '/sales/invoices', '/sales/returns',
    '/purchase/orders', '/purchase/invoices', '/purchase/returns', '/treasury/vouchers'
  ];
  if (!activeFiscalYear && transactionRoutes.some(route => location.pathname.startsWith(route))) {
    return <FiscalYearRequired />;
  }

  return <Outlet />;
}
