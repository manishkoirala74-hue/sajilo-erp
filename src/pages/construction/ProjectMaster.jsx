import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
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
  estimated_budget: 0,
  start_date: new Date().toISOString().split('T')[0],
  target_completion_date: '',
  customer_id: ''
};

const projectTypes = ['Residential', 'Commercial', 'Infrastructure', 'Industrial', 'Other'];
const statuses = ['Active', 'OnHold', 'Completed', 'Cancelled'];

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

export default function ProjectMaster() {
  const { activeCompany } = useAuth();
  const isGhostMode = activeCompany?.status === 'PENDING_DELETION';

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
      if (payload.estimated_budget) payload.estimated_budget = parseFloat(payload.estimated_budget);
      if (!payload.start_date) payload.start_date = null;
      if (!payload.target_completion_date) payload.target_completion_date = null;

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

  const getCustomerName = (id) => customers.find(c => c.id === id)?.name || 'Unknown';

  const columns = [
    { key: 'project_name', label: 'Project Name' },
    { key: 'customer_id', label: 'Customer', render: v => getCustomerName(v) },
    { key: 'project_type', label: 'Type' },
    { key: 'estimated_budget', label: 'Budget', render: v => fmt(v) },
    { key: 'start_date', label: 'Start Date' },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: 'Actions', render: (_, row) => (
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" disabled={isGhostMode} onClick={() => { setForm(row); setEditing(row.id); setOpen(true); }}>
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
        action={isGhostMode ? undefined : () => { setForm(emptyProject); setEditing(null); setOpen(true); }} 
        actionLabel={isGhostMode ? undefined : "New Project"} 
        actionIcon={isGhostMode ? undefined : Plus} 
      />

      <DataTable columns={columns} data={projects} searchKey="project_name" loading={loading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit Project' : 'New Project'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Project Name *</Label>
              <Input value={form.project_name} onChange={e => setField('project_name', e.target.value)} disabled={isGhostMode} />
            </div>
            <div>
              <Label>Customer *</Label>
              <Select value={form.customer_id} onValueChange={v => setField('customer_id', v)} disabled={isGhostMode}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Project Type</Label>
              <Select value={form.project_type} onValueChange={v => setField('project_type', v)} disabled={isGhostMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {projectTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setField('status', v)} disabled={isGhostMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Budget Amount</Label>
              <Input type="number" value={form.estimated_budget} onChange={e => setField('estimated_budget', e.target.value)} disabled={isGhostMode} />
            </div>
            <div />
            <div className="col-span-1">
              <DateInput label="Start Date" value={form.start_date} onChange={d => setField('start_date', d)} disabled={isGhostMode} />
            </div>
            <div className="col-span-1">
              <DateInput label="End Date (Optional)" value={form.target_completion_date} onChange={d => setField('target_completion_date', d)} disabled={isGhostMode} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            {!isGhostMode && (
              <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Project'}</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
