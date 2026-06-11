import { useEffect } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { useAuth, usePermissions } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const DefaultFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-border border-t-slate-800 rounded-full animate-spin"></div>
  </div>
);

const AccessDenied = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh]">
    <h1 className="text-4xl font-bold text-foreground mb-2">403</h1>
    <h2 className="text-xl font-semibold text-muted-foreground mb-4">Access Denied</h2>
    <p className="text-slate-500 mb-6 max-w-md text-center">
      You do not have the required permissions to view this page. Please contact your system administrator.
    </p>
    <a href="/" className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors">
      Return to Dashboard
    </a>
  </div>
);

export default function ProtectedRoute({ fallback = <DefaultFallback />, unauthenticatedElement }) {
  const { user, isAuthenticated, isLoadingAuth, authChecked, authError, checkUserAuth } = useAuth();
  const { sidebarVisibility } = usePermissions();
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
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    return unauthenticatedElement;
  }

  if (!isAuthenticated) {
    return unauthenticatedElement;
  }

  // RBAC Routing Check
  const path = location.pathname;
  const isAdmin = user?.role === 'admin' && user?.company_scope === 'ALL';
  const isStandardRoute = path === '/' || path === '/settings' || path === '/reports';
  
  if (!isAdmin && !isStandardRoute) {
    // We check if the exact path or base path is in the allowed visibility list
    const hasPathAccess = sidebarVisibility.some(vis => path.startsWith(vis));
    if (!hasPathAccess && sidebarVisibility.length > 0) {
      return <AccessDenied />;
    }
  }

  return <Outlet />;
}
