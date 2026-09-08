import React, { createContext, useContext, useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';

const NumberFormatContext = createContext();

export const NumberFormatProvider = ({ children }) => {
  const [numberSystem, setNumberSystem] = useState('international'); // 'international' | 'south_asian'
  const [settingsId, setSettingsId] = useState(null);

  useEffect(() => {
    const fetchSettings = () => {
      sajilo.entities.CompanySettings.list().then(data => {
        if (data[0]) {
          setSettingsId(data[0].id);
          // If a dedicated number_system exists, use it. Otherwise, derive from date_format.
          if (data[0].number_system) {
            setNumberSystem(data[0].number_system);
          } else if (data[0].date_format === 'BS') {
            setNumberSystem('south_asian');
          } else {
            setNumberSystem('international');
          }
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

  const toggleNumberSystem = async () => {
    const newSystem = numberSystem === 'international' ? 'south_asian' : 'international';
    setNumberSystem(newSystem);
    try {
      if (settingsId) {
        await sajilo.entities.CompanySettings.update(settingsId, { number_system: newSystem });
      }
    } catch (e) {
      console.warn('number_system column might not exist yet, defaulting to ephemeral state', e);
    }
  };

  return (
    <NumberFormatContext.Provider value={{ numberSystem, toggleNumberSystem }}>
      {children}
    </NumberFormatContext.Provider>
  );
};

export const useNumberFormat = () => {
  const context = useContext(NumberFormatContext);
  if (!context) throw new Error('useNumberFormat must be used within NumberFormatProvider');
  return context;
};
