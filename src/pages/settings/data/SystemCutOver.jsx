import React, { useState } from 'react';
import { sajilo } from '@/api/sajiloClient';
import SettingPageLayout from '../components/SettingPageLayout';
import { useSettingsStore } from '@/store/settingsStore';
import OpeningBalances from '@/components/settings/OpeningBalances.jsx';
import DateInput from '@/components/shared/DateInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';

const SystemCutOver = () => {
  const { draftSettings, updateDraftSettings, setServerSettings, resetDraft, hasUnsavedChanges } = useSettingsStore();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleSaveRequest = () => {
    setShowConfirmModal(true);
  };

  const handleConfirmSave = () => {
    if (confirmText !== 'CONFIRM') {
      toast.error('Please type CONFIRM to proceed');
      return;
    }
    
    setServerSettings({ ...draftSettings });
    toast.success("System Cut-Over settings saved successfully");
    setShowConfirmModal(false);
    setConfirmText('');
  };

  return (
    <>
      <SettingPageLayout
        title="System Cut-Over (Opening Balances)"
        description="Set the cut-over date and manage opening balances for inventory and ledgers."
        onSave={handleSaveRequest}
        onCancel={resetDraft}
      >
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm mb-6">
          <div className="space-y-3 mb-6">
            <h3 className="text-lg font-medium text-foreground">Cut-Over Configuration</h3>
            <p className="text-sm text-muted-foreground">
              Set the cut-over date for opening balances. Inventory and ledger balances entered before this date are treated as opening entries.
            </p>
            <div className="max-w-xs pt-2">
              <DateInput 
                label="Opening Balance Date" 
                value={draftSettings.opening_balance_date || ''} 
                onChange={v => updateDraftSettings({ opening_balance_date: v })} 
              />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
          <OpeningBalances />
        </div>
      </SettingPageLayout>

      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              High-Risk Operation
            </DialogTitle>
            <DialogDescription>
              Modifying system cut-over dates or opening balances is an irreversible financial operation that affects ledger integrity. 
              <br/><br/>
              Please type <strong>CONFIRM</strong> below to proceed with these changes.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2">
            <div className="grid flex-1 gap-2">
              <Input
                placeholder="Type CONFIRM"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter className="sm:justify-end">
            <Button type="button" variant="outline" onClick={() => { setShowConfirmModal(false); setConfirmText(''); }}>
              Cancel
            </Button>
            <Button 
              type="button" 
              variant="destructive" 
              disabled={confirmText !== 'CONFIRM'} 
              onClick={handleConfirmSave}
            >
              Apply Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SystemCutOver;
