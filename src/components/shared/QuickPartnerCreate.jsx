import { useState } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function QuickPartnerCreate({ open, onOpenChange, type = 'vendor', onCreated }) {
  const isVendor = type === 'vendor';
  
  const [form, setForm] = useState({
    name: '', partner_type: 'Company',
    is_customer: !isVendor, is_vendor: isVendor, is_active: true,
    email: '', phone: '', address: ''
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const created = await sajilo.entities.BusinessPartner.create(form);
      toast.success(`${isVendor ? 'Vendor' : 'Customer'} created successfully`);
      if (onCreated) onCreated(created);
      onOpenChange(false);
      setForm({
        name: '', partner_type: 'Company',
        is_customer: !isVendor, is_vendor: isVendor, is_active: true,
        email: '', phone: '', address: ''
      });
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
          <DialogTitle>Quick Create {isVendor ? 'Vendor' : 'Customer'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name *</Label>
            <Input id="name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={form.partner_type} onValueChange={v => setForm(f => ({ ...f, partner_type: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Company">Company</SelectItem>
                  <SelectItem value="Individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={saving || !form.name.trim()} onClick={handleSave}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
