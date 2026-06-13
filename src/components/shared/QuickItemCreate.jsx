import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function QuickItemCreate({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({
    item_name: '', item_type: 'Product', unit_of_measure: 'PCS',
    selling_price: 0, purchase_price: 0,
    is_active: true,
    sales_account_id: '', sales_account_name: '',
    purchase_account_id: '', purchase_account_name: '',
    inventory_account_id: '', inventory_account_name: '',
  });

  useEffect(() => {
    if (open) {
      sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 500).then(accounts => {
        const defSales = accounts.find(a => a.account_code === '4100');
        const defCogs = accounts.find(a => a.account_code === '5100');
        const defInv = accounts.find(a => a.account_code === '1132');
        setForm(f => ({
          ...f,
          sales_account_id: defSales?.id || '',
          sales_account_name: defSales?.account_name || '',
          purchase_account_id: defCogs?.id || '',
          purchase_account_name: defCogs?.account_name || '',
          inventory_account_id: defInv?.id || '',
          inventory_account_name: defInv?.account_name || '',
        }));
      }).catch(err => console.error('Failed to load default GL accounts', err));
    }
  }, [open]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.item_name.trim()) { toast.error('Item name is required'); return; }
    setSaving(true);
    try {
      const created = await sajilo.entities.Item.create(form);
      toast.success('Item created successfully');
      if (onCreated) onCreated(created);
      onOpenChange(false);
      setForm(prev => ({
        ...prev,
        item_name: '', item_type: 'Product', unit_of_measure: 'PCS',
        selling_price: 0, purchase_price: 0,
        is_active: true
      }));
    } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick Create Item</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="item_name">Item Name *</Label>
            <Input id="item_name" value={form.item_name} onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Item Type</Label>
              <Select value={form.item_type} onValueChange={v => setForm(f => ({ ...f, item_type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Product">Product</SelectItem>
                  <SelectItem value="Service">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Unit of Measure</Label>
              <Input value={form.unit_of_measure} onChange={e => setForm(f => ({ ...f, unit_of_measure: e.target.value }))} placeholder="e.g. PCS, KG" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Purchase Price</Label>
              <Input type="number" min="0" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div className="grid gap-2">
              <Label>Selling Price</Label>
              <Input type="number" min="0" value={form.selling_price} onChange={e => setForm(f => ({ ...f, selling_price: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving || !form.item_name.trim()} onClick={handleSave}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
