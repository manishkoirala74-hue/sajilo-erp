import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sajilo } from '../api/sajiloClient';
import { hasPermission as resolvePermission } from '@/lib/permissionResolver';

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

  const fetchPermissions = async (currentUser, companyId) => {
    try {
      let roleId = currentUser.global_role_id;
      let isTenantAdmin = currentUser.role === 'admin' || currentUser.role === 'tenant_admin' || currentUser.role === 'owner' || currentUser.company_scope === 'ALL';

      if (companyId) {
        const ucList = await sajilo.entities.UserCompany.filter({ user_id: currentUser.id, company_id: companyId });
        if (ucList.length > 0) {
          if (ucList[0].company_role_id) roleId = ucList[0].company_role_id;
          if (ucList[0].is_tenant_admin || ucList[0].is_owner) isTenantAdmin = true;
        }
      }
      
      setUser(prev => {
        const base = prev || currentUser;
        return {
          ...base,
          role: isTenantAdmin ? 'admin' : (base.role || 'user'),
          is_tenant_admin: isTenantAdmin
        };
      });
      
      if (roleId) {
        const roles = await sajilo.entities.CompanyRole.filter({ id: roleId });
        if (roles.length > 0) setActiveRole(roles[0]);
        else setActiveRole(null);
      } else {
        setActiveRole(null);
      }

      const overrides = await sajilo.entities.UserPermissionOverride.filter({ user_id: currentUser.id });
      const validOverrides = overrides.filter(o => 
        (o.company_id === null || o.company_id === companyId) && 
        (o.expires_at === null || new Date(o.expires_at) > new Date())
      );
      setActiveOverrides(validOverrides);
    } catch (e) {
      console.error("Failed to fetch permissions:", e);
    }
  };

  const [globalSettings, setGlobalSettings] = useState(null);
  const [mainGodownId, setMainGodownId] = useState(null);
  const [activeGodowns, setActiveGodowns] = useState([]);

  // Fetch Fiscal Years using React Query for global Topbar reactivity
  const currentCompanyId = activeCompany?.id || sajilo.getCompanyId();
  const { data: fiscalYears = [], isError: fyIsError, error: fyError, isLoading: fyIsLoading } = useQuery({
    queryKey: ['fiscalYears', currentCompanyId],
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

  const fetchGlobalSettings = async (companyId) => {
    try {
      const [settList, godownList] = await Promise.all([
        sajilo.entities.CompanySettings.filter({ company_id: companyId }),
        sajilo.entities.Godown.filter({ company_id: companyId, status: 'Active' })
      ]);
      setGlobalSettings(settList.length > 0 ? settList[0] : null);
      setActiveGodowns(godownList || []);
      const mainGodown = (godownList || []).find(g => g.is_main === true);
      setMainGodownId(mainGodown ? mainGodown.id : null);
    } catch (e) {
      console.error("Failed to fetch global settings:", e);
    }
  };

  const switchCompany = async (companyId, preloadedCompany = null, currentUser = user) => {
    setIsSwitchingCompany(true);
    sajilo.setCompanyId(companyId);
    
    const company = preloadedCompany || availableCompanies.find(c => c.id === companyId);
    if (company) {
      setActiveCompany(company);
      if (currentUser) {
        await fetchPermissions(currentUser, companyId);
        await fetchGlobalSettings(companyId);
      }
    }

    // 2. Unblock the UI IMMEDIATELY
    setIsSwitchingCompany(false);
    
    // 3. Fire-and-Forget Domain Data
    sajilo.prefetchDomainData(companyId);
  };

  // Expose a method to force refresh settings (useful after toggling feature flags)
  const refreshGlobalSettings = async () => {
    if (activeCompany) {
      await fetchGlobalSettings(activeCompany.id);
    }
  };

  const fetchUserCompanies = async (userData) => {
    try {
      const userCompanies = await sajilo.entities.UserCompany.filter({ user_id: userData.id });

      if (!userCompanies || userCompanies.length === 0) {
        setAvailableCompanies([]);
        setActiveCompany(null);
        sajilo.setCompanyId(null);
        return;
      }

      const companyIds = userCompanies.map(uc => uc.company_id);

      const { data: allowedCompanies, error } = await sajilo.auth.supabase
        .from('Company')
        .select('*')
        .in('id', companyIds);

      if (error) throw error;

      setAvailableCompanies(allowedCompanies || []);

      if (allowedCompanies && allowedCompanies.length > 0) {
        const defaultUc = userCompanies.find(uc => uc.is_default);
        const stored = sajilo.getCompanyId();
        const storedIsAllowed = stored && companyIds.includes(stored);
        
        const targetId = (storedIsAllowed ? stored : null) ||
          (defaultUc ? defaultUc.company_id : allowedCompanies[0].id);
          
        const target = allowedCompanies.find(c => c.id === targetId) || allowedCompanies[0];
        await switchCompany(target.id, target, userData);
      }
    } catch (e) {
      console.error("Failed to fetch companies cleanly:", e);
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
        await fetchUserCompanies(user);
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
        let profileData = null;
        try {
          const existingUsers = await sajilo.entities.User.filter({ id: authUser.id });
          if (existingUsers && existingUsers.length > 0) {
            profileData = existingUsers[0];
          }
        } catch (e) {
          console.error("Failed to fetch public User table:", e);
        }

        if (!profileData) {
          setAuthError({ type: 'incomplete_profile' });
          setUser(authUser);
          setSession({ user: authUser });
          setIsAuthenticated(true);
          setAvailableCompanies([]);
          setActiveCompany(null);
          setActiveRole(null);
          setActiveOverrides([]);
          sajilo.setCompanyId(null);
        } else {
          if (profileData.account_status && profileData.account_status !== 'active') {
            console.warn("Account status is inactive/suspended:", profileData.account_status);
            await logout();
            return;
          }

          setAuthError(null);
          const mergedUser = { ...authUser, ...profileData };
          setUser(mergedUser);
          setSession({ user: mergedUser });
          setIsAuthenticated(true);
          
          if (profileData.must_change_password && window.location.pathname !== '/reset-password') {
            window.location.href = '/reset-password';
            return;
          }
          
          await fetchUserCompanies(mergedUser);
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
    await checkUserAuth();
    return res;
  };

  const loginWithGoogle = async () => {
    return await sajilo.auth.loginWithGoogle();
  };

  const signUp = async (data) => {
    const res = await sajilo.auth.signUp(data);
    await checkUserAuth();
    return res;
  };

  const verifyOtp = async (email, token) => {
    await sajilo.auth.verifyOtp(email, token);
    await checkUserAuth();
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
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
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
              fetchUserCompanies(user);
            } else {
              fetchPermissions(user, activeCompany.id);
            }
          }
        }
      )
      .subscribe();

    return () => {
      sajilo.auth.supabase.removeChannel(channel);
    };
  }, [user?.id, activeCompany?.id]);

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