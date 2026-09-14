import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { hasPermission, canAccessRoute } from '@/lib/permissionResolver';

const PermissionContext = createContext(null);

export function PermissionProvider({ children }) {
  const { user, activeCompany, activeRole, isLoadingAuth, authChecked } = useAuth();

  const isUserAdmin = user?.role === 'admin' || user?.role === 'tenant_admin' || user?.role === 'owner' || user?.company_scope === 'ALL' || user?.is_tenant_admin === true || user?.is_super_admin === true;

  const accessState = useMemo(() => {
    if (isLoadingAuth || !authChecked) return 'loading';
    if (!user) return 'unauthenticated';
    if (!activeCompany) return 'resolving_company_access';
    if (!activeRole && !isUserAdmin) return 'resolving_permissions';
    return 'ready';
  }, [isLoadingAuth, authChecked, user, activeCompany, activeRole, isUserAdmin]);

  const can = (permissionKey) => {
    return hasPermission({ user, activeCompany, activeRole, permissionKey });
  };

  const checkRoute = (pathname) => {
    return canAccessRoute(pathname, user, activeRole, null, activeCompany);
  };

  return (
    <PermissionContext.Provider
      value={{
        can,
        canAccessRoute: checkRoute,
        accessState,
        activeRole,
        isReady: accessState === 'ready'
      }}
    >
      {children}
    </PermissionContext.Provider>
  );
}

export const usePermissionContext = () => {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermissionContext must be used within a PermissionProvider');
  }
  return context;
};
