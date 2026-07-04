import React from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const StorageLimits = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      }
      setServerSettings({ ...draftSettings });
      toast.success("Storage limits saved successfully");
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings');
    }
  };

  return (
    <SettingPageLayout
      title="Storage & Media Limits"
      description="Configure limitations for file uploads and asset sizing."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <Label className="text-foreground">Max Image Size (MB per image)</Label>
            <p className="text-xs text-muted-foreground mb-2">Limit upload sizes for item images</p>
            <Input 
              type="number" min={0.5} max={20} step={0.5} 
              value={draftSettings.item_image_max_size_mb || 2} 
              onChange={e => updateDraftSettings({ item_image_max_size_mb: Number(e.target.value) })} 
              className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono text-right" 
            />
          </div>
          <div>
            <Label className="text-foreground">Max Number of Images per Item</Label>
            <p className="text-xs text-muted-foreground mb-2">Restrict gallery size per product</p>
            <Input 
              type="number" min={1} max={10} 
              value={draftSettings.item_image_max_count || 3} 
              onChange={e => updateDraftSettings({ item_image_max_count: Number(e.target.value) })} 
              className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono text-right" 
            />
          </div>
        </div>
      </div>
    </SettingPageLayout>
  );
};

export default StorageLimits;
