import React from 'react';
import SettingPageLayout from '../components/SettingPageLayout';
import DataUtilities from '@/components/settings/DataUtilities';

const DataUtilitiesPage = () => {
  return (
    <SettingPageLayout
      title="Data Utilities"
      description="Perform system maintenance, backups, and data cleanup tasks."
      hideActionBar={true}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <DataUtilities />
      </div>
    </SettingPageLayout>
  );
};

export default DataUtilitiesPage;
