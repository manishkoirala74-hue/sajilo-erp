import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sajilo } from '../api/sajiloClient';
import { hasPermission as resolvePermission } from '@/lib/permissionResolver';
import throttle from 'lodash/throttle';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [activeCompany, setActiveCompany] = useState(null);
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [isSwitchingCompany, setIsSwitchingCompany] = useState(false);

  // RBAC States
  const [activeRole, setActiveRole] = useState(null);
  const [activeOverrides, setActiveOverrides] = useState([]);

    const [globalSettings, setGlobalSettings] = useState(null);
  const [mainGodownId, setMainGodownId] = useState(null);
  const [activeGodowns, setActiveGodowns] = useState([]);

  // Fetch Fiscal Years using React Query for global Topbar reactivity
  const currentCompanyId = activeCompany?.id || sajilo.getCompanyId();
  const { data: fiscalYears = [], isError: fyIsError, error: fyError, isLoading: fyIsLoading } = useQuery({
    queryKey: ['Company', currentCompanyId, 'FiscalYear', 'fiscalYears'],
    queryFn: async () => {
      const { data, error } = await sajilo.auth.supabase
        .from('FiscalYear')
        .select('*')
        .eq('company_id', currentCompanyId)
        .order('start_date', { ascending: false });
        
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentCompanyId,
    staleTime: 1000 * 60 * 10
  });

  const activeFiscalYear = fiscalYears.find(fy => fy.status === 'OPEN' || fy.is_active === true || fy.is_active === 'true' || fy.is_active === 1) || null;

    const switchCompany = async (companyId) => {
    setIsSwitchingCompany(true);
    sajilo.setCompanyId(companyId);
    
    try {
      const { data: ctx, error } = await sajilo.auth.supabase.rpc('get_user_auth_context', {
        p_company_id: companyId
      });
      
      if (error) throw error;

      if (ctx && ctx.status === 'ok') {
        const mergedUser = { ...user, ...ctx.user, is_tenant_admin: ctx.is_tenant_admin };
        setUser(mergedUser);
        setSession({ user: mergedUser });
        setActiveCompany(ctx.active_company);
        setActiveRole(ctx.active_role || null);
        setActiveOverrides(ctx.overrides || []);
        setGlobalSettings(ctx.settings || null);
        setActiveGodowns(ctx.godowns || []);
        setMainGodownId((ctx.godowns || []).find(g => g.is_main)?.id || null);
      }
    } catch (e) {
      console.error("Failed to switch company cleanly:", e);
    }

    // 2. Unblock the UI IMMEDIATELY
    setIsSwitchingCompany(false);
    
    // 3. Fire-and-Forget Domain Data
    sajilo.prefetchDomainData(companyId);
  };

  // Expose a method to force refresh settings (useful after toggling feature flags)
  const refreshGlobalSettings = async () => {
    if (activeCompany) {
      await checkUserAuth();
    }
  };

    const createCompany = async (companyName) => {
    try {
      if (!user || !user.id) throw new Error("No authenticated session available");

      const companyPayload = {
        name: companyName,
        created_by: user.id.toString()
      };

      const newCompany = await sajilo.entities.Company.create(companyPayload);
      if (!newCompany || !newCompany.id) throw new Error("Database failed to yield returned company reference object");

      await sajilo.entities.UserCompany.create({
        user_id: user.id,
        company_id: newCompany.id,
        is_default: true,
        is_tenant_admin: true
      });

      const currentYear = new Date().getFullYear();
      await sajilo.entities.FiscalYear.create({
        company_id: newCompany.id,
        fiscal_year_name: `FY-${currentYear}/${currentYear + 1}`,
        start_date: `${currentYear}-04-01`,
        end_date: `${currentYear + 1}-03-31`,
        is_active: true
      });

      if (user) {
        await switchCompany(newCompany.id);
      }
      
      return newCompany;
    } catch (error) {
      console.error("Intercepted transactional workspace failure:", error);
      throw error;
    }
  };

  const checkUserAuth = async () => {
    try {
      const authUser = await sajilo.auth.me();
      
      if (authUser) {
        const storedCompanyId = sajilo.getCompanyId();
        const { data: ctx, error } = await sajilo.auth.supabase.rpc('get_user_auth_context', {
          p_company_id: storedCompanyId || null
        });
        
        if (error) {
           console.error("Auth RPC failed:", error);
           throw error;
        }

        switch (ctx.status) {
          case 'not_registered':
            setAuthError({ type: 'incomplete_profile' });
            setUser(authUser);
            setSession({ user: authUser });
            setIsAuthenticated(true);
            setAvailableCompanies([]);
            setActiveCompany(null);
            setActiveRole(null);
            setActiveOverrides([]);
            sajilo.setCompanyId(null);
            break;
            
          case 'suspended':
            console.warn("Account status is inactive/suspended");
            await logout();
            return;
            
          case 'company_access_denied':
            setAuthError({ type: 'company_access_denied' });
            break;
            
          case 'no_company':
            setAuthError(null);
            setUser({ ...authUser, ...ctx.user });
            setSession({ user: { ...authUser, ...ctx.user } });
            setIsAuthenticated(true);
            setAvailableCompanies(ctx.available_companies || []);
            setActiveCompany(null);
            setActiveRole(null);
            setActiveOverrides([]);
            sajilo.setCompanyId(null);
            break;
            
          case 'ok':
            setAuthError(null);
            if (ctx.user.must_change_password && window.location.pathname !== '/reset-password') {
              window.location.href = '/reset-password';
              return;
            }
            
            const mergedUser = { ...authUser, ...ctx.user, is_tenant_admin: ctx.is_tenant_admin };
            setUser(mergedUser);
            setSession({ user: mergedUser });
            setIsAuthenticated(true);
            setAvailableCompanies(ctx.available_companies || []);
            setActiveCompany(ctx.active_company);
            setActiveRole(ctx.active_role || null);
            setActiveOverrides(ctx.overrides || []);
            setGlobalSettings(ctx.settings || null);
            setActiveGodowns(ctx.godowns || []);
            setMainGodownId((ctx.godowns || []).find(g => g.is_main)?.id || null);
            sajilo.setCompanyId(ctx.active_company.id);
            
            // Fire-and-Forget Domain Data
            sajilo.prefetchDomainData(ctx.active_company.id);
            break;
        }
      } else {
        setUser(null);
        setSession(null);
        setIsAuthenticated(false);
        setActiveCompany(null);
        setAvailableCompanies([]);
        setActiveRole(null);
        setActiveOverrides([]);
        sajilo.setCompanyId(null);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      setUser(null);
      setSession(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const login = async (email, password) => {
    const res = await sajilo.auth.login(email, password);
    return res;
  };

  const loginWithGoogle = async () => {
    return await sajilo.auth.loginWithGoogle();
  };

  const signUp = async (data) => {
    const res = await sajilo.auth.signUp(data);
    return res;
  };

  const verifyOtp = async (email, token) => {
    await sajilo.auth.verifyOtp(email, token);
  };

  const logout = async () => {
    try {
      if (queryClient) {
        queryClient.clear();
      }
      await sajilo.auth.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setUser(null);
      setSession(null);
      setIsAuthenticated(false);
      setActiveCompany(null);
      setAvailableCompanies([]);
      setActiveRole(null);
      setActiveOverrides([]);
      sajilo.setCompanyId(null);
    }
  };

  useEffect(() => {
    checkUserAuth();

    const { data: authListener } = sajilo.auth.supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'TOKEN_REFRESHED') {
        if (currentSession) setSession(currentSession);
        return;
      }
      if (event === 'SIGNED_IN') {
        await checkUserAuth();
      } else if (event === 'SIGNED_OUT') {
        if (queryClient) queryClient.clear();
        setUser(null);
        setSession(null);
        setIsAuthenticated(false);
        setActiveCompany(null);
        setAvailableCompanies([]);
        setActiveRole(null);
        setActiveOverrides([]);
        sajilo.setCompanyId(null);
        setIsLoadingAuth(false);
        setAuthChecked(true);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Realtime subscription for User & UserCompany account/membership status changes
  useEffect(() => {
    if (!user?.id) return;

    const channel = sajilo.auth.supabase
      .channel(`user-lifecycle-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'User',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          const updated = payload.new;
          if (updated && updated.account_status && updated.account_status !== 'active') {
            logout();
          } else {
            checkUserAuth();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'UserCompany',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const updated = payload.new;
          if (activeCompany && updated && updated.company_id === activeCompany.id) {
            if (updated.membership_status && updated.membership_status !== 'active') {
              checkUserAuth();
            } else {
              checkUserAuth();
            }
          }
        }
      )
      .subscribe();

    return () => {
      sajilo.auth.supabase.removeChannel(channel);
    };
  }, [user?.id, activeCompany?.id]);

  // ── CompanySettings Realtime Subscription ──
  // Pushes setting changes to ALL connected users without re-login.
  // Uses abstracted realtimeSync interface for database portability.
  useEffect(() => {
    if (!activeCompany?.id) return;
    
    let unsubscribeFn = null;
    
    const setupRealtime = async () => {
      const { subscribeToCompanySettings } = await import('@/api/realtimeSync');
      unsubscribeFn = subscribeToCompanySettings(activeCompany.id, (newSettings) => {
        if (newSettings) {
          setGlobalSettings(newSettings);
        } else {
          refreshGlobalSettings();
        }
      });
    };
    
    setupRealtime();
    
    return () => {
      if (unsubscribeFn) unsubscribeFn();
    };
  }, [activeCompany?.id]);

  // ── Session Idle Timeout ──
  // Enforces company-configured session idle policy (security.sessionIdleTimeoutMinutes).
  useEffect(() => {
    const timeoutMinutes = globalSettings?.session_idle_timeout_minutes ?? 0;
    if (!timeoutMinutes || timeoutMinutes <= 0 || !isAuthenticated) return;

    const timeoutMs = timeoutMinutes * 60 * 1000;
    let idleTimer;

    const reset = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        logout();
      }, timeoutMs);
    };

    const throttledResetTimer = throttle(reset, 5000, { leading: true, trailing: false });

    const events = ['mousedown', 'keydown', 'touchstart', 'visibilitychange'];
    events.forEach((e) => window.addEventListener(e, throttledResetTimer));
    reset();

    return () => {
      clearTimeout(idleTimer);
      throttledResetTimer.cancel();
      events.forEach((e) => window.removeEventListener(e, throttledResetTimer));
    };
  }, [globalSettings?.session_idle_timeout_minutes, isAuthenticated]);

  const hasAccess = useCallback((module, operation) => {
    if (
      user?.role === 'admin' ||
      user?.role === 'tenant_admin' ||
      user?.role === 'owner' ||
      user?.is_super_admin === true ||
      user?.company_scope === 'ALL' ||
      user?.is_tenant_admin === true
    ) return true;
    
    const override = activeOverrides.find(o => o.module_key === module && o.operation === operation);
    if (override) {
      if (override.override_type === 'DENY') return false;
      if (override.override_type === 'GRANT') return true;
    }

    if (!activeRole) {
       return false;
    }

    const val = activeRole?.menu_permissions?.[module]?.[operation];
    return val === true || val === 'true';
  }, [user, activeOverrides, activeRole]);

  const checkPermissionKey = useCallback((permissionKey) => {
    return resolvePermission({
      user,
      activeCompany,
      activeRole,
      permissionKey
    });
  }, [user, activeCompany, activeRole]);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isAuthenticated,
      isLoadingAuth,
      authError,
      authChecked,
      activeCompany,
      availableCompanies,
      isSwitchingCompany,
      switchCompany,
      checkUserAuth,
      createCompany,
      login,
      loginWithGoogle,
      signUp,
      verifyOtp,
      logout,
      activeRole,
      hasAccess,
      checkPermissionKey,
      sidebarVisibility: activeRole?.sidebar_visibility || [],
      globalSettings,
      mainGodownId,
      activeGodowns,
      activeFiscalYear,
      fiscalYears,
      fyIsError,
      fyError,
      fyIsLoading,
      refreshGlobalSettings
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const usePermissions = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('usePermissions must be used within an AuthProvider');
  }
  return context;
};