import React, { createContext, useState, useContext, useEffect } from 'react';
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

  const switchCompany = async (companyId, preloadedCompany = null) => {
    setIsSwitchingCompany(true);
    sajilo.setCompanyId(companyId);
    
    // Use preloaded object if provided (useful during initial load when state hasn't updated)
    const company = preloadedCompany || availableCompanies.find(c => c.id === companyId);
    if (company) {
      setActiveCompany(company);
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
      if (userData.role === 'admin') {
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
        sajilo.setCompanyId(null);
      }
    } catch (error) {
      setUser(null);
      setSession(null);
      setIsAuthenticated(false);
      setActiveCompany(null);
      setAvailableCompanies([]);
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
      sajilo.setCompanyId(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

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
