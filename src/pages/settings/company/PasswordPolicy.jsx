import React from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const PasswordPolicy = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      }
      setServerSettings({ ...draftSettings });
      toast.success("Password Policy saved successfully");
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings');
    }
  };

  return (
    <SettingPageLayout
      title="Password Policy"
      description="Configure password requirements and expiration rules for users."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-medium mb-4">Password Requirements</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label className="text-foreground">Minimum Password Length</Label>
              <Input 
                type="number" min={6} max={32}
                value={draftSettings.password_min_length || 8} 
                onChange={e => updateDraftSettings({ password_min_length: Number(e.target.value) })} 
                className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
            
            <div className="flex flex-col justify-center space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Require Uppercase Letter</span>
                <Switch 
                  checked={!!draftSettings.password_require_uppercase} 
                  onCheckedChange={v => updateDraftSettings({ password_require_uppercase: v })} 
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Require Number</span>
                <Switch 
                  checked={!!draftSettings.password_require_number} 
                  onCheckedChange={v => updateDraftSettings({ password_require_number: v })} 
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Require Special Character</span>
                <Switch 
                  checked={!!draftSettings.password_require_special} 
                  onCheckedChange={v => updateDraftSettings({ password_require_special: v })} 
                />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-border">
          <h3 className="text-lg font-medium mb-4">Password Expiration</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label className="text-foreground">Password Expiry (Days)</Label>
              <p className="text-xs text-muted-foreground mb-2">Force users to change passwords regularly. Set to 0 to disable.</p>
              <Input 
                type="number" min={0} max={365}
                value={draftSettings.password_expiry_days || 0} 
                onChange={e => updateDraftSettings({ password_expiry_days: Number(e.target.value) })} 
                className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
          </div>
        </div>
      </div>
    </SettingPageLayout>
  );
};

export default PasswordPolicy;
