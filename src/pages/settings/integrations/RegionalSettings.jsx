import React from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const RegionalSettings = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      }
      setServerSettings({ ...draftSettings });
      toast.success("Regional Settings saved successfully");
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings');
    }
  };

  return (
    <SettingPageLayout
      title="Regional Settings"
      description="Configure locale, timezone, and calendar formats."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-foreground">Default Date Format</Label>
            <p className="text-xs text-muted-foreground mb-2">This sets the default calendar mode across the app</p>
            <Select 
              value={draftSettings.date_format || 'AD'} 
              onValueChange={v => updateDraftSettings({ date_format: v })}
            >
              <SelectTrigger className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AD">AD — English (Gregorian)</SelectItem>
                <SelectItem value="BS">BS — Nepali (Bikram Sambat)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </SettingPageLayout>
  );
};

export default RegionalSettings;
