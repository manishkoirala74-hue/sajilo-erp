import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sajilo } from '@/api/sajiloClient';
import { postSalesReturn, loadItemsMap, loadSettings } from '@/lib/glPostingService';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { AlertCircle } from 'lucide-react';

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

/**
 * POS Sales Return
 *
 * Accounting treatment on Post:
 *   DR  Sales Returns & Allowances    (contra-revenue — reduces net sales)
 *   DR  VAT Payable                   (if VAT was collected — reverses tax liability)
 *   CR  Cash / Bank                   (refund paid out to customer — asset decreases)
 *
 * NOTE: Cash/Bank is CREDITED (decreasing the asset) because cash leaves the business.
 *       We do NOT allow user to pick a revenue or liability account as the credit side.
 */
export default function POSReturnModal({ sale, onClose, onPosted }) {
  // Pre-fill return lines from original sale, qty defaulting to original
  const [lines, setLines] = useState(
    (sale.line_items || []).map(l => ({ ...l, return_qty: l.quantity, selected: true }))
  );
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('Cash');
  const [posting, setPosting] = useState(false);

  const updateLine = (idx, field, val) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: val };
      if (field === 'return_qty') {
        const q = Math.min(parseFloat(val) || 0, l.quantity);
        updated.return_qty = q;
      }
      return updated;
    }));
  };

  const selectedLines = lines.filter(l => l.selected && l.return_qty > 0);
  const subtotal = selectedLines.reduce((s, l) => s + l.unit_price * l.return_qty * (1 - (l.discount_percent || 0) / 100), 0);
  const vatAmount = selectedLines.reduce((s, l) => l.vat_applicable ? s + l.unit_price * l.return_qty * (1 - (l.discount_percent || 0) / 100) * 0.13 : s, 0);
  const grandTotal = subtotal + vatAmount;

  const handlePost = async () => {
    if (selectedLines.length === 0) { toast.error('Select at least one item to return'); return; }
    if (!reason.trim()) { toast.error('Please enter a reason for the return'); return; }
    setPosting(true);

    const returnNumber = `RPOS-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;

    const returnRecord = {
      return_number: returnNumber,
      pos_sale_id: sale.id,
      pos_sale_number: sale.sale_number,
      return_source: 'POS Sale',
      refund_method: refundMethod,
      customer_name: sale.customer_name || 'Walk-in Customer',
      return_date: format(new Date(), 'yyyy-MM-dd'),
      reason,
      status: 'Posted',
      subtotal: parseFloat(subtotal.toFixed(2)),
      vat_amount: parseFloat(vatAmount.toFixed(2)),
      grand_total: parseFloat(grandTotal.toFixed(2)),
      line_items: selectedLines.map(l => ({
        item_id: l.item_id,
        item_name: l.item_name,
        item_code: l.item_code || '',
        quantity: l.return_qty,
        unit_price: l.unit_price,
        vat_applicable: l.vat_applicable || false,
        line_total: parseFloat((l.unit_price * l.return_qty * (1 - (l.discount_percent || 0) / 100)).toFixed(2))
      }))
    };

    await sajilo.entities.SalesReturn.create(returnRecord);

    // Restore stock for physical (non-service) items
    for (const l of selectedLines) {
      if (l.item_id && !l.is_service) {
        const its = await sajilo.entities.Item.filter({ id: l.item_id });
        if (its[0] && its[0].item_type !== 'Service') {
          await sajilo.entities.Item.update(its[0].id, {
            quantity_on_hand: (its[0].quantity_on_hand || 0) + l.return_qty
          });
        }
      }
    }

    // GL Posting
    const [itemsMap, glSettings] = await Promise.all([loadItemsMap(selectedLines.map(l => l.item_id)), loadSettings()]);
    await postSalesReturn({ ...returnRecord, id: returnRecord.return_number }, itemsMap, glSettings);
    toast.success(`Return ${returnNumber} posted. Stock restored. Refund via ${refundMethod}. GL updated.`);
    setPosting(false);
    onPosted?.();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Return Items — POS Sale {sale.sale_number}</DialogTitle>
        </DialogHeader>

        {/* Accounting notice */}
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Accounting treatment on posting:</strong>
            <span className="ml-1">DR Sales Returns &amp; Allowances · DR VAT Payable (if applicable) · <strong>CR Cash/Bank</strong> (refund paid to customer)</span>
          </div>
        </div>

        {/* Return meta */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Refund Method <span className="text-red-500">*</span></Label>
            <Select value={refundMethod} onValueChange={setRefundMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="Digital Wallet">Digital Wallet</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">Cash/Bank will be <strong>credited</strong> (cash leaves the business)</p>
          </div>
          <div>
            <Label>Reason <span className="text-red-500">*</span></Label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="Defective / Wrong item / Customer request…" />
          </div>
        </div>

        {/* Return line items */}
        <div>
          <Label className="text-base font-semibold">Select Items to Return</Label>
          <p className="text-xs text-muted-foreground mb-2">Uncheck items that are NOT being returned. Adjust quantity if partial return.</p>
          <div className="border rounded-lg overflow-hidden">
            <table className="table-fluid-grid text-sm">
              <thead className="cell-density bg-muted/50">
                <tr>
                  <th className="cell-density w-8"></th>
                  <th className="cell-density text-left">Item</th>
                  <th className="cell-density text-center">Sold Qty</th>
                  <th className="cell-density text-center w-28">Return Qty</th>
                  <th className="cell-density text-right">Unit Price</th>
                  <th className="cell-density text-center">VAT</th>
                  <th className="cell-density text-right">Refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l, i) => {
                  const lineRefund = l.selected
                    ? l.unit_price * l.return_qty * (1 - (l.discount_percent || 0) / 100) * (1 + (l.vat_applicable ? 0.13 : 0))
                    : 0;
                  return (
                    <tr key={i} className={!l.selected ? 'opacity-40' : ''}>
                      <td className="cell-density text-center">
                        <input type="checkbox" checked={l.selected}
                          onChange={e => updateLine(i, 'selected', e.target.checked)}
                          className="w-4 h-4 accent-primary" />
                      </td>
                      <td className="cell-density ">
                        <p className="font-medium">{l.item_name}</p>
                        {l.item_code && <p className="text-xs text-muted-foreground">{l.item_code}</p>}
                      </td>
                      <td className="cell-density text-center text-muted-foreground">{l.quantity}</td>
                      <td className="cell-density ">
                        <Input type="number" min={0} max={l.quantity} value={l.return_qty}
                          disabled={!l.selected}
                          onChange={e => updateLine(i, 'return_qty', e.target.value)}
                          className="h-8 text-center" />
                      </td>
                      <td className="cell-density text-right">{fmt(l.unit_price)}</td>
                      <td className="cell-density text-center">{l.vat_applicable ? '13%' : '—'}</td>
                      <td className="cell-density text-right font-semibold text-orange-600 dark:text-orange-400">{l.selected ? fmt(lineRefund) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals summary */}
        <div className="flex justify-end">
          <div className="w-64 text-sm space-y-1 bg-muted/30 rounded-lg p-3">
            <div className="flex justify-between text-muted-foreground"><span>Refund Subtotal</span><span>{fmt(subtotal)}</span></div>
            {vatAmount > 0 && <div className="flex justify-between text-muted-foreground"><span>VAT Reversed (13%)</span><span>{fmt(vatAmount)}</span></div>}
            <div className="flex justify-between font-bold border-t pt-1"><span>Total Refund</span><span className="text-orange-600 dark:text-orange-400">{fmt(grandTotal)}</span></div>
            <p className="text-xs text-muted-foreground pt-1">Refund method: <strong>{refundMethod}</strong></p>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handlePost}
            disabled={posting || selectedLines.length === 0}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {posting ? 'Processing…' : `Post Return — Refund ${fmt(grandTotal)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}