import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import SettingsCategoryNav from './components/SettingsCategoryNav';
import SettingsSubNav from './components/SettingsSubNav';
import UnsavedChangesPrompt from './components/UnsavedChangesPrompt';
import { useAuth } from '@/lib/AuthContext';
import { useSettingsStore, DEFAULT_SETTINGS } from '@/store/settingsStore';
import { SettingsSkeletonLoader } from '@/components/shared/SettingsSkeletonLoader';

const SettingsLayout = () => {
  const location = useLocation();
  const pathParts = location.pathname.split('/');
  const category = pathParts[2]; // /settings/category/subCategory
  const { activeCompany, globalSettings, isLoadingAuth } = useAuth();
  const { setServerSettings } = useSettingsStore();

  useEffect(() => {
    // Guard with loading state (DEVELOPMENT_CHECKLIST §2 — Guard UI Banners with Loading States)
    if (isLoadingAuth) return;

    // Hydrate settingsStore from globalSettings — single source of truth.
    // Eliminates the duplicate CompanySettings.list() DB call.
    if (globalSettings) {
      setServerSettings({ ...DEFAULT_SETTINGS, ...globalSettings });
    } else {
      setServerSettings({ ...DEFAULT_SETTINGS });
    }
  }, [activeCompany?.id, globalSettings, isLoadingAuth, setServerSettings]);

  if (isLoadingAuth) {
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
            <div className="flex-1 h-full overflow-y-auto p-6 relative">
              <React.Suspense fallback={<SettingsSkeletonLoader />}>
                <Outlet />
              </React.Suspense>
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
