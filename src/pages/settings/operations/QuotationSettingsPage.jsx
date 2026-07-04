import React, { memo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import QuotationSettings from '@/components/settings/QuotationSettings';
import { toast } from 'sonner';

const MemoizedQuotationSettings = memo(QuotationSettings);

const QuotationSettingsPage = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      }
      setServerSettings({ ...draftSettings });
      toast.success("Quotation Settings saved successfully");
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings');
    }
  };

  return (
    <SettingPageLayout
      title="Quotation & Estimates"
      description="Configure quotation expiration policies and template defaults."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <MemoizedQuotationSettings
          settings={draftSettings}
          onChange={(key, val) => updateDraftSettings({ [key]: val })}
        />
      </div>
    </SettingPageLayout>
  );
};

export default QuotationSettingsPage;
