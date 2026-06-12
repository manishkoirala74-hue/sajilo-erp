import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { sajilo } from '@/api/sajiloClient';
import { useSajiloSync } from '@/hooks/useSajiloSync';
import { computeItemTaxes } from '@/lib/taxService';

const emptyLine = {
  item_id: '', item_name: '', item_code: '', hs_code: '',
  quantity: 1, unit_price: 0,
  vat_applicable: false,   // legacy compat
  tax_type_ids: [],         // multi-tax
  tax_amount: 0,
  line_total: 0,
};

/**
 * LineItemsEditor
 *
 * Props:
 *   value       : LineItem[]
 *   onChange    : (lines) => void  — called with updated lines on every change
 *   taxTypes    : TaxType[]        — pre-loaded list from parent (avoids repeated fetches)
 */
export default function LineItemsEditor({ value = [], onChange, taxTypes = [] }) {
  const [items, setItems] = useState([]);

  const loadItems = () => {
    sajilo.entities.Item.filter({ is_active: true }).then(setItems);
  };

  useEffect(() => { loadItems(); }, []);
  useSajiloSync(['Item'], loadItems);

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Compute tax amount for a single line using its tax_type_ids. */
  const computeLineTaxAmount = (line, overrideTaxTypeIds) => {
    const ids = overrideTaxTypeIds ?? line.tax_type_ids ?? [];
    if (ids.length === 0 && !line.vat_applicable) return 0;

    // Legacy fallback: vat_applicable → use default tax type
    const effectiveIds = ids.length > 0 ? ids
      : [(taxTypes.find(t => t.is_default) || taxTypes[0])?.id].filter(Boolean);

    const { totalTaxAmount } = computeItemTaxes(line.line_total || 0, effectiveIds, taxTypes);
    return totalTaxAmount;
  };

  const updateLine = (idx, field, val) => {
    const updated = [...value];
    updated[idx] = { ...updated[idx], [field]: val };

    // Recalculate line_total on qty/price change
    if (field === 'quantity' || field === 'unit_price') {
      updated[idx].line_total = (updated[idx].quantity || 0) * (updated[idx].unit_price || 0);
    }

    // On item selection: copy item metadata including tax_type_ids
    if (field === 'item_id') {
      const found = items.find(i => i.id === val);
      if (found) {
        const taxIds = Array.isArray(found.tax_type_ids) ? found.tax_type_ids
          : (found.tax_type_ids ? JSON.parse(found.tax_type_ids) : []);
        updated[idx].item_name      = found.item_name;
        updated[idx].item_code      = found.item_code || '';
        updated[idx].hs_code        = found.hs_code || '';
        updated[idx].unit_price     = found.selling_price || found.purchase_price || 0;
        updated[idx].vat_applicable = found.is_vat_applicable || taxIds.length > 0;
        updated[idx].tax_type_ids   = taxIds;
        updated[idx].line_total     = (updated[idx].quantity || 1) * (found.selling_price || 0);
      }
    }

    // Recompute tax_amount whenever anything changes
    updated[idx].tax_amount = computeLineTaxAmount(updated[idx]);

    onChange(updated);
  };

  const addLine  = () => onChange([...value, { ...emptyLine }]);
  const removeLine = (idx) => onChange(value.filter((_, i) => i !== idx));

  // ── Totals ─────────────────────────────────────────────────────────────────
  const subtotal  = value.reduce((s, l) => s + (l.line_total   || 0), 0);
  const taxTotal  = value.reduce((s, l) => s + (l.tax_amount   || 0), 0);
  const grandTotal = subtotal + taxTotal;

  // Build a readable tax summary label for the footer
  const taxLabel = (() => {
    const names = new Set();
    for (const line of value) {
      for (const id of (line.tax_type_ids || [])) {
        const tt = taxTypes.find(t => t.id === id);
        if (tt) names.add(`${tt.tax_name} (${tt.tax_rate}%)`);
      }
    }
    return names.size > 0 ? [...names].join(', ') : 'Tax';
  })();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="bg-muted/30 rounded-lg overflow-hidden border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/70 border-b border-border">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Item</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">Qty</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-32">Unit Price</th>
              <th className="px-3 py-2 text-center font-medium text-muted-foreground w-20">Tax</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Net Total</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {value.map((line, idx) => {
              const appliedTaxes = (line.tax_type_ids || [])
                .map(id => taxTypes.find(t => t.id === id))
                .filter(Boolean)
                .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

              return (
                <tr key={idx}>
                  <td className="px-3 py-2">
                    <Select
                      value={line.item_id}
                      onValueChange={v => updateLine(idx, 'item_id', v)}
                    >
                      <SelectTrigger className="w-full h-8 text-xs bg-card">
                        <SelectValue placeholder="Select item..." />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name} ({i.item_code || i.unit_of_measure})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {!line.item_id && line.item_name && (
                      <Input
                        value={line.item_name}
                        onChange={e => updateLine(idx, 'item_name', e.target.value)}
                        placeholder="Item name"
                        className="mt-1 h-7 text-xs"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number" min="0"
                      value={line.quantity}
                      onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number" min="0" step="0.01"
                      value={line.unit_price}
                      onChange={e => updateLine(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {appliedTaxes.length > 0 ? (
                      <div className="flex flex-col items-center gap-0.5">
                        {appliedTaxes.map(tt => (
                          <span key={tt.id}
                            className="text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded whitespace-nowrap"
                            title={tt.is_compound ? 'Compound tax' : 'Simple tax'}
                          >
                            {tt.tax_rate}%{tt.is_compound ? '⊕' : ''}
                          </span>
                        ))}
                        {line.tax_amount > 0 && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            +{line.tax_amount.toLocaleString()}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    NPR {Number(line.line_total || 0).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 dark:text-red-400" onClick={() => removeLine(idx)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {value.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground text-sm">
                  No items added yet. Click "Add Line" below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between items-start">
        <Button variant="outline" size="sm" onClick={addLine}>
          <Plus className="w-4 h-4 mr-1" /> Add Line
        </Button>
        <div className="text-right space-y-1 text-sm">
          <div className="flex justify-between gap-12">
            <span className="text-muted-foreground">Subtotal:</span>
            <span className="font-medium">NPR {subtotal.toLocaleString()}</span>
          </div>
          {taxTotal > 0 && (
            <div className="flex justify-between gap-12">
              <span className="text-muted-foreground">{taxLabel}:</span>
              <span className="font-medium">NPR {taxTotal.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between gap-12 text-base font-bold border-t border-border pt-1">
            <span>Grand Total:</span>
            <span>NPR {grandTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}