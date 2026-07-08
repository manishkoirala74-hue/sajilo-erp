import React, { createContext, useContext, useState, useEffect } from 'react';
import { adToBS, formatBS, formatAD, formatDualDateString } from '@/lib/nepaliDate';
import { sajilo } from '@/api/sajiloClient';
import DualDateDisplay from '@/components/shared/DualDateDisplay';

const DateFormatContext = createContext();

export const DateFormatProvider = ({ children }) => {
  const [dateFormat, setDateFormat] = useState('AD'); // 'AD' | 'BS'
  const [displayBsDate, setDisplayBsDate] = useState(false);
  const [settingsId, setSettingsId] = useState(null);

  // Load saved format from CompanySettings on mount and subscribe to changes
  useEffect(() => {
    const fetchSettings = () => {
      sajilo.entities.CompanySettings.list().then(data => {
        if (data[0]) {
          setSettingsId(data[0].id);
          if (data[0].date_format) setDateFormat(data[0].date_format);
          if (data[0].display_bs_date !== undefined) setDisplayBsDate(data[0].display_bs_date);
        }
      }).catch(() => {});
    };

    fetchSettings();

    const handleInvalidate = (e) => {
      if (e.detail === 'CompanySettings') {
        fetchSettings();
      }
    };

    window.addEventListener('sajilo_invalidate', handleInvalidate);
    return () => window.removeEventListener('sajilo_invalidate', handleInvalidate);
  }, []);

  const toggleDateFormat = async () => {
    const newFormat = dateFormat === 'AD' ? 'BS' : 'AD';
    setDateFormat(newFormat);
    // Persist to CompanySettings
    try {
      if (settingsId) {
        await sajilo.entities.CompanySettings.update(settingsId, { date_format: newFormat });
      }
    } catch (e) {
      console.error('Failed to persist date format', e);
    }
  };

  // Universal display formatter for DataTables and UI rendering
  const formatDate = (adDateStr) => {
    if (!adDateStr) return '';
    return <DualDateDisplay date={adDateStr} />;
  };

  // Safe string formatter for CSV/Excel exports
  const formatDateForExport = (adDateStr) => {
    if (!adDateStr) return '';
    return formatDualDateString(adDateStr, displayBsDate);
  };

  return (
    <DateFormatContext.Provider value={{ dateFormat, toggleDateFormat, formatDate, displayBsDate, formatDateForExport }}>
      {children}
    </DateFormatContext.Provider>
  );
};

export const useDateFormat = () => {
  const context = useContext(DateFormatContext);
  if (!context) throw new Error('useDateFormat must be used within DateFormatProvider');
  return context;
};