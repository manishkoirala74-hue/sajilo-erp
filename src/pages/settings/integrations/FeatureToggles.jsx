import React from 'react';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

import { sajilo } from '@/api/sajiloClient';

function ToggleRow({ label, desc, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0 text-foreground">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <Switch checked={!!checked} onCheckedChange={onChange} />
    </div>
  );
}

const FeatureToggles = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      }
      setServerSettings({ ...draftSettings });
      toast.success("Feature toggles saved successfully");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save feature toggles");
    }
  };

  return (
    <SettingPageLayout
      title="Feature Toggles"
      description="Enable or disable specific modules and features across the system."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-2">
        <ToggleRow label="Godown / Multi-Location Management" desc="Track inventory across multiple warehouses" checked={draftSettings.enable_godown_management} onChange={v => updateDraftSettings({ enable_godown_management: v })} />
        <ToggleRow label="POS Module" desc="Point of Sale terminal" checked={draftSettings.enable_pos_module} onChange={v => updateDraftSettings({ enable_pos_module: v })} />
        <ToggleRow label="Purchase Orders" desc="Full PO workflow before invoicing" checked={draftSettings.enable_purchase_orders} onChange={v => updateDraftSettings({ enable_purchase_orders: v })} />
        <ToggleRow label="Landed Costs" desc="Add freight/customs to inventory WAC" checked={draftSettings.enable_landed_costs} onChange={v => updateDraftSettings({ enable_landed_costs: v })} />
        <ToggleRow label="Manufacturing Module" desc="Production orders and BOM" checked={draftSettings.enable_manufacturing_module} onChange={v => updateDraftSettings({ enable_manufacturing_module: v })} />
        <ToggleRow label="HR & Payroll Module" desc="Employees, leave, and payroll" checked={draftSettings.enable_hr_module} onChange={v => updateDraftSettings({ enable_hr_module: v })} />
        <ToggleRow label="Fixed Assets Module" desc="Asset register and depreciation" checked={draftSettings.enable_assets_module} onChange={v => updateDraftSettings({ enable_assets_module: v })} />
        <ToggleRow label="Services Module" desc="Service contracts and recurring billing" checked={draftSettings.enable_services_module} onChange={v => updateDraftSettings({ enable_services_module: v })} />
        <ToggleRow label="Bill-wise Entry" desc="Track partial and full payments against specific customer or supplier invoices during Receipt/Payment" checked={draftSettings.enable_bill_wise_entry !== false} onChange={v => updateDraftSettings({ enable_bill_wise_entry: v })} />
        <ToggleRow label="Trading History" desc="Allow display of transaction history while making purchase/sales transactions" checked={draftSettings.show_recent_trading_history} onChange={v => updateDraftSettings({ show_recent_trading_history: v })} />
      </div>
    </SettingPageLayout>
  );
};

export default FeatureToggles;
