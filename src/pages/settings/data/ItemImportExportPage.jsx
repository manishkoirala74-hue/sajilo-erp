import React from 'react';
import SettingPageLayout from '../components/SettingPageLayout';
import ItemImportExport from '@/components/settings/ItemImportExport';

const ItemImportExportPage = () => {
  return (
    <SettingPageLayout
      title="Data Import & Export"
      description="Bulk import data from CSV or export your system data."
      hideActionBar={true}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <ItemImportExport />
      </div>
    </SettingPageLayout>
  );
};

export default ItemImportExportPage;
