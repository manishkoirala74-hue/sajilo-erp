import React from 'react';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import CommunicationSettings from '@/components/settings/CommunicationSettings';

const CommunicationChannels = () => {
  const { serverSettings } = useSettingsStore();

  return (
    <SettingPageLayout
      title="Communication Channels (SMTP)"
      description="Configure email server settings for sending invoices and alerts."
      hideActionBar={true} // CommunicationSettings handles its own state and saving
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <CommunicationSettings companyId={serverSettings.company_id} />
      </div>
    </SettingPageLayout>
  );
};

export default CommunicationChannels;
