import React, { createContext, useContext, useState, useEffect } from 'react';
import { adToBS, formatBS, formatAD } from '@/lib/nepaliDate';
import { sajilo } from '@/api/sajiloClient';

const DateFormatContext = createContext();

export const DateFormatProvider = ({ children }) => {
  const [dateFormat, setDateFormat] = useState('AD'); // 'AD' | 'BS'
  const [settingsId, setSettingsId] = useState(null);

  // Load saved format from CompanySettings on mount
  useEffect(() => {
    sajilo.entities.CompanySettings.list().then(data => {
      if (data[0]) {
        setSettingsId(data[0].id);
        if (data[0].date_format) setDateFormat(data[0].date_format);
      }
    }).catch(() => {});
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

  // Universal display formatter: always receives an AD date string, outputs in the current format
  const formatDate = (adDateStr) => {
    if (!adDateStr) return '';
    if (dateFormat === 'BS') {
      const bs = adToBS(adDateStr);
      return formatBS(bs);
    }
    return formatAD(adDateStr);
  };

  return (
    <DateFormatContext.Provider value={{ dateFormat, toggleDateFormat, formatDate }}>
      {children}
    </DateFormatContext.Provider>
  );
};

export const useDateFormat = () => {
  const context = useContext(DateFormatContext);
  if (!context) throw new Error('useDateFormat must be used within DateFormatProvider');
  return context;
};