import React from 'react';
import SettingPageLayout from '../components/SettingPageLayout';
import FiscalYearSettings from '@/components/settings/FiscalYearSettings';

const FiscalYear = () => {
  return (
    <SettingPageLayout
      title="Fiscal Calendar & Rollover"
      description="Configure the financial tracking period for all accounting reports."
      hideActionBar={true} // FiscalYearSettings has its own save and form logic
    >
      <FiscalYearSettings />
    </SettingPageLayout>
  );
};

export default FiscalYear;
