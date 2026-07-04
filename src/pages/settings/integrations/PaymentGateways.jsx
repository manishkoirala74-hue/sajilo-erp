import React, { useState } from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const GatewayCard = ({ title, prefix, description, settings, update }) => (
  <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mb-6">
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Sandbox Mode</span>
        <Switch 
          checked={!!settings[`${prefix}_sandbox`]} 
          onCheckedChange={v => update({ [`${prefix}_sandbox`]: v })}
        />
      </div>
    </div>
    
    <div className="grid grid-cols-2 gap-4 mt-6">
      <div className="col-span-2 md:col-span-1">
        <Label className="text-foreground">Merchant ID / Client ID</Label>
        <Input 
          type="text" 
          value={settings[`${prefix}_merchant_id`] || ''} 
          onChange={e => update({ [`${prefix}_merchant_id`]: e.target.value })} 
          className="mt-1 font-mono text-sm h-10" 
          placeholder={`Enter ${title} Merchant ID`}
        />
      </div>
      <div className="col-span-2 md:col-span-1">
        <Label className="text-foreground">Secret Key</Label>
        <Input 
          type="password" 
          value={settings[`${prefix}_secret_key`] || ''} 
          onChange={e => update({ [`${prefix}_secret_key`]: e.target.value })} 
          className="mt-1 font-mono text-sm h-10" 
          placeholder="••••••••••••••••"
        />
      </div>
      <div className="col-span-2">
        <Label className="text-foreground">Webhook URL</Label>
        <Input 
          type="url" 
          value={settings[`${prefix}_webhook_url`] || ''} 
          onChange={e => update({ [`${prefix}_webhook_url`]: e.target.value })} 
          className="mt-1 font-mono text-sm h-10 text-muted-foreground bg-muted/30" 
          placeholder={`https://api.yourdomain.com/webhooks/${prefix}`}
        />
        <p className="text-xs text-muted-foreground mt-1">Configure this endpoint in your {title} merchant portal to receive payment callbacks.</p>
      </div>
    </div>
  </div>
);

const PaymentGateways = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, draftSettings);
      }
      setServerSettings({ ...draftSettings });
      toast.success("Payment Gateway configurations saved successfully");
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings');
    }
  };

  return (
    <SettingPageLayout
      title="Payment Gateways"
      description="Securely configure API credentials and webhook endpoints for regional payment networks."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      <div className="space-y-6">
        <GatewayCard 
          title="eSewa" 
          prefix="esewa" 
          description="Enable payments via eSewa digital wallet."
          settings={draftSettings}
          update={updateDraftSettings}
        />
        
        <GatewayCard 
          title="Fonepay" 
          prefix="fonepay" 
          description="Enable interoperable QR payments."
          settings={draftSettings}
          update={updateDraftSettings}
        />
        
        <GatewayCard 
          title="Kumari Bank" 
          prefix="kumaribank" 
          description="Direct bank transfer and card processing via Kumari Bank API."
          settings={draftSettings}
          update={updateDraftSettings}
        />
      </div>
    </SettingPageLayout>
  );
};

export default PaymentGateways;
