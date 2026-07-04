import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import SettingsCategoryNav from './components/SettingsCategoryNav';
import SettingsSubNav from './components/SettingsSubNav';
import UnsavedChangesPrompt from './components/UnsavedChangesPrompt';
import { sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { useSettingsStore, DEFAULT_SETTINGS } from '@/store/settingsStore';

const SettingsLayout = () => {
  const location = useLocation();
  const pathParts = location.pathname.split('/');
  const category = pathParts[2]; // /settings/category/subCategory
  const { activeCompany } = useAuth();
  const { setServerSettings } = useSettingsStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeCompany) {
      setServerSettings({ ...DEFAULT_SETTINGS });
      setLoading(false);
      return;
    }
    
    setLoading(true);
    sajilo.entities.CompanySettings.list().then(data => {
      if (data.length > 0) {
        setServerSettings({ ...DEFAULT_SETTINGS, ...data[0] });
      } else {
        setServerSettings({ ...DEFAULT_SETTINGS });
      }
      setLoading(false);
    }).catch(() => {
      setServerSettings({ ...DEFAULT_SETTINGS });
      setLoading(false);
    });
  }, [activeCompany?.id, setServerSettings]);

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] w-full bg-background overflow-hidden p-6 gap-6">
        <div className="w-[280px] h-full bg-muted/20 animate-pulse rounded-xl" />
        <div className="flex-1 h-full bg-muted/20 animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full bg-background overflow-hidden">
      <UnsavedChangesPrompt />
      {/* Column 2: Category Nav */}
      <div className="w-[280px] flex-shrink-0 border-r border-border h-full overflow-y-auto bg-card sticky top-0">
        <SettingsCategoryNav activeCategory={category} />
      </div>

      {/* Column 3: Sub-Nav and Configuration Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {category ? (
          <>
            {/* Sub-Nav */}
            <div className="w-[240px] flex-shrink-0 border-r border-border h-full overflow-y-auto bg-muted/30">
              <SettingsSubNav category={category} />
            </div>
            {/* Configuration Workspace */}
            <div className="flex-1 h-full overflow-y-auto p-6">
              <Outlet />
            </div>
          </>
        ) : (
          <div className="flex-1 h-full flex items-center justify-center text-muted-foreground">
            Select a category to view settings.
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsLayout;
