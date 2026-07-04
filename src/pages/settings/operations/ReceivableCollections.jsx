import React from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

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

const ReceivableCollections = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      }
      setServerSettings({ ...draftSettings });
      toast.success("Receivable Collections settings saved successfully");
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings');
    }
  };

  return (
    <SettingPageLayout
      title="Receivable Collections (Reminders)"
      description="Configure automated reminders and bill-wise entry tracking."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-foreground">Overdue Reminder (days after due)</Label>
            <p className="text-xs text-muted-foreground mb-1">Send reminder email N days after invoice due date</p>
            <Input 
              type="number" min={1} 
              value={draftSettings.overdue_reminder_days || 7} 
              onChange={e => updateDraftSettings({ overdue_reminder_days: Number(e.target.value) })} 
              className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono text-right" 
            />
          </div>
          <div>
            <Label className="text-foreground">Self Reminder (days before due)</Label>
            <p className="text-xs text-muted-foreground mb-1">Internal alert N days before invoice becomes due</p>
            <Input 
              type="number" min={1} 
              value={draftSettings.self_reminder_days_before_due || 3} 
              onChange={e => updateDraftSettings({ self_reminder_days_before_due: Number(e.target.value) })} 
              className="mt-1 h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none font-mono text-right" 
            />
          </div>
        </div>
        <div className="mt-3 space-y-3">
          <ToggleRow 
            label="Auto-send Reminder on Due Date" 
            desc="Automatically email the customer on the invoice due date" 
            checked={draftSettings.send_invoice_reminder_on_due} 
            onChange={v => updateDraftSettings({ send_invoice_reminder_on_due: v })} 
          />
        </div>
      </div>
    </SettingPageLayout>
  );
};

export default ReceivableCollections;
