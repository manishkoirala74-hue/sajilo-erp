import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { sajilo } from '@/api/sajiloClient';
import { useSajiloSync } from '@/hooks/useSajiloSync';

const emptyLine = { item_id: '', item_name: '', item_code: '', hs_code: '', quantity: 1, unit_price: 0, vat_applicable: false, line_total: 0 };

export default function LineItemsEditor({ value = [], onChange, vatRate = 13 }) {
  const [items, setItems] = useState([]);

  const loadItems = () => {
    sajilo.entities.Item.filter({ is_active: true }).then(setItems);
  };

  useEffect(() => {
    loadItems();
  }, []);

  useSajiloSync(['Item'], loadItems);

  const updateLine = (idx, field, val) => {
    const updated = [...value];
    updated[idx] = { ...updated[idx], [field]: val };
    if (field === 'quantity' || field === 'unit_price') {
      updated[idx].line_total = (updated[idx].quantity || 0) * (updated[idx].unit_price || 0);
    }
    if (field === 'item_id') {
      const found = items.find(i => i.id === val);
      if (found) {
        updated[idx].item_name = found.item_name;
        updated[idx].item_code = found.item_code || '';
        updated[idx].hs_code = found.hs_code || '';
        updated[idx].unit_price = found.selling_price || found.purchase_price || 0;
        updated[idx].vat_applicable = found.is_vat_applicable || false;
        updated[idx].line_total = (updated[idx].quantity || 1) * (found.selling_price || 0);
      }
    }
    onChange(updated);
  };

  const addLine = () => onChange([...value, { ...emptyLine }]);
  const removeLine = (idx) => onChange(value.filter((_, i) => i !== idx));

  const subtotal = value.reduce((s, l) => s + (l.line_total || 0), 0);
  const vatAmount = value.reduce((s, l) => l.vat_applicable ? s + (l.line_total || 0) * (vatRate / 100) : s, 0);

  return (
    <div className="space-y-3">
      <div className="bg-muted/30 rounded-lg overflow-hidden border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/70 border-b border-border">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Item</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">Qty</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-32">Unit Price</th>
              <th className="px-3 py-2 text-center font-medium text-muted-foreground w-16">VAT</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground w-28">Total</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {value.map((line, idx) => (
              <tr key={idx}>
                <td className="px-3 py-2">
                  <select
                    value={line.item_id}
                    onChange={e => updateLine(idx, 'item_id', e.target.value)}
                    className="w-full bg-white border border-input rounded-md px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Select item...</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.item_name} ({i.item_code || i.unit_of_measure})</option>)}
                  </select>
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
                  <Switch
                    checked={line.vat_applicable}
                    onCheckedChange={v => updateLine(idx, 'vat_applicable', v)}
                  />
                </td>
                <td className="px-3 py-2 text-right font-medium">
                  NPR {Number(line.line_total || 0).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => removeLine(idx)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
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
          {vatAmount > 0 && (
            <div className="flex justify-between gap-12">
              <span className="text-muted-foreground">VAT ({vatRate}%):</span>
              <span className="font-medium">NPR {vatAmount.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between gap-12 text-base font-bold border-t border-border pt-1">
            <span>Grand Total:</span>
            <span>NPR {(subtotal + vatAmount).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}