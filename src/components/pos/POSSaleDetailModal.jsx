import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { sajilo } from '@/api/sajiloClient';
import { postPOSSale, loadItemsMap, loadSettings } from '@/lib/glPostingService';
import { toast } from 'sonner';
import { RotateCcw, XCircle } from 'lucide-react';
import StatusBadge from '@/components/shared/StatusBadge';
import POSReturnModal from '@/components/pos/POSReturnModal';

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

export default function POSSaleDetailModal({ sale, onClose, onVoided }) {
  const [showVoidConfirm, setShowVoidConfirm] = useState(false);
  const [voidInput, setVoidInput] = useState('');
  const [voiding, setVoiding] = useState(false);
  const [showReturn, setShowReturn] = useState(false);

  if (!sale) return null;

  const isVoided = sale.status === 'Voided';

  const handleVoid = async () => {
    if (voidInput !== 'VOID') {
      toast.error('Please type VOID to confirm');
      return;
    }
    setVoiding(true);
    // 1. Restore stock for all line items
    for (const line of (sale.line_items || [])) {
      if (line.item_id && line.quantity > 0) {
        const its = await sajilo.entities.Item.filter({ id: line.item_id });
        if (its[0] && its[0].item_type !== 'Service') {
          await sajilo.entities.Item.update(its[0].id, {
            quantity_on_hand: (its[0].quantity_on_hand || 0) + line.quantity
          });
        }
      }
    }
    // 2. GL Reversal
    const [itemsMap, glSettings] = await Promise.all([loadItemsMap((sale.line_items || []).map(l => l.item_id)), loadSettings()]);
    await postPOSSale(sale, itemsMap, glSettings, true);
    // 3. Mark sale as Voided
    await sajilo.entities.POSSale.update(sale.id, { status: 'Voided' });
    toast.success(`POS Sale ${sale.sale_number} has been voided. Stock restored.`);
    setVoiding(false);
    setShowVoidConfirm(false);
    onVoided?.();
    onClose();
  };

  return (
    <>
      <Dialog open={!!sale} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="font-mono text-primary">{sale.sale_number}</span>
              <StatusBadge status={sale.status} />
            </DialogTitle>
          </DialogHeader>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3 bg-muted/30 rounded-lg p-4 text-sm mt-2">
            <div><span className="text-muted-foreground">Date:</span> <strong>{sale.sale_date}</strong></div>
            <div><span className="text-muted-foreground">Customer:</span> <strong>{sale.customer_name || 'Walk-in Customer'}</strong></div>
            <div><span className="text-muted-foreground">Payment Method:</span> <strong>{sale.payment_method}</strong></div>
            <div><span className="text-muted-foreground">Amount Tendered:</span> <strong>{fmt(sale.amount_tendered)}</strong></div>
            {sale.change_amount > 0 && (
              <div><span className="text-muted-foreground">Change Given:</span> <strong className="text-emerald-600">{fmt(sale.change_amount)}</strong></div>
            )}
            {sale.notes && (
              <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> {sale.notes}</div>
            )}
          </div>

          {/* Line Items */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-center">Qty</th>
                  <th className="px-3 py-2 text-right">Unit Price</th>
                  <th className="px-3 py-2 text-right">Disc%</th>
                  <th className="px-3 py-2 text-right">VAT</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(sale.line_items || []).map((l, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{l.item_name}</p>
                      {l.item_code && <p className="text-xs text-muted-foreground">{l.item_code}</p>}
                    </td>
                    <td className="px-3 py-2 text-center">{l.quantity} {l.unit_of_measure || ''}</td>
                    <td className="px-3 py-2 text-right">{fmt(l.unit_price)}</td>
                    <td className="px-3 py-2 text-right">{l.discount_percent > 0 ? `${l.discount_percent}%` : '—'}</td>
                    <td className="px-3 py-2 text-center">{l.vat_applicable ? <Badge variant="outline" className="text-xs">13%</Badge> : '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmt(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 text-sm space-y-1">
              <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{fmt(sale.subtotal)}</span></div>
              {sale.discount_amount > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>-{fmt(sale.discount_amount)}</span></div>}
              {sale.vat_amount > 0 && <div className="flex justify-between text-muted-foreground"><span>VAT (13%)</span><span>{fmt(sale.vat_amount)}</span></div>}
              <div className="flex justify-between font-bold text-base border-t pt-1"><span>Grand Total</span><span className="text-primary">{fmt(sale.grand_total)}</span></div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {!isVoided && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-orange-300 text-orange-600 hover:bg-orange-50"
                  onClick={() => setShowReturn(true)}
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Return Items
                </Button>
                <Button
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50"
                  onClick={() => { setVoidInput(''); setShowVoidConfirm(true); }}
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Void Sale
                </Button>
              </div>
            )}
            {isVoided && (
              <Badge className="bg-red-100 text-red-700 border border-red-200 px-3 py-1.5 text-sm">
                This sale has been voided
              </Badge>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Void Confirmation */}
      <AlertDialog open={showVoidConfirm} onOpenChange={setShowVoidConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">Void POS Sale {sale.sale_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action is irreversible. The sale will be marked as <strong>Voided</strong> and all stock will be restored.
              Type <strong>VOID</strong> below to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            className="border-red-300 focus-visible:ring-red-400"
            placeholder="Type VOID to confirm"
            value={voidInput}
            onChange={e => setVoidInput(e.target.value.toUpperCase())}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleVoid}
              disabled={voidInput !== 'VOID' || voiding}
              className="bg-red-600 hover:bg-red-700"
            >
              {voiding ? 'Voiding…' : 'Void Sale'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* POS Return Modal */}
      {showReturn && (
        <POSReturnModal
          sale={sale}
          onClose={() => setShowReturn(false)}
          onPosted={() => { setShowReturn(false); onClose(); }}
        />
      )}
    </>
  );
}