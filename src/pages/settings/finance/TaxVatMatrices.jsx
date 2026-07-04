import React from 'react';
import SettingPageLayout from '../components/SettingPageLayout';
import TaxSettings from '@/components/settings/TaxSettings';

const TaxVatMatrices = () => {
  return (
    <SettingPageLayout
      title="Tax & VAT Matrices"
      description="Configure tax rates, GST, VAT, and automatic tax calculation logic."
      hideActionBar={true} // TaxSettings manages its own state
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <TaxSettings />
      </div>
    </SettingPageLayout>
  );
};

export default TaxVatMatrices;
