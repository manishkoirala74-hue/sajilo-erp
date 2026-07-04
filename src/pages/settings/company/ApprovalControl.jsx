import React from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const ApprovalControl = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      }
      setServerSettings({ ...draftSettings });
      toast.success("Approval Controls saved successfully");
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings');
    }
  };

  return (
    <SettingPageLayout
      title="Approval Controls"
      description="Configure transaction approval workflows and limits."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-medium mb-4">Transaction Approvals</h3>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Enable Approval Workflow</p>
              <p className="text-xs text-muted-foreground mt-0.5">Require manager approval for transactions exceeding the limit.</p>
            </div>
            <Switch 
              checked={!!draftSettings.enable_approvals} 
              onCheckedChange={v => updateDraftSettings({ enable_approvals: v })} 
            />
          </div>
          
          {draftSettings.enable_approvals && (
            <div>
              <Label className="text-foreground">Approval Limit Amount ({draftSettings.currency || 'NPR'})</Label>
              <p className="text-xs text-muted-foreground mb-2">Transactions above this amount require approval</p>
              <Input 
                type="number" min={0} 
                value={draftSettings.approval_limit_amount || 50000} 
                onChange={e => updateDraftSettings({ approval_limit_amount: Number(e.target.value) })} 
                className="max-w-xs h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none" 
              />
            </div>
          )}
        </div>
      </div>
    </SettingPageLayout>
  );
};

export default ApprovalControl;
