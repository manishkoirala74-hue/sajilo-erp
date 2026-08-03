import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Plus, Eye, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import DateInput from '@/components/shared/DateInput';

const emptyProject = {
  project_name: '',
  project_type: 'Residential',
  status: 'Active',
  budget_amount: 0,
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  customer_id: ''
};

const projectTypes = ['Residential', 'Commercial', 'Infrastructure', 'Industrial', 'Other'];
const statuses = ['Active', 'OnHold', 'Completed', 'Cancelled'];

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

export default function ProjectMaster() {
  const [projects, setProjects] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyProject);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [projData, custData] = await Promise.all([
        sajilo.entities.ConstructionProject.list('-created_at'),
        sajilo.entities.BusinessPartner.filter({ is_customer: true })
      ]);
      setProjects(projData);
      setCustomers(custData);
    } catch (err) {
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!form.project_name) return toast.error('Project Name is required');
    if (!form.customer_id) return toast.error('Customer is required');

    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.budget_amount) payload.budget_amount = parseFloat(payload.budget_amount);

      if (editing) {
        await sajilo.entities.ConstructionProject.update(editing, payload);
        toast.success('Project updated');
      } else {
        await sajilo.entities.ConstructionProject.create(payload);
        toast.success('Project created');
      }
      setOpen(false);
      setEditing(null);
      setForm(emptyProject);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Error saving project');
    } finally {
      setSaving(false);
    }
  };

  const getCustomerName = (id) => customers.find(c => c.id === id)?.partner_name || 'Unknown';

  const columns = [
    { key: 'project_name', label: 'Project Name' },
    { key: 'customer_id', label: 'Customer', render: v => getCustomerName(v) },
    { key: 'project_type', label: 'Type' },
    { key: 'budget_amount', label: 'Budget', render: v => fmt(v) },
    { key: 'start_date', label: 'Start Date' },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: 'Actions', render: (_, row) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => { setForm(row); setEditing(row.id); setOpen(true); }}>
          <Edit className="w-3 h-3 mr-1" /> Edit
        </Button>
      </div>
    )}
  ];

  return (
    <div>
      <PageHeader 
        title="Construction Projects" 
        subtitle="Manage your projects, budgets, and clients"
        action={() => { setForm(emptyProject); setEditing(null); setOpen(true); }} 
        actionLabel="New Project" 
        actionIcon={Plus} 
      />

      <DataTable columns={columns} data={projects} searchKey="project_name" loading={loading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit Project' : 'New Project'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Project Name *</Label>
              <Input value={form.project_name} onChange={e => setField('project_name', e.target.value)} />
            </div>
            <div>
              <Label>Customer *</Label>
              <Select value={form.customer_id} onValueChange={v => setField('customer_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.partner_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Project Type</Label>
              <Select value={form.project_type} onValueChange={v => setField('project_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {projectTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setField('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Budget Amount</Label>
              <Input type="number" value={form.budget_amount} onChange={e => setField('budget_amount', e.target.value)} />
            </div>
            <div />
            <div>
              <Label>Start Date</Label>
              <DateInput value={form.start_date} onChange={d => setField('start_date', d)} />
            </div>
            <div>
              <Label>End Date (Optional)</Label>
              <DateInput value={form.end_date} onChange={d => setField('end_date', d)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Project'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
