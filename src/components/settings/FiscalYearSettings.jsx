import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Calendar, Unlock, CheckCircle2, Circle, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import FiscalYearClosingWizard from './FiscalYearClosingWizard';

export default function FiscalYearSettings() {
  const [fiscalYears, setFiscalYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fiscal_year_name: '',
    start_date: '',
    end_date: '',
    is_active: false,
    is_locked: false,
  });
  
  const [reopenDialog, setReopenDialog] = useState(null);
  const [reopenReason, setReopenReason] = useState('');

  const fetchFiscalYears = async () => {
    try {
      const data = await sajilo.entities.FiscalYear.list('-start_date');
      setFiscalYears(data);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load Fiscal Years');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiscalYears();
  }, []);

  const handleSave = async () => {
    if (!form.fiscal_year_name || !form.start_date || !form.end_date) {
      toast.error('Please fill all required fields');
      return;
    }
    if (new Date(form.end_date) <= new Date(form.start_date)) {
      toast.error('End date must be after start date');
      return;
    }

    setSaving(true);
    try {
      await sajilo.entities.FiscalYear.create(form);
      toast.success('Fiscal Year created successfully');
      setShowForm(false);
      fetchFiscalYears();
    } catch (e) {
      console.error(e);
      toast.error('Error creating Fiscal Year');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id, currentActiveStatus) => {
    // If it's already active, the user might be trying to deactivate it, but we require at least one active usually.
    // The DB trigger handles setting others to false if this is true.
    try {
      await sajilo.entities.FiscalYear.update(id, { is_active: !currentActiveStatus });
      toast.success('Active status updated');
      fetchFiscalYears();
    } catch (e) {
      toast.error('Failed to update status');
    }
  };

  const toggleLock = async (id, currentLockStatus) => {
    try {
      await sajilo.entities.FiscalYear.update(id, { is_locked: !currentLockStatus });
      toast.success(`Fiscal Year ${!currentLockStatus ? 'locked' : 'unlocked'}`);
      fetchFiscalYears();
    } catch (e) {
      toast.error('Failed to update lock status');
    }
  };

  const handleReopen = async () => {
    if (!reopenReason.trim()) {
      toast.error('Re-opening requires a justification reason.');
      return;
    }
    try {
      await sajilo.auth.supabase.rpc('reopen_fiscal_year', {
        p_company_id: sajilo.getCompanyId(),
        p_fy_id: reopenDialog.id,
        p_reason: reopenReason
      });
      toast.success('Fiscal year unlocked and reopened.');
      setReopenDialog(null);
      setReopenReason('');
      fetchFiscalYears();
    } catch (e) {
      console.error(e);
      toast.error('Failed to reopen fiscal year.');
    }
  };

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading Fiscal Years...</div>;

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold text-foreground text-sm">Fiscal Year Management</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Define financial periods and control transaction boundaries.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => { setForm({ fiscal_year_name: '', start_date: '', end_date: '', is_active: false, is_locked: false }); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1.5" /> New Fiscal Year
        </Button>
      </div>

      <div className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/10 border-b border-border">
            <tr>
              <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Fiscal Year</th>
              <th className="text-left px-5 py-3 font-semibold text-muted-foreground">Period</th>
              <th className="text-center px-5 py-3 font-semibold text-muted-foreground">Active</th>
              <th className="text-center px-5 py-3 font-semibold text-muted-foreground">Locked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fiscalYears.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                  No Fiscal Years defined. Create one to begin validating transactions.
                </td>
              </tr>
            ) : (
              fiscalYears.map(fy => (
                <tr key={fy.id} className="hover:bg-muted/5">
                  <td className="px-5 py-3 font-medium">{fy.fiscal_year_name}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {fy.start_date} to {fy.end_date}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-center">
                      <button 
                        onClick={() => toggleActive(fy.id, fy.is_active)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${fy.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        {fy.is_active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                        {fy.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-center">
                      <button 
                        onClick={() => {
                          if (fy.is_locked) {
                            setReopenDialog(fy);
                          } else {
                            toggleLock(fy.id, fy.is_locked);
                          }
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${fy.is_locked ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                      >
                        {fy.is_locked ? <KeyRound className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        {fy.is_locked ? 'Re-Open' : 'Open'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Fiscal Year</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Fiscal Year Name *</Label>
              <Input 
                value={form.fiscal_year_name} 
                onChange={e => setForm({...form, fiscal_year_name: e.target.value})} 
                placeholder="e.g. FY 2026-2027" 
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date *</Label>
                <Input 
                  type="date" 
                  value={form.start_date} 
                  onChange={e => setForm({...form, start_date: e.target.value})} 
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>End Date *</Label>
                <Input 
                  type="date" 
                  value={form.end_date} 
                  onChange={e => setForm({...form, end_date: e.target.value})} 
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/20">
              <div>
                <Label className="text-sm">Set as Active Year</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Transactions will be validated against this year.</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={v => setForm({...form, is_active: v})} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reopenDialog} onOpenChange={(v) => !v && setReopenDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Re-Open Locked Year</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm border border-red-200">
              <strong>Warning:</strong> Re-opening a closed fiscal year allows historical modifications. 
              Any changes will trigger an automatic recascading to subsequent years.
            </div>
            <div>
              <Label>Justification Reason *</Label>
              <Input 
                value={reopenReason} 
                onChange={e => setReopenReason(e.target.value)} 
                placeholder="Audit adjustment for Q4..." 
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setReopenDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReopen}>Re-Open Period</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {fiscalYears.length > 0 && <FiscalYearClosingWizard />}
    </div>
  );
}
