import React, { memo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import DepreciationSettings from '@/components/settings/DepreciationSettings';
import { toast } from 'sonner';

const MemoizedDepreciationSettings = memo(DepreciationSettings);

const Depreciation = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      }
      setServerSettings({ ...draftSettings });
      toast.success("Depreciation Settings saved successfully");
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings');
    }
  };

  return (
    <SettingPageLayout
      title="Depreciation Settings"
      description="Configure asset depreciation rules and associated GL accounts."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <MemoizedDepreciationSettings
          settings={draftSettings}
          onChange={(key, val) => updateDraftSettings({ [key]: val })}
        />
      </div>
    </SettingPageLayout>
  );
};

export default Depreciation;
