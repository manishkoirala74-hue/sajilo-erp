import React, { memo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import GLAccountSettings from '@/components/settings/GLAccountSettings';
import { toast } from 'sonner';

const MemoizedGLAccountSettings = memo(GLAccountSettings);

const GLMapping = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    try {
      await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      setServerSettings({ ...draftSettings });
      toast.success("GL Account Mappings saved successfully");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save GL Account Mappings");
    }
  };

  return (
    <SettingPageLayout
      title="GL Account Mapping"
      description="Map default General Ledger accounts for system operations."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <MemoizedGLAccountSettings
          settings={draftSettings}
          onChange={(updates) => updateDraftSettings(updates)}
        />
      </div>
    </SettingPageLayout>
  );
};

export default GLMapping;
