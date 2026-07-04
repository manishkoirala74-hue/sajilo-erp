import React from 'react';
import SettingPageLayout from '../components/SettingPageLayout';
import CompanyManagement from '@/components/settings/CompanyManagement';

const CompanyManagementPage = () => {
  return (
    <SettingPageLayout
      title="Company Profile"
      description="Manage all your registered companies, branch locations, and update primary details."
      hideActionBar={true} // CompanyManagement has its own internal save mechanism
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <CompanyManagement />
      </div>
    </SettingPageLayout>
  );
};

export default CompanyManagementPage;
