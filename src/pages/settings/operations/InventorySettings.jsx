import React from 'react';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { toast } from 'sonner';
import { sajilo } from '@/api/sajiloClient';

const InventorySettings = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      }
      setServerSettings({ ...draftSettings });
      toast.success("Inventory settings saved successfully");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save inventory settings");
    }
  };

  const policy = draftSettings.negative_stock_policy || 'STRICT_BLOCK';

  return (
    <SettingPageLayout
      title="Inventory Policy"
      description="Manage negative stock and valuation handling across Godowns."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
        <div>
          <h3 className="text-sm font-medium text-foreground mb-1">Negative Stock Policy</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Determine how the system handles transactions (Sales Invoice, Stock Assembly) that drive a Godown's inventory below zero.
          </p>
          <div className="space-y-3">
            <label className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
              <input
                type="radio"
                className="mt-1"
                name="negative_stock_policy"
                value="STRICT_BLOCK"
                checked={policy === 'STRICT_BLOCK'}
                onChange={() => updateDraftSettings({ negative_stock_policy: 'STRICT_BLOCK' })}
              />
              <div>
                <p className="text-sm font-medium text-foreground">Strict Block (Recommended)</p>
                <p className="text-xs text-muted-foreground">Completely rejects any outbound transaction that drives stock below zero.</p>
              </div>
            </label>
            <label className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
              <input
                type="radio"
                className="mt-1"
                name="negative_stock_policy"
                value="WARN_AND_ALLOW"
                checked={policy === 'WARN_AND_ALLOW'}
                onChange={() => updateDraftSettings({ negative_stock_policy: 'WARN_AND_ALLOW' })}
              />
              <div>
                <p className="text-sm font-medium text-foreground">Warn & Allow</p>
                <p className="text-xs text-muted-foreground">Pauses the transaction and asks for explicit confirmation before allowing stock to drop below zero. Requires override permissions.</p>
              </div>
            </label>
          </div>
        </div>
      </div>
    </SettingPageLayout>
  );
};

export default InventorySettings;
