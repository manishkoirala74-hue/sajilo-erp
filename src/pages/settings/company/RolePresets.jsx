import React from 'react';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from 'sonner';

const RolePresets = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    setServerSettings({ ...draftSettings });
    toast.success("Role Presets saved successfully");
  };

  return (
    <SettingPageLayout
      title="Role Presets"
      description="Define standard role templates that can be applied to users."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <p className="text-muted-foreground text-sm">Role preset management will be available in a future update.</p>
      </div>
    </SettingPageLayout>
  );
};

export default RolePresets;
