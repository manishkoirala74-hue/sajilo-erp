import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Plus, Eye, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import DateInput from '@/components/shared/DateInput';

const emptyChallan = {
  project_id: '',
  godown_id: '',
  issue_date: new Date().toISOString().split('T')[0],
  line_items: []
};

const emptyLine = { item_id: '', item_name: '', quantity: 1, available_stock: 0 };

export default function DeliveryChallans() {
  const [challans, setChallans] = useState([]);
  const [projects, setProjects] = useState([]);
  const [godowns, setGodowns] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyChallan);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [chlData, projData, gdwnData, itmData] = await Promise.all([
        sajilo.entities.DeliveryChallan.list('-created_at'),
        sajilo.entities.ConstructionProject.filter({ status: 'Active' }),
        sajilo.entities.Godown.filter({ is_active: true }),
        sajilo.entities.Item.filter({ is_active: true })
      ]);
      setChallans(chlData);
      setProjects(projData);
      setGodowns(gdwnData);
      setItems(itmData);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const checkStock = async (itemId, godownId) => {
    if (!itemId || !godownId) return 0;
    try {
      const res = await sajilo.entities.CurrentStock.filter({ item_id: itemId, godown_id: godownId });
      if (res && res.length > 0) {
        return res[0].current_qty;
      }
      return 0;
    } catch (e) {
      return 0;
    }
  };

  const handleLineChange = async (idx, field, val) => {
    const lines = [...form.line_items];
    lines[idx] = { ...lines[idx], [field]: val };
    
    if (field === 'item_id') {
      const item = items.find(i => i.id === val);
      lines[idx].item_name = item ? item.item_name : '';
      
      if (form.godown_id) {
        const stock = await checkStock(val, form.godown_id);
        lines[idx].available_stock = stock;
        if (stock <= 0) {
          toast.warning(`Ghost Stock Warning: No stock available in selected Godown for ${lines[idx].item_name}`);
        }
      }
    }
    setForm({ ...form, line_items: lines });
  };

  const addLine = () => setForm({ ...form, line_items: [...form.line_items, { ...emptyLine }] });
  const removeLine = (idx) => setForm({ ...form, line_items: form.line_items.filter((_, i) => i !== idx) });

  const save = async () => {
    if (!form.project_id) return toast.error('Project is required');
    if (!form.godown_id) return toast.error('Godown is required');
    if (form.line_items.length === 0) return toast.error('At least one item is required');

    // Ghost stock final check
    for (const line of form.line_items) {
      if (!line.item_id || !line.quantity) return toast.error('Incomplete line item detected');
      if (parseFloat(line.quantity) > line.available_stock) {
        return toast.error(`Insufficient stock for ${line.item_name}. Only ${line.available_stock} available.`);
      }
    }

    setSaving(true);
    try {
      const user = sajilo.auth.user();
      const payload = {
        company_id: user?.user_metadata?.company_id,
        project_id: form.project_id,
        godown_id: form.godown_id,
        issue_date: form.issue_date,
        line_items: form.line_items.map(l => ({ item_id: l.item_id, quantity: parseFloat(l.quantity) }))
      };
      
      await sajilo.rpc('rpc_issue_project_materials', { p_payload: payload });
      toast.success('Materials issued successfully');
      
      setOpen(false);
      setForm(emptyChallan);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Error issuing materials');
    } finally {
      setSaving(false);
    }
  };

  const cancelChallan = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this challan? This will create a reversal in the inventory ledger.')) return;
    setCancelling(id);
    try {
      await sajilo.rpc('rpc_cancel_delivery_challan', { p_challan_id: id, p_reason: 'User Cancelled' });
      toast.success('Challan cancelled');
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to cancel');
    } finally {
      setCancelling(null);
    }
  };

  const getProjectName = (id) => projects.find(p => p.id === id)?.project_name || 'Unknown';
  const getGodownName = (id) => godowns.find(g => g.id === id)?.godown_name || 'Unknown';

  const columns = [
    { key: 'voucher_no', label: 'Challan #' },
    { key: 'project_id', label: 'Project', render: v => getProjectName(v) },
    { key: 'godown_id', label: 'Godown', render: v => getGodownName(v) },
    { key: 'issue_date', label: 'Issue Date' },
    { key: 'billing_status', label: 'Billing Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: 'Actions', render: (_, row) => (
      <div className="flex gap-1">
        {row.billing_status === 'Unbilled' && (
          <Button size="sm" variant="destructive" onClick={() => cancelChallan(row.id)} disabled={cancelling === row.id}>
            <XCircle className="w-3 h-3 mr-1" /> Cancel
          </Button>
        )}
      </div>
    )}
  ];

  return (
    <div>
      <PageHeader 
        title="Delivery Challans" 
        subtitle="Issue materials to projects"
        action={() => { setForm(emptyChallan); setOpen(true); }} 
        actionLabel="Issue Materials" 
        actionIcon={Plus} 
      />

      <DataTable columns={columns} data={challans} searchKey="voucher_no" loading={loading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Issue Project Materials</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <Label>Project *</Label>
              <Select value={form.project_id} onValueChange={v => setField('project_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>From Godown *</Label>
              <Select value={form.godown_id} onValueChange={v => setField('godown_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select godown" /></SelectTrigger>
                <SelectContent>
                  {godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.godown_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Issue Date *</Label>
              <DateInput value={form.issue_date} onChange={d => setField('issue_date', d)} />
            </div>
          </div>
          
          <div className="border rounded-md p-4">
            <div className="flex justify-between items-center mb-2">
              <Label className="text-base font-semibold">Materials (Ghost Stock Checked)</Label>
              <Button size="sm" variant="outline" onClick={addLine}><Plus className="w-4 h-4 mr-1"/> Add Item</Button>
            </div>
            
            {form.line_items.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No materials added.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Item</th>
                    <th className="text-right p-2 w-32">Available</th>
                    <th className="text-right p-2 w-32">Qty to Issue</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.line_items.map((line, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">
                        <Select value={line.item_id} onValueChange={v => handleLineChange(i, 'item_id', v)}>
                          <SelectTrigger><SelectValue placeholder="Select material" /></SelectTrigger>
                          <SelectContent>
                            {items.map(itm => <SelectItem key={itm.id} value={itm.id}>{itm.item_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className={`p-2 text-right ${line.available_stock < line.quantity ? 'text-destructive font-bold' : ''}`}>
                        {line.item_id ? line.available_stock : '-'}
                      </td>
                      <td className="p-2">
                        <Input type="number" min="0.1" step="0.1" className="text-right" value={line.quantity} onChange={e => handleLineChange(i, 'quantity', e.target.value)} />
                      </td>
                      <td className="p-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => removeLine(i)}><XCircle className="w-4 h-4 text-destructive"/></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || form.line_items.length === 0}>{saving ? 'Processing...' : 'Issue Materials'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
