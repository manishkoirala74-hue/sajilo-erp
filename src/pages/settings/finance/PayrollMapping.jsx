import React, { memo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import PayrollGLSettings from '@/components/settings/PayrollGLSettings';
import { toast } from 'sonner';

const MemoizedPayrollGLSettings = memo(PayrollGLSettings);

const PayrollMapping = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      }
      setServerSettings({ ...draftSettings });
      toast.success("Payroll Mappings saved successfully");
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings');
    }
  };

  return (
    <SettingPageLayout
      title="Payroll Mapping"
      description="Map HR and Payroll components to General Ledger accounts."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <MemoizedPayrollGLSettings
          settings={draftSettings}
          onChange={(updates) => updateDraftSettings(updates)}
        />
      </div>
    </SettingPageLayout>
  );
};

export default PayrollMapping;
