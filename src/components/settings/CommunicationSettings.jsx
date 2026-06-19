import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/api/sajiloClient';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Mail, AlertCircle } from 'lucide-react';

export default function CommunicationSettings({ companyId }) {
  const { user } = useAuth();
  const [config, setConfig] = useState({
    email_smtp_host: '',
    email_smtp_port: 587,
    email_smtp_user: '',
    email_smtp_password: '',
    email_from_name: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [existingId, setExistingId] = useState(null);

  useEffect(() => {
    if (!companyId) return;
    async function fetchConfig() {
      try {
        const { data, error } = await supabase
          .from('CompanyCommunicationSetting')
          .select('*')
          .eq('company_id', companyId)
          .single();
        
        if (error && error.code !== 'PGRST116') {
          throw error;
        }
        
        if (data) {
          setConfig(data);
          setExistingId(data.id);
        }
      } catch (err) {
        console.error("Failed to fetch communication config", err);
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, [companyId]);

  const set = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const workerUrl = import.meta.env.VITE_COMMUNICATION_WORKER_URL || 'http://localhost:3001';
      const response = await fetch(`${workerUrl}/api/communication/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'RESEND', config })
      });
      const result = await response.json();
      
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(`Connection Failed: ${result.error}`);
      }
    } catch (e) {
      toast.error(`Test request failed: Ensure communication_worker.js is running.`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...config, company_id: companyId };
      delete payload.id;
      delete payload.created_at;
      delete payload.updated_at;

      if (existingId) {
        const { error } = await supabase
          .from('CompanyCommunicationSetting')
          .update(payload)
          .eq('id', existingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('CompanyCommunicationSetting')
          .insert([payload])
          .select()
          .single();
        if (error) throw error;
        setExistingId(data.id);
      }
      toast.success('Communication settings saved successfully');
    } catch (e) {
      toast.error(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/50">
        <AlertCircle className="w-12 h-12 text-red-500 mb-3" />
        <h3 className="text-lg font-semibold text-red-800 dark:text-red-400">Access Denied</h3>
        <p className="text-sm text-red-600 dark:text-red-300 max-w-md mt-2">
          You do not have the required 'System_Admin' privileges to view or modify communication integration settings.
        </p>
      </div>
    );
  }

  if (loading) return <div className="p-4 text-sm text-muted-foreground">Loading settings...</div>;

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
          <Mail className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground text-sm">Resend API Integration</h3>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-900/50 rounded-xl p-4 mb-4">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300">Using Resend Email API</h4>
                  <p className="mt-1 text-sm text-blue-800 dark:text-blue-400">
                    Sajilo ERP uses Resend.com to bypass standard SMTP port blocks on cloud hosts. Create a free account at Resend.com, generate an API Key, and verify your sending domain.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="col-span-2"><Label>Resend API Key</Label><Input type="password" value={config.email_smtp_password || ''} onChange={e => set('email_smtp_password', e.target.value)} className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1" placeholder="re_..." /></div>
          <div><Label>Sender Email Address</Label><Input value={config.email_smtp_user || ''} onChange={e => set('email_smtp_user', e.target.value)} className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1" placeholder="onboarding@resend.dev" /></div>
          <div><Label>Sender Name</Label><Input value={config.email_from_name || ''} onChange={e => set('email_from_name', e.target.value)} className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1" placeholder="Sajilo Trading" /></div>
          
          <div className="col-span-2 pt-2 flex justify-end">
             <Button variant="outline" size="sm" onClick={handleTestConnection} disabled={testing}>
               Test Resend Connection
             </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Communication Config'}
        </Button>
      </div>
    </div>
  );
}
