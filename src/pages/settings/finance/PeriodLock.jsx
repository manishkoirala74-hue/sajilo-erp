import React, { useState } from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuth } from '@/lib/AuthContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Lock, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const PeriodLock = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft } = useSettingsStore();
  const { refreshGlobalSettings } = useAuth();
  const [confirming, setConfirming] = useState(false);

  const handleSave = async () => {
    try {
      if (draftSettings.id) {
        await sajilo.entities.CompanySettings.update(draftSettings.id, {
          period_lock_date: draftSettings.period_lock_date || null,
        });
      }
      setServerSettings({ ...draftSettings });
      await refreshGlobalSettings();
      toast.success('Period lock date saved successfully');
      setConfirming(false);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save period lock date');
    }
  };

  const currentLock = draftSettings.period_lock_date;

  return (
    <SettingPageLayout
      title="Period Lock / Book Closing"
      description="Prevent any user from posting, editing, or deleting GL transactions on or before this date."
      onSave={handleSave}
      onCancel={() => { resetDraft(); setConfirming(false); }}
    >
      {/* Critical Warning Banner */}
      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
        <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-800">Hard Database Lock</p>
          <p className="text-xs text-red-700 mt-1">
            Once set, NO user — including administrators — can post, edit, or delete any GL
            transaction dated on or before this date. This is enforced at the database level
            and is the legally compliant method for month-end and year-end closing.
          </p>
        </div>
      </div>

      {/* Current Lock Status */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-lg font-medium">Period Lock Date</h3>
        </div>

        {currentLock ? (
          <div className="flex items-center gap-2 mb-4 text-sm text-amber-700 bg-amber-50
                          border border-amber-200 rounded-lg px-3 py-2">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>
              Currently locked on or before: <strong>{currentLock}</strong>.
              All transactions up to this date are read-only.
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mb-4">
            No period lock is currently active. All dates are open for posting.
          </p>
        )}

        <div className="space-y-2">
          <Label className="text-foreground">Lock Date</Label>
          <p className="text-xs text-muted-foreground">
            Set this to the last day of the closed period (e.g. 2081-03-31 for Chaitra end).
            Leave empty to remove the lock.
          </p>
          <Input
            type="date"
            value={draftSettings.period_lock_date || ''}
            onChange={(e) => {
              updateDraftSettings({ period_lock_date: e.target.value || null });
              setConfirming(true);
            }}
            className="max-w-xs h-10 border border-border bg-background px-3 text-sm rounded-md
                       focus:ring-1 focus:ring-primary outline-none"
          />
        </div>

        {confirming && (
          <div className="mt-4 flex items-start gap-2 text-xs text-red-700 bg-red-50
                          border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              You are about to lock all periods on or before{' '}
              <strong>{draftSettings.period_lock_date}</strong>.
              Click <strong>Save Changes</strong> to confirm.
            </span>
          </div>
        )}
      </div>
    </SettingPageLayout>
  );
};

export default PeriodLock;
