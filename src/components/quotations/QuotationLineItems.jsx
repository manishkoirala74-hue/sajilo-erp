import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import SearchableSelect from '@/components/shared/SearchableSelect';

const emptyLine = {
  item_id: '', item_name: '', item_code: '', hs_code: '', description: '',
  quantity: 1, unit_price: 0, discount_percent: 0,
  vat_applicable: false, line_total: 0,
};

export default function QuotationLineItems({ value = [], onChange, items = [], vatRate = 13 }) {
  const recalc = (lines) => {
    return lines.map(l => {
      const base = (l.quantity || 0) * (l.unit_price || 0);
      const afterDisc = base * (1 - (l.discount_percent || 0) / 100);
      return { ...l, line_total: Math.round(afterDisc * 100) / 100 };
    });
  };

  const update = (idx, key, val) => {
    const lines = value.map((l, i) => i === idx ? { ...l, [key]: val } : l);
    onChange(recalc(lines));
  };

  const selectItem = (idx, itemId) => {
    const item = items.find(it => it.id === itemId);
    if (!item) return;

    // Auto-extract hybrid attributes
    let appendedDesc = item.description || '';
    if (item.attributes?.model) appendedDesc += `\nModel: ${item.attributes.model}`;
    if (item.attributes?.specifications) appendedDesc += `\nSpecs: ${item.attributes.specifications}`;

    const lines = value.map((l, i) => i === idx ? {
      ...l,
      item_id: item.id,
      item_name: item.item_name,
      item_code: item.item_code || '',
      hs_code: item.hs_code || '',
      unit_price: item.selling_price || item.purchase_price || 0,
      vat_applicable: item.is_vat_applicable || false,
      description: appendedDesc.trim(),
    } : l);
    onChange(recalc(lines));
  };

  const addLine = () => onChange(recalc([...value, { ...emptyLine }]));
  const removeLine = (idx) => onChange(recalc(value.filter((_, i) => i !== idx)));

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-52">Item</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Description</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground w-20">Qty</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground w-28">Unit Price</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground w-20">Disc %</th>
              <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground w-16">VAT</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-28">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {value.map((line, idx) => (
              <tr key={idx} className="hover:bg-muted/10">
                <td className="px-2 py-1.5">
                  <SearchableSelect 
                    value={line.item_id || ''} 
                    onChange={v => selectItem(idx, v)}
                    placeholder="Select item…"
                    options={items.map(it => ({
                      value: it.id,
                      label: `${it.item_name}${it.item_code ? ` (${it.item_code})` : ''}`
                    }))}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input value={line.description || ''} onChange={e => update(idx, 'description', e.target.value)}
                    className="h-8 text-xs" placeholder="Optional description" />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="number" min={0} value={line.quantity}
                    onChange={e => update(idx, 'quantity', Number(e.target.value))}
                    onBlur={() => onChange(recalc(value))}
                    className="h-8 text-xs text-center" />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="number" min={0} value={line.unit_price}
                    onChange={e => update(idx, 'unit_price', Number(e.target.value))}
                    onBlur={() => onChange(recalc(value))}
                    className="h-8 text-xs text-right" />
                </td>
                <td className="px-2 py-1.5">
                  <Input type="number" min={0} max={100} value={line.discount_percent || 0}
                    onChange={e => update(idx, 'discount_percent', Number(e.target.value))}
                    onBlur={() => onChange(recalc(value))}
                    className="h-8 text-xs text-center" />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <Switch checked={!!line.vat_applicable} onCheckedChange={v => update(idx, 'vat_applicable', v)} />
                </td>
                <td className="px-2 py-1.5 text-right font-semibold text-sm">
                  {Number(line.line_total || 0).toLocaleString()}
                </td>
                <td className="px-1 py-1.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600 dark:text-red-400" onClick={() => removeLine(idx)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button variant="outline" size="sm" onClick={addLine} className="mt-2">
        <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Line
      </Button>
    </div>
  );
}