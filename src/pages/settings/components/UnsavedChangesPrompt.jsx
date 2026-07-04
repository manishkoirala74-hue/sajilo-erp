import { useEffect } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

const UnsavedChangesPrompt = () => {
  const hasUnsavedChanges = useSettingsStore(state => state.hasUnsavedChanges());

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);

  return null;
};

export default UnsavedChangesPrompt;
