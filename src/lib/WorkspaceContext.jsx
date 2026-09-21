import React, { createContext, useContext } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { sajilo } from '@/api/sajiloClient';
import { formatDualDateString } from '@/lib/nepaliDate';
import DualDateDisplay from '@/components/shared/DualDateDisplay';

const WorkspaceContext = createContext(null);

export const WorkspaceProvider = ({ children }) => {
  const { activeCompany } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings = null, isLoading } = useQuery({
    queryKey: ['Company', activeCompany?.id, 'CompanySettings', 'settings'],
    queryFn: async () => {
      if (!activeCompany?.id) return null;
      const data = await sajilo.entities.CompanySettings.list();
      return data[0] || null;
    },
    enabled: !!activeCompany?.id,
    staleTime: 1000 * 60 * 10,
  });

  const dateFormat = settings?.date_format || 'AD';
  const displayBsDate = settings?.display_bs_date ?? false;
  const numberSystem = settings?.number_system || (dateFormat === 'BS' ? 'south_asian' : 'international');

  const toggleDateFormat = async () => {
    if (!settings?.id) return;
    const newFormat = dateFormat === 'AD' ? 'BS' : 'AD';
    try {
      await sajilo.entities.CompanySettings.update(settings.id, { date_format: newFormat });
      queryClient.invalidateQueries({ queryKey: ['company', activeCompany?.id, 'settings'] });
    } catch (e) {
      console.error('Failed to update date format', e);
    }
  };

  const toggleNumberSystem = async () => {
    if (!settings?.id) return;
    const newSystem = numberSystem === 'international' ? 'south_asian' : 'international';
    try {
      await sajilo.entities.CompanySettings.update(settings.id, { number_system: newSystem });
      queryClient.invalidateQueries({ queryKey: ['company', activeCompany?.id, 'settings'] });
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

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
