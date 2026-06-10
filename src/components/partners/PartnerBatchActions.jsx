import { useState } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Trash2, Edit3, X, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const UNSET = '__unset__';

/**
 * props:
 *   selectedIds: string[]
 *   selectedPartners: object[]  — full partner objects for display
 *   partnerType: 'Customer' | 'Supplier'
 *   onClear: () => void          — clears selection after action
 *   onRefresh: () => void        — refreshes parent data
 */
export default function PartnerBatchActions({ selectedIds, selectedPartners, partnerType, onClear, onRefresh }) {
  const [showUpdate, setShowUpdate]   = useState(false);
  const [showDelete, setShowDelete]   = useState(false);
  const [processing, setProcessing]   = useState(false);
  const [blockedList, setBlockedList] = useState([]);

  // Update form fields
  const [isActive,     setIsActive]     = useState(UNSET); // 'true'|'false'|UNSET
  const [partnerTypef, setPartnerTypef] = useState(UNSET);
  const [creditLimit,  setCreditLimit]  = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [dualRole,     setDualRole]     = useState(UNSET); // 'true'|'false'|UNSET

  const dualRoleField  = partnerType === 'Customer' ? 'treated_as_vendor' : 'treat_as_customer';
  const dualRoleLabel  = partnerType === 'Customer' ? 'Treated as Vendor' : 'Treat as Customer';

  const resetUpdateForm = () => {
    setIsActive(UNSET); setPartnerTypef(UNSET);
    setCreditLimit(''); setPaymentTerms(''); setDualRole(UNSET);
  };

  const handleBulkUpdate = async () => {
    const updates = {};
    if (isActive !== UNSET)     updates.is_active     = isActive === 'true';
    if (partnerTypef !== UNSET) updates.partner_type  = partnerTypef;
    if (creditLimit !== '')     updates.credit_limit_amount = Number(creditLimit);
    if (paymentTerms !== '')    updates.default_payment_term_days = Number(paymentTerms);
    if (dualRole !== UNSET)     updates[dualRoleField] = dualRole === 'true';

    if (Object.keys(updates).length === 0) {
      toast.warning('Please change at least one field before applying.');
      return;
    }

    setProcessing(true);
    let updated = 0;
    try {
      const batchSize = 5;
      for (let i = 0; i < selectedIds.length; i += batchSize) {
        const batch = selectedIds.slice(i, i + batchSize);
        await Promise.all(batch.map(id => sajilo.entities.BusinessPartner.update(id, updates)));
        updated += batch.length;
      }
      toast.success(`${updated} ${partnerType}(s) updated successfully.`);
      setShowUpdate(false);
      resetUpdateForm();
      onClear();
      onRefresh();
    } catch (err) {
      toast.error('Bulk update failed: ' + err.message);
    }
    setProcessing(false);
  };

  const handleBulkDelete = async () => {
    setProcessing(true);
    setBlockedList([]);
    try {
      let deletedCount = 0;
      let failedCount = 0;
      const newBlockedList = [];

      const batchSize = 5;
      for (let i = 0; i < selectedPartners.length; i += batchSize) {
        const batch = selectedPartners.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (partner) => {
          let blockedReason = null;
          const checks = [];

          if (partner.receivable_account_id) {
            checks.push((async () => {
              const acc = await sajilo.entities.ChartOfAccount.filter({ id: partner.receivable_account_id }, 'account_code', 1);
              if (!acc || acc.length === 0) return null;
              if (acc[0].current_balance !== 0) return 'AR closing balance';
              return null;
            })());
          }

          if (partner.payable_account_id) {
            checks.push((async () => {
              const acc = await sajilo.entities.ChartOfAccount.filter({ id: partner.payable_account_id }, 'account_code', 1);
              if (!acc || acc.length === 0) return null;
              if (acc[0].current_balance !== 0) return 'AP closing balance';
              return null;
            })());
          }

          const results = await Promise.all(checks);
          blockedReason = results.find(r => r !== null);

          if (blockedReason) {
            newBlockedList.push({ name: partner.name, reason: blockedReason });
            failedCount++;
            return;
          }

          try {
            await sajilo.entities.BusinessPartner.delete(partner.id);
            if (partner.receivable_account_id) await sajilo.entities.ChartOfAccount.delete(partner.receivable_account_id).catch(() => {});
            if (partner.payable_account_id) await sajilo.entities.ChartOfAccount.delete(partner.payable_account_id).catch(() => {});
            deletedCount++;
          } catch(err) {
            failedCount++;
          }
        }));
      }

      if (newBlockedList.length > 0) {
        setBlockedList(newBlockedList);
      } else {
        setShowDelete(false);
      }

      if (deletedCount > 0) toast.success(`${deletedCount} ${partnerType}(s) permanently deleted.`);
      if (failedCount > 0 && newBlockedList.length === 0) toast.error(`${failedCount} deletion(s) failed.`);
      
      onClear();
      onRefresh();

    } catch (err) {
      toast.error(err.message || 'Bulk delete failed.');
    } finally {
      setProcessing(false);
    }
  };

  if (selectedIds.length === 0) return null;

  return (
    <>
      {/* ── Floating Batch Action Bar ── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-gray-700">
          <div className="flex items-center gap-2 pr-3 border-r border-gray-600">
            <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-xs font-bold">
              {selectedIds.length}
            </div>
            <span className="text-sm font-medium">
              {selectedIds.length === 1 ? `1 ${partnerType}` : `${selectedIds.length} ${partnerType}s`} selected
            </span>
          </div>

          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-gray-700 hover:text-white gap-1.5"
            onClick={() => { resetUpdateForm(); setShowUpdate(true); }}
          >
            <Edit3 className="w-3.5 h-3.5" /> Bulk Update
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="text-red-400 hover:bg-red-900/40 hover:text-red-300 gap-1.5"
            onClick={() => { setBlockedList([]); setShowDelete(true); }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>

          <button
            onClick={onClear}
            className="ml-1 text-gray-400 hover:text-white transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Bulk Update Modal ── */}
      <Dialog open={showUpdate} onOpenChange={v => { if (!processing) setShowUpdate(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-primary" />
              Bulk Update — {selectedIds.length} {partnerType}{selectedIds.length > 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Only fields you change below will be applied. Leave others at "— No Change —" to skip.
          </p>
          <div className="space-y-4 mt-2">
            {/* Status */}
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={isActive} onValueChange={setIsActive}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="— No Change —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>— No Change —</SelectItem>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Partner Type */}
            <div>
              <Label className="text-xs">Partner Type</Label>
              <Select value={partnerTypef} onValueChange={setPartnerTypef}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="— No Change —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>— No Change —</SelectItem>
                  <SelectItem value="Company">Company</SelectItem>
                  <SelectItem value="Individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Credit Limit */}
            <div>
              <Label className="text-xs">Credit Limit (NPR) — leave blank to skip</Label>
              <Input
                type="number" min="0" value={creditLimit}
                onChange={e => setCreditLimit(e.target.value)}
                placeholder="e.g. 100000" className="mt-1"
              />
            </div>

            {/* Payment Terms */}
            <div>
              <Label className="text-xs">Payment Terms (days) — leave blank to skip</Label>
              <Input
                type="number" min="0" value={paymentTerms}
                onChange={e => setPaymentTerms(e.target.value)}
                placeholder="e.g. 30" className="mt-1"
              />
            </div>

            {/* Dual Role */}
            <div>
              <Label className="text-xs">{dualRoleLabel}</Label>
              <Select value={dualRole} onValueChange={setDualRole}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="— No Change —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>— No Change —</SelectItem>
                  <SelectItem value="true">Enable</SelectItem>
                  <SelectItem value="false">Disable</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowUpdate(false)} disabled={processing}>Cancel</Button>
            <Button onClick={handleBulkUpdate} disabled={processing} className="gap-1.5">
              {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {processing ? 'Applying…' : `Apply to ${selectedIds.length} record${selectedIds.length > 1 ? 's' : ''}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Delete Confirmation Modal ── */}
      <Dialog open={showDelete} onOpenChange={v => { if (!processing) setShowDelete(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-4 h-4" />
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>

          {blockedList.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 font-medium">Deletion Blocked — Transaction Records Found</p>
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {blockedList.map((b, i) => (
                  <div key={i} className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
                    <span className="font-semibold">"{b.name}"</span> has active {b.reason} in the system.
                    Consider marking them <span className="font-semibold">Inactive</span> instead.
                  </div>
                ))}
              </div>
              <Button className="w-full" variant="outline" onClick={() => setShowDelete(false)}>Close</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">This action is permanent and cannot be undone.</p>
                  <p className="text-xs text-amber-700 mt-1">
                    A referential integrity check will run first. Partners with existing transactions will be blocked.
                  </p>
                </div>
              </div>
              <div className="bg-muted rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
                {selectedPartners.map(p => (
                  <div key={p.id} className="flex items-center gap-2 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                    <span className="font-medium">{p.name}</span>
                    {p.tax_id_number && <span className="text-xs text-muted-foreground">({p.tax_id_number})</span>}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowDelete(false)} disabled={processing}>Cancel</Button>
                <Button
                  variant="destructive"
                  onClick={handleBulkDelete}
                  disabled={processing}
                  className="gap-1.5"
                >
                  {processing
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking & Deleting…</>
                    : <><Trash2 className="w-3.5 h-3.5" /> Delete {selectedIds.length} {partnerType}{selectedIds.length > 1 ? 's' : ''}</>
                  }
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}