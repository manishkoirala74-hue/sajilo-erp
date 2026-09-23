import React, { useState } from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuth } from '@/lib/AuthContext';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Shield, Clock, FileText, Globe, Plus, Trash2, AlertTriangle } from 'lucide-react';

const SecurityPolicy = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();
  const { refreshGlobalSettings } = useAuth();
  const [newIp, setNewIp] = useState('');

  const ipWhitelist = Array.isArray(draftSettings.ip_whitelist)
    ? draftSettings.ip_whitelist
    : [];

  const addIp = () => {
    const trimmed = newIp.trim();
    if (!trimmed) return;
    if (ipWhitelist.includes(trimmed)) {
      toast.info('IP address already in the list');
      return;
    }
    updateDraftSettings({ ip_whitelist: [...ipWhitelist, trimmed] });
    setNewIp('');
  };

  const removeIp = (ip) => {
    updateDraftSettings({ ip_whitelist: ipWhitelist.filter((i) => i !== ip) });
  };

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, {
          session_idle_timeout_minutes: draftSettings.session_idle_timeout_minutes,
          enable_strict_audit_logging: draftSettings.enable_strict_audit_logging,
          ip_whitelist: draftSettings.ip_whitelist,
        });
      }
      setServerSettings({ ...draftSettings });
      await refreshGlobalSettings();
      toast.success('Security policy saved successfully');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save settings');
    }
  };

  return (
    <SettingPageLayout
      title="Security Policy"
      description="Configure session timeouts, audit logging, and IP access restrictions for this company."
      onSave={handleSave}
      onCancel={resetDraft}
    >
      {/* Session Idle Timeout */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-lg font-medium">Session Idle Timeout</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Forces re-authentication if the user makes no activity within the window.
          Set to <strong>0</strong> to disable idle timeout entirely.
        </p>
        <div className="space-y-2">
          <Label className="text-foreground">Timeout (minutes)</Label>
          <div className="flex items-center gap-2 max-w-xs">
            <Input
              type="number"
              min={0}
              step={1}
              value={draftSettings.session_idle_timeout_minutes ?? 0}
              onChange={(e) =>
                updateDraftSettings({
                  session_idle_timeout_minutes: parseInt(e.target.value) || 0,
                })
              }
              className="h-10 border border-border bg-background px-3 text-sm rounded-md
                         focus:ring-1 focus:ring-primary outline-none"
            />
            <span className="text-sm text-muted-foreground">min</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {(draftSettings.session_idle_timeout_minutes ?? 0) > 0
              ? `Users will be automatically logged out after ${draftSettings.session_idle_timeout_minutes} minutes of inactivity.`
              : 'Idle timeout is disabled. Sessions remain active indefinitely.'}
          </p>
        </div>
      </div>

      {/* Strict Audit Logging */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">Strict Audit Logging</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upgrades the standard audit trail to also capture READ access events on
                sensitive modules (Payroll, Chart of Accounts). May increase storage usage.
              </p>
            </div>
          </div>
          <Switch
            checked={!!draftSettings.enable_strict_audit_logging}
            onCheckedChange={(v) => updateDraftSettings({ enable_strict_audit_logging: v })}
          />
        </div>
      </div>

      {/* IP Whitelist */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-lg font-medium">IP Whitelisting</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Restrict company access to specific IP ranges. Values are stored here and cached
          at your network gateway (e.g., Cloudflare, Nginx) for enforcement.
        </p>

        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50
                        border border-amber-200 rounded-lg px-3 py-2 mb-4">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>Enforcement is at the network edge layer</strong> (e.g., Cloudflare, Vercel
            Edge, or Nginx reverse proxy), not at the database level. Configure your gateway
            to read and enforce this list.
          </span>
        </div>

        {/* Add IP */}
        <div className="flex items-center gap-2 mb-4">
          <Input
            type="text"
            placeholder="e.g. 192.168.1.0/24 or 203.0.113.5"
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addIp()}
            className="h-9 border border-border bg-background px-3 text-sm rounded-md
                       focus:ring-1 focus:ring-primary outline-none flex-1"
          />
          <Button size="sm" onClick={addIp} className="flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>

        {/* IP List */}
        {ipWhitelist.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No IP restrictions configured. All IP addresses are allowed.
          </p>
        ) : (
          <div className="space-y-2">
            {ipWhitelist.map((ip) => (
              <div
                key={ip}
                className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-sm font-mono">{ip}</span>
                </div>
                <button
                  onClick={() => removeIp(ip)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-1">
              {ipWhitelist.length} IP range{ipWhitelist.length !== 1 ? 's' : ''} configured.
            </p>
          </div>
        )}
      </div>
    </SettingPageLayout>
  );
};

export default SecurityPolicy;
