import React from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuth } from '@/lib/AuthContext';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Package, AlertCircle } from 'lucide-react';

const BatchExpiry = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();
  const { refreshGlobalSettings } = useAuth();

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, {
          enable_batch_expiry: draftSettings.enable_batch_expiry,
          over_receive_tolerance_pct: draftSettings.over_receive_tolerance_pct,
        });
      }
      setServerSettings({ ...draftSettings });
      await refreshGlobalSettings();
      toast.success('Inventory constraints saved successfully');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings');
    }
  };

  return (
    <SettingPageLayout
      title="Inventory Constraints"
      description="Configure batch & expiry enforcement and over-receiving tolerance for purchase receipts."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      {/* Batch & Expiry Enforcement */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mb-4">
        <h3 className="text-lg font-medium mb-4">Batch & Expiry Enforcement</h3>

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Package className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">Enable Batch & Expiry Tracking</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When enabled, prevents the sale or transfer of items where the expiry date has
                passed. Expired items are automatically routed to a quarantine status during
                outbound stock operations.
              </p>
            </div>
          </div>
          <Switch
            checked={!!draftSettings.enable_batch_expiry}
            onCheckedChange={(v) => updateDraftSettings({ enable_batch_expiry: v })}
          />
        </div>

        {draftSettings.enable_batch_expiry && (
          <div className="mt-4 flex items-start gap-2 text-xs text-blue-700 bg-blue-50
                          border border-blue-200 rounded-lg px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Batch & expiry enforcement is active. All items marked with an expiry date
              will be blocked from outbound transactions once expired.
            </span>
          </div>
        )}
      </div>

      {/* Over-Receiving Tolerance */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-medium mb-1">Over-Receiving Tolerance</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Maximum percentage over-receipt allowed against a Purchase Order. Set to{' '}
          <strong>0%</strong> to enforce exact quantities. For example, <strong>5%</strong>{' '}
          allows up to 5% more items than ordered.
        </p>

        <div className="space-y-2">
          <Label className="text-foreground">
            Tolerance Percentage (0 – 100%)
          </Label>
          <div className="flex items-center gap-2 max-w-xs">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={draftSettings.over_receive_tolerance_pct ?? 0}
              onChange={(e) =>
                updateDraftSettings({
                  over_receive_tolerance_pct: parseFloat(e.target.value) || 0,
                })
              }
              className="h-10 border border-border bg-background px-3 text-sm rounded-md
                         focus:ring-1 focus:ring-primary outline-none"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {draftSettings.over_receive_tolerance_pct > 0
              ? `Warehouse staff may receive up to ${draftSettings.over_receive_tolerance_pct}% more than the PO quantity.`
              : 'Strict mode: warehouse staff must receive exact PO quantities.'}
          </p>
        </div>
      </div>
    </SettingPageLayout>
  );
};

export default BatchExpiry;
