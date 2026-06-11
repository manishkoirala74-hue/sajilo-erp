import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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
      if (currentUser.company_scope !== 'ALL') {
        const ucList = await sajilo.entities.UserCompany.filter({ user_id: currentUser.id, company_id: companyId });
        if (ucList.length > 0) roleId = ucList[0].company_role_id;
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

  const switchCompany = async (companyId, preloadedCompany = null) => {
    setIsSwitchingCompany(true);
    sajilo.setCompanyId(companyId);
    
    const company = preloadedCompany || availableCompanies.find(c => c.id === companyId);
    if (company) {
      setActiveCompany(company);
      if (user) await fetchPermissions(user, companyId);
    }

    try {
      await sajilo.prefetchCompanyData();
    } catch (e) {
      console.error("Prefetch failed:", e);
    } finally {
      setIsSwitchingCompany(false);
    }
  };

  const fetchUserCompanies = async (userData) => {
    try {
      if (userData.company_scope === 'ALL' || userData.role === 'admin') {
        const allCompanies = await sajilo.entities.Company.list();
        setAvailableCompanies(allCompanies);
        if (allCompanies.length > 0) {
          const userCompanies = await sajilo.entities.UserCompany.filter({ user_id: userData.id });
          const defaultUc = userCompanies.find(uc => uc.is_default);
          
          const stored = sajilo.getCompanyId();
          const targetId = stored || (defaultUc ? defaultUc.company_id : allCompanies[0].id);
          const target = allCompanies.find(c => c.id === targetId) || allCompanies[0];
          await switchCompany(target.id, target);
        }
      } else {
        const userCompanies = await sajilo.entities.UserCompany.filter({ user_id: userData.id });
        if (userCompanies.length > 0) {
          const companyIds = userCompanies.map(uc => uc.company_id);
          const companies = await sajilo.entities.Company.list();
          const allowedCompanies = companies.filter(c => companyIds.includes(c.id));
          setAvailableCompanies(allowedCompanies);
          
          if (allowedCompanies.length > 0) {
            const defaultUc = userCompanies.find(uc => uc.is_default);
            const stored = sajilo.getCompanyId();
            const targetId = stored || (defaultUc ? defaultUc.company_id : allowedCompanies[0].id);
            const target = allowedCompanies.find(c => c.id === targetId) || allowedCompanies[0];
            await switchCompany(target.id, target);
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch companies:", e);
    }
  };

  const checkUserAuth = async () => {
    try {
      const authUser = await sajilo.auth.me();
      
      if (authUser) {
        let profileData = {};
        try {
          const existingUsers = await sajilo.entities.User.filter({ id: authUser.id });
          if (!existingUsers || existingUsers.length === 0) {
            const newProfile = {
              id: authUser.id,
              role: 'admin',
              company_scope: 'ALL',
              must_change_password: false
            };
            await sajilo.entities.User.create(newProfile);
            profileData = newProfile;
          } else {
            profileData = existingUsers[0];
          }
        } catch (e) {
          console.error("Failed to sync auth user to public User table:", e);
        }

        const mergedUser = { ...authUser, ...profileData };
        setUser(mergedUser);
        setSession({ user: mergedUser });
        setIsAuthenticated(true);
        
        await fetchUserCompanies(mergedUser);
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
    if (user?.role === 'admin' && user?.company_scope === 'ALL') return true;
    
    // Check overrides
    const override = activeOverrides.find(o => o.module_key === module && o.operation === operation);
    if (override) {
      if (override.override_type === 'DENY') return false;
      if (override.override_type === 'GRANT') return true;
    }

    if (!activeRole) {
       if (user?.role === 'admin') return true; // Migration safety
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
      login,
      loginWithGoogle,
      signUp,
      verifyOtp,
      logout,
      activeRole,
      hasAccess
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
