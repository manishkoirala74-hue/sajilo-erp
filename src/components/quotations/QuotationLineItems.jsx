import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import SearchableSelect from '@/components/shared/SearchableSelect';

const emptyLine = {
  item_id: '', item_name: '', item_code: '', hs_code: '', description: '',
  unit_of_measure: '',
  quantity: 1, unit_price: 0, discount_percent: 0,
  vat_applicable: false, line_total: 0,
};

export default function QuotationLineItems({ value = [], onChange, items = [], vatRate = 13 }) {
  const update = (idx, key, val) => {
    const lines = value.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [key]: val };
      if (key === 'line_total') {
        const total = Number(val || 0);
        updated.line_total = total;
        const disc = Number(updated.discount_percent || 0);
        const discMultiplier = disc < 100 ? (1 - disc / 100) : 1;
        const base = discMultiplier > 0 ? (total / discMultiplier) : total;
        const qty = Number(updated.quantity || 0);
        if (qty > 0) {
          updated.unit_price = Math.round((base / qty) * 10000) / 10000;
        } else {
          updated.unit_price = base;
          updated.quantity = 1;
        }
      } else if (key === 'unit_price' || key === 'quantity' || key === 'discount_percent') {
        const base = (Number(updated.quantity || 0)) * (Number(updated.unit_price || 0));
        const afterDisc = base * (1 - (Number(updated.discount_percent || 0)) / 100);
        updated.line_total = Math.round(afterDisc * 100) / 100;
      }
      return updated;
    });
    onChange(lines);
  };

  const selectItem = (idx, itemId) => {
    const item = items.find(it => it.id === itemId);
    if (!item) return;

    // Auto-extract hybrid attributes
    let appendedDesc = item.description || '';
    if (item.attributes?.model) appendedDesc += `\nModel: ${item.attributes.model}`;
    if (item.attributes?.specifications) appendedDesc += `\nSpecs: ${item.attributes.specifications}`;

    const price = item.selling_price || item.purchase_price || 0;
    const qty = value[idx]?.quantity || 1;
    const disc = value[idx]?.discount_percent || 0;
    const base = qty * price;
    const lineTotal = Math.round((base * (1 - disc / 100)) * 100) / 100;

    const lines = value.map((l, i) => i === idx ? {
      ...l,
      item_id: item.id,
      item_name: item.item_name,
      item_code: item.item_code || '',
      hs_code: item.hs_code || '',
      unit_of_measure: item.unit_of_measure || '',
      unit_price: price,
      quantity: qty,
      line_total: lineTotal,
      vat_applicable: item.is_vat_applicable || false,
      description: appendedDesc.trim(),
    } : l);
    onChange(lines);
  };

  const addLine = () => onChange([...value, { ...emptyLine }]);
  const removeLine = (idx) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="table-scroll-container rounded-lg border border-border">
        <table className="table-fluid-grid text-sm">
          <thead className="cell-density bg-muted/30">
            <tr>
              <th className="cell-density text-left text-xs font-semibold text-muted-foreground w-48">Item</th>
              <th className="cell-density text-left text-xs font-semibold text-muted-foreground">Description</th>
              <th className="cell-density text-center text-xs font-semibold text-muted-foreground w-20">Qty</th>
              <th className="cell-density text-center text-xs font-semibold text-muted-foreground w-16">Unit</th>
              <th className="cell-density text-right text-xs font-semibold text-muted-foreground w-24">Unit Price</th>
              <th className="cell-density text-center text-xs font-semibold text-muted-foreground w-16">Disc %</th>
              <th className="cell-density text-center text-xs font-semibold text-muted-foreground w-14">VAT</th>
              <th className="cell-density text-right text-xs font-semibold text-muted-foreground w-28">Total</th>
              <th className="cell-density w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {value.map((line, idx) => (
              <tr key={idx} className="hover:bg-muted/10">
                <td className="cell-density">
                  <SearchableSelect 
                    value={line.item_id || ''} 
                    onChange={v => selectItem(idx, v)}
                    placeholder="Select item…"
                    options={items.map(it => ({
                      value: it.id,
                      label: `${it.item_name}${it.item_code ? ` (${it.item_code})` : ''}`,
                      code: it.item_code,
                      unit: it.unit_of_measure
                    }))}
                  />
                </td>
                <td className="cell-density">
                  <Input value={line.description || ''} onChange={e => update(idx, 'description', e.target.value)}
                    className="h-8 text-sm" placeholder="Optional description" />
                </td>
                <td className="cell-density">
                  <Input type="number" min={0} step="any" value={line.quantity}
                    onChange={e => update(idx, 'quantity', Number(e.target.value))}
                    className="h-8 text-sm text-center" />
                </td>
                <td className="cell-density">
                  <Input type="text" value={line.unit_of_measure || ''}
                    onChange={e => update(idx, 'unit_of_measure', e.target.value)}
                    placeholder="Unit"
                    className="h-8 text-sm text-center uppercase font-medium bg-muted/20" />
                </td>
                <td className="cell-density">
                  <Input type="number" min={0} step="any" value={line.unit_price}
                    onChange={e => update(idx, 'unit_price', Number(e.target.value))}
                    className="h-8 text-sm text-right" />
                </td>
                <td className="cell-density">
                  <Input type="number" min={0} max={100} value={line.discount_percent || 0}
                    onChange={e => update(idx, 'discount_percent', Number(e.target.value))}
                    className="h-8 text-sm text-center" />
                </td>
                <td className="cell-density text-center">
                  <Switch checked={!!line.vat_applicable} onCheckedChange={v => update(idx, 'vat_applicable', v)} />
                </td>
                <td className="cell-density">
                  <Input type="number" min={0} step="any" value={line.line_total}
                    onChange={e => update(idx, 'line_total', Number(e.target.value))}
                    className="h-8 text-sm text-right font-semibold" />
                </td>
                <td className="cell-density">
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