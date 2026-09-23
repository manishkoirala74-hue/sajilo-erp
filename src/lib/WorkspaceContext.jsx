import React, { createContext, useContext } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { sajilo } from '@/api/sajiloClient';
import { formatDualDateString } from '@/lib/nepaliDate';
import DualDateDisplay from '@/components/shared/DualDateDisplay';

const WorkspaceContext = createContext(null);

export const WorkspaceProvider = ({ children }) => {
  const { activeCompany, globalSettings, isLoadingAuth, refreshGlobalSettings } = useAuth();
  const queryClient = useQueryClient();

  // Read directly from globalSettings — no independent DB call.
  // globalSettings is the single source of truth hydrated by get_user_auth_context RPC.
  const settings = globalSettings || null;
  const isLoading = isLoadingAuth;

  const dateFormat = settings?.date_format || 'AD';
  const displayBsDate = settings?.display_bs_date ?? false;
  const numberSystem =
    settings?.number_system || (dateFormat === 'BS' ? 'south_asian' : 'international');

  const toggleDateFormat = async () => {
    if (!settings?.id) return;
    const newFormat = dateFormat === 'AD' ? 'BS' : 'AD';
    try {
      await sajilo.entities.CompanySettings.update(settings.id, { date_format: newFormat });
      // Invalidate using entity-driven key pattern (DEVELOPMENT_CHECKLIST §2)
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey.includes('CompanySettings'),
      });
      await refreshGlobalSettings();
    } catch (e) {
      console.error('Failed to update date format', e);
    }
  };

  const toggleNumberSystem = async () => {
    if (!settings?.id) return;
    const newSystem = numberSystem === 'international' ? 'south_asian' : 'international';
    try {
      await sajilo.entities.CompanySettings.update(settings.id, { number_system: newSystem });
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey.includes('CompanySettings'),
      });
      await refreshGlobalSettings();
    } catch (e) {
      console.warn('Failed to update number system', e);
    }
  };

  const formatDate = (adDateStr) => {
    if (!adDateStr) return '';
    return <DualDateDisplay date={adDateStr} />;
  };

  const formatDateForExport = (adDateStr) => {
    if (!adDateStr) return '';
    return formatDualDateString(adDateStr, displayBsDate);
  };

  const value = {
    settings,
    isLoading,
    dateFormat,
    displayBsDate,
    numberSystem,
    toggleDateFormat,
    toggleNumberSystem,
    formatDate,
    formatDateForExport,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
