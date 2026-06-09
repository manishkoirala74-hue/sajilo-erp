import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Plus, UserCircle, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import DateInput from '@/components/shared/DateInput';
import { Link } from 'react-router-dom';

const empty = {
  employee_code: '', full_name: '', date_of_birth: '', national_id_number: '',
  department: '', designation: '', employment_status: 'Probation',
  joining_date: new Date().toISOString().split('T')[0], exit_date: '',
  email: '', phone: '', address: '', bank_name: '', bank_account_number: '',
  salary_components: { earnings: [], deductions: [] },
  annual_leave_balance: 15, sick_leave_balance: 12
};

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [settings, setSettings] = useState({ earnings: [], deductions: [] });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('Active');

  useEffect(() => { fetchData(); fetchSettings(); }, []);

  const fetchSettings = async () => {
    try {
      const stgs = await sajilo.entities.CompanySettings.list();
      const s = stgs[0] || {};
      const parse = (val) => {
        if (!val) return [];
        if (typeof val === 'string') { try { return JSON.parse(val); } catch(e) { return []; } }
        return Array.isArray(val) ? val : [];
      };
      setSettings({
        earnings: parse(s.hr_earning_mappings),
        deductions: parse(s.hr_deduction_mappings)
      });
    } catch(e) {
      console.error(e);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const data = await sajilo.entities.Employee.list('-created_date', 200);
    setEmployees(data);
    setLoading(false);
  };

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const getComp = (type, name, isPercentage = false) => {
    const list = form.salary_components?.[type] || [];
    const item = list.find(x => x.name === name);
    return item ? (isPercentage ? item.percentage : item.amount) : 0;
  };

  const setComp = (type, name, value, isPercentage = false) => {
    const list = [...(form.salary_components?.[type] || [])];
    const idx = list.findIndex(x => x.name === name);
    if (idx >= 0) {
      if (isPercentage) list[idx].percentage = value; else list[idx].amount = value;
    } else {
      list.push(isPercentage ? { name, percentage: value } : { name, amount: value });
    }
    f('salary_components', { ...form.salary_components, [type]: list });
  };

  const save = async () => {
    if (!form.full_name) return toast.error('Full name required');
    setSaving(true);
    try {
      const code = form.employee_code || `EMP-${String(employees.length + 1).padStart(3, '0')}`;
      const payload = { ...form, employee_code: code };
        
      // Sanitize empty strings for dates
      if (payload.date_of_birth === '') payload.date_of_birth = null;
      if (payload.exit_date === '') payload.exit_date = null;
      if (payload.joining_date === '') payload.joining_date = null;
      
      if (typeof payload.salary_components === 'object') {
        payload.salary_components = JSON.stringify(payload.salary_components);
      }

      if (editing) {
        await sajilo.entities.Employee.update(editing, payload);
        toast.success('Employee updated');
      } else {
        await sajilo.entities.Employee.create(payload);
        toast.success('Employee created');
      }
      setOpen(false);
      setEditing(null);
      setForm(empty);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  const activeStatuses = ['Probation', 'Permanent'];
  const filtered = filter === 'Active'
    ? employees.filter(e => activeStatuses.includes(e.employment_status))
    : filter === 'Inactive'
    ? employees.filter(e => !activeStatuses.includes(e.employment_status))
    : employees;

  const columns = [
    { key: 'employee_code', label: 'Code' },
    { key: 'full_name', label: 'Name', render: (v, row) => (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
          <UserCircle className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="font-medium text-sm">{v}</p>
          <p className="text-xs text-muted-foreground">{row.designation}</p>
        </div>
      </div>
    )},
    { key: 'department', label: 'Department', render: v => v || '—' },
    { key: 'employment_status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'joining_date', label: 'Joining Date', isDate: true },
    { key: 'base_salary', label: 'Base Salary', render: (_, row) => {
      // Find base salary if present
      const base = row.salary_components?.earnings?.find(x => x.name.toLowerCase().includes('base'))?.amount || 0;
      return fmt(base);
    }},
    { key: 'id', label: '', render: (_, row) => (
      <Button size="sm" variant="ghost" onClick={() => { setForm({ ...empty, ...row }); setEditing(row.id); setOpen(true); }}>Edit</Button>
    )}
  ];

  return (
    <div>
      <PageHeader title="Employees" subtitle="HR master data and employee profiles"
        action={() => { setForm(empty); setEditing(null); setOpen(true); }} actionLabel="Add Employee" actionIcon={Plus} />

      <div className="flex gap-2 mb-4">
        {['All', 'Active', 'Inactive'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === f ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {f}
          </button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} searchKey="full_name" loading={loading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Employee' : 'New Employee'}</DialogTitle></DialogHeader>

          <div className="space-y-6">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Personal Info</p>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Full Name *</Label><Input value={form.full_name} onChange={e => f('full_name', e.target.value)} /></div>
                <div><DateInput label="Date of Birth" value={form.date_of_birth} onChange={v => f('date_of_birth', v)} /></div>
                <div><Label>National ID</Label><Input value={form.national_id_number} onChange={e => f('national_id_number', e.target.value)} /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => f('email', e.target.value)} /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={e => f('phone', e.target.value)} /></div>
                <div><Label>Address</Label><Input value={form.address} onChange={e => f('address', e.target.value)} /></div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Employment</p>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Department</Label><Input value={form.department} onChange={e => f('department', e.target.value)} /></div>
                <div><Label>Designation</Label><Input value={form.designation} onChange={e => f('designation', e.target.value)} /></div>
                <div><Label>Employment Status</Label>
                  <Select value={form.employment_status} onValueChange={v => f('employment_status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{['Candidate','Probation','Permanent','Notice Period','Retired','Terminated'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><DateInput label="Joining Date" value={form.joining_date} onChange={v => f('joining_date', v)} /></div>
                {(form.employment_status === 'Terminated' || form.employment_status === 'Retired') && (
                  <div><DateInput label="Exit Date" value={form.exit_date} onChange={v => f('exit_date', v)} /></div>
                )}
              </div>
            </div>
            
            <div className="bg-muted/20 p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Dynamic Salary Structure</p>
                <Link to="/settings" className="text-xs text-primary flex items-center"><Settings className="w-3 h-3 mr-1" /> Map Components</Link>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                {/* EARNINGS */}
                <div>
                  <Label className="text-emerald-600 font-semibold mb-3 block">Earnings (Debits)</Label>
                  {settings.earnings.length === 0 && <p className="text-xs text-muted-foreground italic">No earnings mapped in settings.</p>}
                  {settings.earnings.map(earn => (
                    <div key={earn.name} className="mb-3">
                      <Label className="text-xs">{earn.name} (Amount)</Label>
                      <Input 
                        type="number" 
                        value={getComp('earnings', earn.name)} 
                        onChange={e => setComp('earnings', earn.name, parseFloat(e.target.value) || 0)} 
                      />
                    </div>
                  ))}
                </div>

                {/* DEDUCTIONS */}
                <div>
                  <Label className="text-orange-600 font-semibold mb-3 block">Deductions (Credits)</Label>
                  {settings.deductions.length === 0 && <p className="text-xs text-muted-foreground italic">No deductions mapped in settings.</p>}
                  {settings.deductions.map(ded => {
                    const isPct = ded.name.toLowerCase().includes('pf') || ded.name.toLowerCase().includes('tds') || ded.name.toLowerCase().includes('tax');
                    return (
                      <div key={ded.name} className="mb-3">
                        <Label className="text-xs">{ded.name} {isPct ? '(%)' : '(Amount)'}</Label>
                        <Input 
                          type="number" 
                          value={getComp('deductions', ded.name, isPct)} 
                          onChange={e => setComp('deductions', ded.name, parseFloat(e.target.value) || 0, isPct)} 
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Leave Balances</p>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Annual Leave (days)</Label><Input type="number" value={form.annual_leave_balance} onChange={e => f('annual_leave_balance', parseFloat(e.target.value) || 0)} /></div>
                <div><Label>Sick Leave (days)</Label><Input type="number" value={form.sick_leave_balance} onChange={e => f('sick_leave_balance', parseFloat(e.target.value) || 0)} /></div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Bank Details</p>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Bank Name</Label><Input value={form.bank_name} onChange={e => f('bank_name', e.target.value)} /></div>
                <div><Label>Account Number</Label><Input value={form.bank_account_number} onChange={e => f('bank_account_number', e.target.value)} /></div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{editing ? 'Update' : 'Create'} Employee</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}