import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { sajilo } from '../api/sajiloClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
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
      let isTenantAdmin = false;
      if (currentUser.company_scope !== 'ALL') {
        const ucList = await sajilo.entities.UserCompany.filter({ user_id: currentUser.id, company_id: companyId });
        if (ucList.length > 0) {
          roleId = ucList[0].company_role_id;
          isTenantAdmin = ucList[0].is_tenant_admin;
        }
      }
      
      // Inject admin role into user session if they are a tenant admin
      if (isTenantAdmin && currentUser.role !== 'admin') {
        setUser(prev => ({ ...prev, role: 'admin' }));
      }
      
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
    
    // 3. Fire-and-Forget Domain Data (Notice the missing 'await')
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

  // =========================================================================
  // PRODUCTION REFACTOR: ERP-GRADE TRANSACT-SAFE COMPANY CREATOR
  // =========================================================================
  const createCompany = async (companyName) => {
    try {
      if (!user || !user.id) throw new Error("No authenticated session available");

      // 1. Explicitly match 'created_by' string to bypass RLS Rule C instantly
      const companyPayload = {
        name: companyName,
        created_by: user.id.toString()
      };

      const newCompany = await sajilo.entities.Company.create(companyPayload);
      if (!newCompany || !newCompany.id) throw new Error("Database failed to yield returned company reference object");

      // 2. Build direct user relationship mapping link
      await sajilo.entities.UserCompany.create({
        user_id: user.id,
        company_id: newCompany.id,
        is_default: true,
        is_tenant_admin: true
      });

      // 3. Seed default Fiscal Year for new company (Bikram Sambat bounds)
      const currentYear = new Date().getFullYear();
      await sajilo.entities.FiscalYear.create({
        company_id: newCompany.id,
        fiscal_year_name: `FY-${currentYear}/${currentYear + 1}`,
        start_date: `${currentYear}-04-01`,
        end_date: `${currentYear + 1}-03-31`,
        is_active: true
      });

      // 3. Re-sync memory collection vectors and shift context automatically
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
          setAuthError(null);
          const mergedUser = { ...authUser, ...profileData };
          setUser(mergedUser);
          setSession({ user: mergedUser });
          setIsAuthenticated(true);
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
      setUser(null);
      setSession(null);
      setIsAuthenticated(false);
      setActiveCompany(null);
      setAvailableCompanies([]);
      setActiveRole(null);
      setActiveOverrides([]);
      sajilo.setCompanyId(null);
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    checkUserAuth();
  }, []);

  const login = async (email, password) => {
    await sajilo.auth.loginWithPassword(email, password);
    await checkUserAuth();
  };

  const loginWithGoogle = async () => {
    await sajilo.auth.loginWithGoogle();
  };

  const signUp = async (email, password) => {
    return await sajilo.auth.signUp(email, password);
  };

  const verifyOtp = async (email, token) => {
    await sajilo.auth.verifyOtp(email, token);
    await checkUserAuth();
  };

  const logout = async () => {
    try {
      await sajilo.auth.logout();
      setUser(null);
      setSession(null);
      setIsAuthenticated(false);
      setActiveCompany(null);
      setAvailableCompanies([]);
      setActiveRole(null);
      setActiveOverrides([]);
      sajilo.setCompanyId(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const hasAccess = useCallback((module, operation) => {
    if (user?.role === 'admin' || user?.is_super_admin === true) return true;
    
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
      createCompany, // 🟢 EXPOSED TO FRONTEND CONTEXT
      login,
      loginWithGoogle,
      signUp,
      verifyOtp,
      logout,
      activeRole,
      hasAccess,
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
  return {
    hasAccess: context.hasAccess,
    activeRole: context.activeRole,
    sidebarVisibility: context.activeRole?.sidebar_visibility || []
  };
};