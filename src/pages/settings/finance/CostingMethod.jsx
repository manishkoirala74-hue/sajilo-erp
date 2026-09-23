import React, { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuth } from '@/lib/AuthContext';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Lock, Globe } from 'lucide-react';
import { toast } from 'sonner';

const CostingMethod = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();
  const { refreshGlobalSettings } = useAuth();
  const [hasInventory, setHasInventory] = useState(false);
  const [checkingInventory, setCheckingInventory] = useState(true);

  // Check if any inventory has been posted — locks the costing method UI
  useEffect(() => {
    sajilo.auth.supabase
      .from('InventoryHistory')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', sajilo.getCompanyId())
      .limit(1)
      .then(({ count }) => {
        setHasInventory((count ?? 0) > 0);
        setCheckingInventory(false);
      })
      .catch(() => setCheckingInventory(false));
  }, []);

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, {
          default_costing_method: draftSettings.default_costing_method,
          enable_multi_currency: draftSettings.enable_multi_currency,
          tax_default_behavior: draftSettings.tax_default_behavior,
        });
      }
      setServerSettings({ ...draftSettings });
      await refreshGlobalSettings();
      toast.success('Accounting controls saved successfully');
    } catch (e) {
      console.error(e);
      if (e?.message?.includes('COSTING_METHOD_LOCKED')) {
        toast.error('Costing method is locked after inventory transactions have been posted.');
      } else {
        toast.error('Failed to save settings');
      }
    }
  };

  return (
    <SettingPageLayout
      title="Accounting Controls"
      description="Configure costing method, multi-currency, and tax defaults for this company."
      onSave={handleSave}
      onCancel={resetDraft}
      isLoading={checkingInventory}
    >
      {/* Costing Method */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mb-4">
        <h3 className="text-lg font-medium mb-1">Inventory Costing Method</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Dictates how COGS is calculated. Seeds the costing method for all new items.
          <strong className="text-foreground"> Cannot be changed once inventory transactions are posted.</strong>
        </p>

        {hasInventory && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50
                          border border-amber-200 rounded-lg px-3 py-2 mb-4">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>
              Inventory transactions have been posted. The costing method is permanently locked
              and cannot be changed.
            </span>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-foreground">Default Costing Method</Label>
          <Select
            value={draftSettings.default_costing_method || 'WAC'}
            onValueChange={(v) => updateDraftSettings({ default_costing_method: v })}
            disabled={hasInventory}
          >
            <SelectTrigger className="max-w-xs h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="WAC">Weighted Average Cost (WAC)</SelectItem>
              <SelectItem value="FIFO">First In, First Out (FIFO)</SelectItem>
              <SelectItem value="LIFO">Last In, First Out (LIFO)</SelectItem>
            </SelectContent>
          </Select>
          {hasInventory && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Locked — inventory movements detected.
            </p>
          )}
        </div>
      </div>

      {/* Multi-Currency */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mb-4">
        <h3 className="text-lg font-medium mb-4">Multi-Currency Engine</h3>
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <Globe className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">Enable Multi-Currency</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enables exchange rate fields on transaction headers. When disabled, all
                transactions strictly enforce the base company currency ({draftSettings.currency || 'NPR'}).
              </p>
            </div>
          </div>
          <Switch
            checked={!!draftSettings.enable_multi_currency}
            onCheckedChange={(v) => updateDraftSettings({ enable_multi_currency: v })}
          />
        </div>
      </div>

      {/* Tax Default Behavior */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-medium mb-1">Tax / VAT Default Behavior</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Determines whether item prices entered on line-item grids inherently include tax,
          or if tax is calculated on top.
        </p>
        <div className="space-y-2">
          <Label className="text-foreground">Default Tax Mode</Label>
          <Select
            value={draftSettings.tax_default_behavior || 'Exclusive'}
            onValueChange={(v) => updateDraftSettings({ tax_default_behavior: v })}
          >
            <SelectTrigger className="max-w-xs h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Exclusive">Exclusive — tax added on top of price</SelectItem>
              <SelectItem value="Inclusive">Inclusive — price already contains tax</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </SettingPageLayout>
  );
};

export default CostingMethod;
