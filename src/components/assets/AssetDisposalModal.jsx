/**
 * IAS 16 Asset Disposal Modal
 * Collects: disposal date, proceeds, payment method, optional manual GL override.
 * Calls postAssetDisposal() from glPostingService and updates the asset record.
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
import { AlertTriangle, TrendingUp, TrendingDown, BookOpen } from 'lucide-react';
import { postAssetDisposal } from '@/lib/glPostingService';
import { cn } from '@/lib/utils';

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;
const r2  = n => Math.round((n || 0) * 100) / 100;

export default function AssetDisposalModal({ asset, accounts = [], settings, open, onClose, onPosted }) {
  const [proceeds, setProceeds] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [disposalDate, setDisposalDate] = useState(new Date().toISOString().split('T')[0]);
  const [newStatus, setNewStatus] = useState('Disposed');
  const [manualLedgerId, setManualLedgerId] = useState('');
  const [posting, setPosting] = useState(false);

  // Sub-ledger accounts for the manual override picker
  const glOptions = useMemo(() =>
    accounts
      .filter(a => a.ledger_type === 'Sub Ledger' && a.is_active !== false)
      .map(a => ({ value: a.id, label: `${a.account_code} — ${a.account_name}` })),
    [accounts]
  );

  // Cash/Bank ledger options for proceeds
  const cashBankOptions = useMemo(() =>
    accounts.filter(a =>
      a.ledger_type === 'Sub Ledger' &&
      a.is_active !== false &&
      (
        a.account_type === 'Asset' &&
        (
          (a.account_name || '').toLowerCase().includes('cash') ||
          (a.account_name || '').toLowerCase().includes('bank') ||
          (a.account_subtype || '').toLowerCase().includes('cash') ||
          (a.account_subtype || '').toLowerCase().includes('bank')
        )
      )
    ).map(a => ({ value: a.id, label: `${a.account_code} — ${a.account_name}` })),
    [accounts]
  );

  // Resolved payment ledger name for journal preview
  const resolvedPaymentLedgerName = useMemo(() => {
    if (paymentMethod === 'Cash') return settings?.gl_cash_account_name || 'Cash in Hand';
    return settings?.gl_bank_account_name || 'Bank';
  }, [paymentMethod, settings]);

  if (!asset) return null;

  const gross       = r2(asset.gross_purchase_value    || 0);
  const accumDep    = r2(asset.accumulated_depreciation || 0);
  const nbv         = r2(gross - accumDep);
  const proc        = r2(parseFloat(proceeds) || 0);
  const gainOrLoss  = r2(proc - nbv);
  const isGain      = gainOrLoss > 0;
  const isLoss      = gainOrLoss < 0;
  const isBreakEven = Math.abs(gainOrLoss) < 0.01;

  const handlePost = async () => {
    if (!asset.asset_ledger_id || !asset.accumulated_dep_ledger_id) {
      toast.error('Asset must have Cost Ledger & Accumulated Dep. Ledger mapped before disposal posting.');
      return;
    }
    setPosting(true);

    const journalId = await postAssetDisposal({
      asset,
      settings,
      proceeds: proc,
      proceedsPaymentMethod: paymentMethod,
      disposalDate,
      manual_disposal_ledger_id: manualLedgerId || null,
    });

    if (journalId) {
      await sajilo.entities.FixedAsset.update(asset.id, { status: newStatus });
      toast.success(`Disposal posted to GL — asset marked as "${newStatus}"`);
      onPosted?.();
      onClose();
    }
    setPosting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-lg max-h-[95vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="mb-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="truncate">Dispose Asset — {asset.asset_name}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Asset summary strip */}
        <div className="grid grid-cols-3 gap-2 bg-muted/40 rounded-lg p-3 text-xs mb-2">
          <div>
            <p className="text-muted-foreground">Gross Value</p>
            <p className="font-mono font-semibold truncate">{fmt(gross)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Accum. Dep.</p>
            <p className="font-mono font-semibold text-amber-600 dark:text-amber-400 truncate">{fmt(accumDep)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Net Book Value</p>
            <p className="font-mono font-semibold text-blue-700 dark:text-blue-400 truncate">{fmt(nbv)}</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Row: date + type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Disposal Date *</Label>
              <Input type="date" value={disposalDate} onChange={e => setDisposalDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Disposal Type</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Disposed">Disposed (Scrapped)</SelectItem>
                  <SelectItem value="Sold">Sold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Proceeds */}
          <div className="space-y-1">
            <Label className="text-xs">Proceeds Received (NPR)</Label>
            <Input
              type="number" min="0"
              value={proceeds}
              onChange={e => setProceeds(e.target.value)}
              placeholder="0"
              className="h-8 text-sm"
            />
            <p className="text-xs text-muted-foreground">Enter 0 if scrapped with no proceeds.</p>
          </div>

          {/* Payment method + ledger display — only when proceeds > 0 */}
          {proc > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Received Via</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cash/Bank Ledger</Label>
                <div className="h-8 px-3 flex items-center rounded-md border border-input bg-muted/40 text-xs text-muted-foreground">
                  {resolvedPaymentLedgerName}
                </div>
                {cashBankOptions.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Mapped from Settings → GL Accounts
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Gain / Loss Preview */}
          <div className={cn(
            'rounded-lg px-3 py-2.5 text-sm font-semibold flex items-center gap-2',
            isGain      ? 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300' :
            isLoss      ? 'bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-300' :
                          'bg-muted border border-border text-muted-foreground'
          )}>
            {isGain  ? <TrendingUp   className="w-4 h-4 shrink-0" /> :
             isLoss  ? <TrendingDown className="w-4 h-4 shrink-0" /> :
                       <BookOpen     className="w-4 h-4 shrink-0" />}
            <span className="truncate">
              {isBreakEven
                ? 'Break-even — no gain or loss'
                : `${isGain ? 'Gain' : 'Loss'} on Disposal: ${fmt(Math.abs(gainOrLoss))}`}
            </span>
          </div>

          {/* Manual GL Override */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              Gain/Loss Ledger Override
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <SearchableSelect
              options={glOptions}
              value={manualLedgerId}
              onValueChange={setManualLedgerId}
              placeholder="Auto-detect from Chart of Accounts…"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to auto-select <em>"Gain/Loss on Disposal of Assets"</em>.
            </p>
          </div>

          {/* GL Journal Preview */}
          <div className="bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-xs space-y-1 font-mono overflow-x-auto">
            <p className="text-slate-500 font-sans font-semibold mb-1 text-xs">Journal Preview</p>
            {accumDep > 0 && (
              <p className="whitespace-nowrap">
                <span className="text-blue-600 dark:text-blue-400">DR</span> {asset.accumulated_dep_ledger_name || 'Accum. Dep.'}{' '}
                <span className="float-right ml-4">{fmt(accumDep)}</span>
              </p>
            )}
            {proc > 0 && (
              <p className="whitespace-nowrap">
                <span className="text-blue-600 dark:text-blue-400">DR</span> {resolvedPaymentLedgerName}{' '}
                <span className="float-right ml-4">{fmt(proc)}</span>
              </p>
            )}
            {isLoss && (
              <p className="whitespace-nowrap">
                <span className="text-blue-600 dark:text-blue-400">DR</span>{' '}
                {manualLedgerId
                  ? (accounts.find(a => a.id === manualLedgerId)?.account_name || 'Manual Ledger')
                  : 'Loss on Disposal of Assets'}{' '}
                <span className="float-right ml-4">{fmt(Math.abs(gainOrLoss))}</span>
              </p>
            )}
            <p className="border-t border-border pt-1 mt-1 whitespace-nowrap">
              <span className="text-emerald-600 dark:text-emerald-400">CR</span> {asset.asset_ledger_name || 'Asset Cost Ledger'}{' '}
              <span className="float-right ml-4">{fmt(gross)}</span>
            </p>
            {isGain && (
              <p className="whitespace-nowrap">
                <span className="text-emerald-600 dark:text-emerald-400">CR</span>{' '}
                {manualLedgerId
                  ? (accounts.find(a => a.id === manualLedgerId)?.account_name || 'Manual Ledger')
                  : 'Gain on Disposal of Assets'}{' '}
                <span className="float-right ml-4">{fmt(gainOrLoss)}</span>
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={posting} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            onClick={handlePost}
            disabled={posting}
            className={cn('w-full sm:w-auto', isLoss ? 'bg-red-600 hover:bg-red-700' : '')}
          >
            <BookOpen className="w-3.5 h-3.5 mr-1.5" />
            {posting ? 'Posting…' : 'Confirm Disposal & Post GL'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}