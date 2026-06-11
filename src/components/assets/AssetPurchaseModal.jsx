/**
 * AssetPurchaseModal — records an additional purchase against an existing asset.
 * Posts a Journal Voucher: DR Asset Ledger / CR Payment Account
 */
import { useState, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/shared/SearchableSelect';
import { BookOpen } from 'lucide-react';
import { postAssetPurchase } from '@/lib/glPostingService';

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

export default function AssetPurchaseModal({ open, onClose, assets, accounts, bankAccounts, vendors, settings, onSaved }) {
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [purchaseValue, setPurchaseValue] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethodType, setPaymentMethodType] = useState('cash_bank');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [paymentAccountName, setPaymentAccountName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Group assets by their ledger name
  const groupedAssets = useMemo(() => {
    const groups = {};
    assets.forEach(a => {
      if (a.status === 'Deleted') return;
      const grp = a.asset_ledger_name || 'No Ledger Mapped';
      if (!groups[grp]) groups[grp] = [];
      groups[grp].push(a);
    });
    return groups;
  }, [assets]);

  const assetOptions = useMemo(() =>
    assets
      .filter(a => a.status !== 'Deleted')
      .map(a => ({
        value: a.id,
        label: `${a.asset_code} — ${a.asset_name}${a.asset_ledger_name ? ` (${a.asset_ledger_name})` : ''}`,
      })),
    [assets]
  );

  const selectedAsset = assets.find(a => a.id === selectedAssetId);

  const handlePaymentMethodChange = (v) => {
    setPaymentMethodType(v);
    setPaymentAccountId('');
    setPaymentAccountName('');
  };

  const handleSave = async () => {
    if (!selectedAssetId) { toast.error('Please select an asset'); return; }
    const val = parseFloat(purchaseValue) || 0;
    if (val <= 0) { toast.error('Purchase value must be greater than 0'); return; }
    if (!selectedAsset?.asset_ledger_id) { toast.error('Selected asset has no Assets Ledger mapped. Please edit the asset first.'); return; }

    setSaving(true);

    try {
  // Build a virtual asset record for the GL posting with the new purchase value
      const virtualAsset = {
        ...selectedAsset,
        gross_purchase_value: val,
        purchase_date: purchaseDate,
        payment_account_id: paymentAccountId || null,
        payment_account_name: paymentAccountName || null,
      };

      const creditAcc = paymentAccountId ? { id: paymentAccountId, name: paymentAccountName } : null;
      const journalId = await postAssetPurchase(virtualAsset, settings, false, null, creditAcc);

      if (journalId) {
        // Also update the asset's gross_purchase_value
        const newGross = (selectedAsset.gross_purchase_value || 0) + val;
        const newNBV = Math.max(newGross - (selectedAsset.accumulated_depreciation || 0), selectedAsset.salvage_value || 0);
        await sajilo.entities.FixedAsset.update(selectedAsset.id, {
          gross_purchase_value: newGross,
          net_book_value: newNBV,
          gl_posted: true,
        });

        // Create a Financial Voucher record for visibility under Financial Vouchers
        const voucherNumber = `APV-${Date.now().toString().slice(-6)}`;
        await sajilo.entities.FinancialVoucher.create({
          voucher_number: voucherNumber,
          voucher_type: 'Journal',
          voucher_date: purchaseDate,
          total_amount: val,
          payment_mode: paymentMethodType === 'cash_bank' ? 'Cash' : 'Bank Transfer',
          reference_no: selectedAsset.asset_code,
          status: 'Posted',
          narration: notes || `Asset Purchase — ${selectedAsset.asset_name}`,
          entries: [
            {
              account_name: selectedAsset.asset_ledger_name,
              account_type: 'Asset',
              debit: val,
              credit: 0,
              narration: `DR Asset: ${selectedAsset.asset_name}`,
            },
            {
              account_name: paymentAccountName || 'Payment Account',
              account_type: paymentMethodType === 'party_ledger' ? 'Liability' : 'Asset',
              debit: 0,
              credit: val,
              narration: `CR Payment: ${paymentAccountName || 'N/A'}`,
            },
          ],
        });

        toast.success(`Asset purchase posted to GL & Financial Vouchers (${voucherNumber})`);
        onSaved();
        handleClose();
      } else {
        toast.error('GL posting failed — check Settings → GL Accounts');
      }
        } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedAssetId('');
    setPurchaseValue('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setPaymentMethodType('cash_bank');
    setPaymentAccountId('');
    setPaymentAccountName('');
    setNotes('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Purchase an Asset
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Records a purchase journal: DR Asset Ledger / CR Payment Account</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Asset Selection */}
          <div>
            <Label>Select Asset *</Label>
            <SearchableSelect
              options={assetOptions}
              value={selectedAssetId}
              onValueChange={setSelectedAssetId}
              placeholder="Search assets…"
            />
            {selectedAsset && (
              <div className="mt-2 bg-muted/30 rounded-lg px-3 py-2 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assets Ledger</span>
                  <span className="font-medium">{selectedAsset.asset_ledger_name || <em className="text-amber-500">Not mapped</em>}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Gross Value</span>
                  <span className="font-medium">{fmt(selectedAsset.gross_purchase_value)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Net Book Value</span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">{fmt(selectedAsset.net_book_value)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Purchase Value & Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Purchase Value (NPR) *</Label>
              <Input
                type="number"
                placeholder="0"
                value={purchaseValue}
                onChange={e => setPurchaseValue(e.target.value)}
              />
            </div>
            <div>
              <Label>Purchase Date</Label>
              <Input
                type="date"
                value={purchaseDate}
                onChange={e => setPurchaseDate(e.target.value)}
              />
            </div>
          </div>

          {/* Payment Section */}
          <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/10">
            <p className="text-sm font-semibold">Post Payment for this Asset?</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Payment Method</Label>
                <Select value={paymentMethodType} onValueChange={handlePaymentMethodChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash_bank">Cash / Bank Account</SelectItem>
                    <SelectItem value="party_ledger">Post to Party Ledger (Supplier)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{paymentMethodType === 'party_ledger' ? 'Supplier Ledger' : 'Cash / Bank Account'}</Label>
                {paymentMethodType === 'cash_bank' ? (
                  <Select value={paymentAccountId} onValueChange={v => {
                    const acc = bankAccounts.find(b => b.gl_account_id === v);
                    setPaymentAccountId(v);
                    setPaymentAccountName(acc?.account_name || '');
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select cash/bank…" /></SelectTrigger>
                    <SelectContent>
                      {bankAccounts.filter(b => b.gl_account_id).map(b => (
                        <SelectItem key={b.id} value={b.gl_account_id}>
                          {b.account_name} ({b.account_type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={paymentAccountId} onValueChange={v => {
                    const vendor = vendors.find(vn => vn.payable_account_id === v);
                    setPaymentAccountId(v);
                    setPaymentAccountName(vendor?.payable_account_name || vendor?.name || '');
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                    <SelectContent>
                      {vendors.filter(vn => vn.payable_account_id).map(vn => (
                        <SelectItem key={vn.id} value={vn.payable_account_id}>
                          {vn.name} — {vn.payable_account_name || 'AP Ledger'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>Notes</Label>
            <Input placeholder="Optional narration…" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          {/* Preview */}
          {selectedAsset?.asset_ledger_id && parseFloat(purchaseValue) > 0 && (
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg px-3 py-2 text-xs space-y-1">
              <p className="font-semibold text-blue-800 dark:text-blue-300 mb-1.5">Journal Preview</p>
              <div className="flex justify-between">
                <span className="text-blue-700 dark:text-blue-400">DR {selectedAsset.asset_ledger_name}</span>
                <span className="font-mono font-semibold text-blue-800 dark:text-blue-300">{fmt(parseFloat(purchaseValue) || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700 dark:text-blue-400">CR {paymentAccountName || '(select payment account)'}</span>
                <span className="font-mono font-semibold text-blue-800 dark:text-blue-300">{fmt(parseFloat(purchaseValue) || 0)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-2">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            <BookOpen className="w-4 h-4 mr-1.5" />
            {saving ? 'Posting…' : 'Post Purchase to GL'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}