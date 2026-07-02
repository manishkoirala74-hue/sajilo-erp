import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Edit2, Building2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { format } from 'date-fns';

const emptyForm = {
  name: '',
  is_main: false,
  status: 'Active'
};

export default function Godowns() {
  const { user, refreshGlobalSettings } = useAuth();
  const [godowns, setGodowns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchGodowns();
  }, []);

  const fetchGodowns = async () => {
    setLoading(true);
    try {
      const data = await sajilo.entities.Godown.list('name');
      setGodowns(data);
    } catch (error) {
      toast.error('Failed to fetch godowns');
    } finally {
      setLoading(false);
    }
  };

  const openNew = () => { setForm(emptyForm); setEditing(null); setShowForm(true); };
  
  const openEdit = (g) => { 
    setForm({
      name: g.name || g.godown_name,
      is_main: g.is_main,
      status: g.status
    }); 
    setEditing(g); 
    setShowForm(true); 
  };
  
  const sf = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.name) { toast.error('Godown name is required'); return; }
    
    // Safegaurds
    if (editing && editing.is_main) {
      if (form.status === 'Inactive' || form.status === 'Archived') {
        toast.error('Cannot inactivate the Main Location. Assign another location as Main first.');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        godown_name: form.name, // keep in sync
        updated_by: user.id,
        updated_at: new Date().toISOString()
      };

      if (form.is_main) {
        // Find existing main godown and unset it locally just in case backend trigger isn't full, though Phase 2 might have a trigger.
        const currentMain = godowns.find(g => g.is_main && g.id !== (editing?.id || ''));
        if (currentMain) {
          await sajilo.entities.Godown.update(currentMain.id, { is_main: false, updated_by: user.id });
        }
      }

      if (editing) {
        await sajilo.entities.Godown.update(editing.id, payload);
        toast.success('Godown updated');
      } else {
        await sajilo.entities.Godown.create(payload);
        toast.success('Godown created');
      }
      
      setShowForm(false);
      await fetchGodowns();
      await refreshGlobalSettings(); // To update context caching
    } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: 'name', label: 'Godown Name',
      render: (val, row) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex flex-col">
            <span className="font-medium text-sm">{val || row.godown_name}</span>
            {row.is_main && (
              <span className="text-[10px] font-semibold tracking-wider uppercase text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded w-fit mt-0.5">
                Main Location
              </span>
            )}
          </div>
        </div>
      )
    },
    { 
      key: 'status', label: 'Status',
      render: v => (
        <span className={`text-xs px-2 py-1 rounded-full border ${
          v === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' 
          : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300'
        }`}>
          {v}
        </span>
      )
    },
    { 
      key: 'updated_at', label: 'Last Updated',
      render: v => v ? format(new Date(v), 'MMM dd, yyyy HH:mm') : '—'
    },
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <Button variant="ghost" size="icon" onClick={() => openEdit(row)}>
          <Edit2 className="w-4 h-4 text-slate-500" />
        </Button>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="Godowns & Locations"
        subtitle="Manage your multiple warehouses and inventory locations"
        action={openNew}
        actionLabel="New Godown"
        actionIcon={Plus}
      />
      
      <DataTable columns={columns} data={godowns} searchKey="name" loading={loading} />

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Godown' : 'New Godown'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Godown Name *</Label>
              <Input 
                value={form.name} 
                onChange={e => sf('name', e.target.value)} 
                placeholder="e.g. Kathmandu Warehouse" 
              />
            </div>
            
            <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="space-y-0.5">
                <Label>Main Location</Label>
                <p className="text-xs text-muted-foreground">
                  Default location for inventory if not explicitly selected.
                </p>
              </div>
              <Switch
                checked={form.is_main}
                onCheckedChange={v => sf('is_main', v)}
              />
            </div>
            
            {editing && editing.is_main && (
              <div className="flex items-start gap-2 text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>
                  This is the <strong>Main Location</strong>. You cannot disable or archive it until another godown is set as the Main Location.
                </p>
              </div>
            )}

            <div>
              <Label>Status</Label>
              <Select 
                value={form.status} 
                onValueChange={v => sf('status', v)}
                disabled={editing && editing.is_main} // Fool-Proof safeguard
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="pt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Godown'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
