import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sajilo } from '@/api/sajiloClient';
import { Plus, Calendar, Unlock, CheckCircle2, Circle, KeyRound, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import FiscalYearClosingWizard from './FiscalYearClosingWizard';
import DateInput from '@/components/shared/DateInput';
import { useAuth } from '@/lib/AuthContext';

export default function FiscalYearSettings() {
  const queryClient = useQueryClient();
  const currentCompanyId = sajilo.getCompanyId();

  const { data: fiscalYears = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['fiscalYears', currentCompanyId],
    queryFn: async () => {
      const data = await sajilo.entities.FiscalYear.list('-start_date');
      return data || [];
    },
    enabled: !!currentCompanyId,
  });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    fiscal_year_name: '',
    start_date: '',
    end_date: '',
    status: 'OPEN',
  });
  
  const [reopenDialog, setReopenDialog] = useState(null);
  const [reopenReason, setReopenReason] = useState('');

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (form.status === 'OPEN') {
        const openOnes = fiscalYears.filter(f => f.status === 'OPEN');
        for (const f of openOnes) {
          await sajilo.entities.FiscalYear.update(f.id, { status: 'SOFT_CLOSED' });
        }
      }
      return await sajilo.entities.FiscalYear.create(form);
    },
    onSuccess: () => {
      toast.success('Fiscal Year created successfully');
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['fiscalYears', currentCompanyId] });
    },
    onError: (e) => {
      console.error(e);
      toast.error('Failed to create Fiscal Year');
    }
  });

  const handleSave = async () => {
    if (!form.fiscal_year_name || !form.start_date || !form.end_date) {
      toast.error('Please fill all required fields');
      return;
    }
    if (new Date(form.end_date) <= new Date(form.start_date)) {
      toast.error('End date must be after start date');
      return;
    }
    saveMutation.mutate();
  };

  const reopenMutation = useMutation({
    mutationFn: async () => {
      await sajilo.auth.supabase.rpc('reopen_fiscal_year', {
        p_company_id: currentCompanyId,
        p_fy_id: reopenDialog.id,
        p_reason: reopenReason
      });
      return await sajilo.entities.FiscalYear.update(reopenDialog.id, { status: 'SOFT_CLOSED' });
    },
    onSuccess: () => {
      toast.success('Fiscal year unlocked to SOFT_CLOSED state.');
      setReopenDialog(null);
      setReopenReason('');
      queryClient.invalidateQueries({ queryKey: ['fiscalYears', currentCompanyId] });
    },
    onError: (e) => {
      console.error(e);
      toast.error('Failed to reopen fiscal year.');
    }
  });

  const handleReopen = () => {
    if (!reopenReason.trim()) {
      toast.error('Re-opening requires a justification reason.');
      return;
    }
    reopenMutation.mutate();
  };

  const finalizeMutation = useMutation({
    mutationFn: async (fy) => {
      return await sajilo.entities.FiscalYear.update(fy.id, { status: 'HARD_CLOSED' });
    },
    onSuccess: () => {
      toast.success('Fiscal year HARD_CLOSED permanently.');
      queryClient.invalidateQueries({ queryKey: ['fiscalYears', currentCompanyId] });
    },
    onError: () => {
      toast.error('Failed to finalize fiscal year.');
    }
  });

  const handleFinalize = (fy) => {
    if (!window.confirm('WARNING: Finalizing this year to HARD_CLOSED will permanently lock all adjusting entries for the Inland Revenue Department. It cannot be reopened. Proceed?')) {
      return;
    }
    finalizeMutation.mutate(fy);
  };

  if (isLoading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading Fiscal Years...</div>;
  if (isError) return (
    <div className="p-8 text-center text-sm text-red-600 flex flex-col items-center gap-2">
      Failed to load Fiscal Years.
      <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold text-foreground text-sm">Fiscal Year Management</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Define financial periods and control transaction boundaries.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => { setForm({ fiscal_year_name: '', start_date: '', end_date: '', status: 'OPEN' }); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1.5" /> New Fiscal Year
        </Button>
      </div>

      <div className="p-0">
        <table className="table-fluid-grid text-sm">
          <thead className="cell-density bg-muted/10 border-b border-border">
            <tr>
              <th className="cell-density text-left font-semibold text-muted-foreground">Fiscal Year</th>
              <th className="cell-density text-left font-semibold text-muted-foreground">Period</th>
              <th className="cell-density text-center font-semibold text-muted-foreground">State</th>
              <th className="cell-density text-center font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fiscalYears.length === 0 ? (
              <tr>
                <td colSpan={4} className="cell-density text-center text-muted-foreground">
                  No Fiscal Years defined. Create one to begin validating transactions.
                </td>
              </tr>
            ) : (
              fiscalYears.map(fy => (
                <tr key={fy.id} className="hover:bg-muted/5">
                  <td className="cell-density font-medium">{fy.fiscal_year_name}</td>
                  <td className="cell-density text-muted-foreground">
                    {fy.start_date} to {fy.end_date}
                  </td>
                  <td className="cell-density">
                    <div className="flex justify-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        fy.status === 'OPEN' ? 'bg-green-100 text-green-700' : 
                        fy.status === 'SOFT_CLOSED' ? 'bg-yellow-100 text-yellow-700' : 
                        'bg-red-100 text-red-700'
                      }`}>
                        {fy.status}
                      </span>
                    </div>
                  </td>
                  <td className="cell-density">
                    <div className="flex justify-center gap-2">
                      {fy.status === 'SOFT_CLOSED' && (
                        <button 
                          onClick={() => handleFinalize(fy)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Finalize Statutory Audit
                        </button>
                      )}
                      {fy.status !== 'OPEN' && (
                        <button 
                          onClick={() => {
                            if (fy.status === 'HARD_CLOSED') {
                              setReopenDialog(fy);
                            } else if (fy.status === 'SOFT_CLOSED') {
                              setReopenDialog(fy);
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors bg-blue-50 text-blue-600 hover:bg-blue-100"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          Re-Open
                        </button>
                      )}
                      {fy.status === 'OPEN' && (
                        <button 
                          onClick={() => {
                            document.getElementById('closing-wizard')?.scrollIntoView({ behavior: 'smooth' });
                            toast.info('Please use the Closing Wizard below to close a fiscal year.');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors bg-blue-50 text-blue-600 hover:bg-blue-100"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Close Year
                        </button>
                      )}
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
                className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1 .5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date *</Label>
                <DateInput value={form.start_date} 
                  onChange={val => setForm({...form, start_date: val})} 
                  className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1 .5"
                />
              </div>
              <div>
                <Label>End Date *</Label>
                <DateInput value={form.end_date} 
                  onChange={val => setForm({...form, end_date: val})} 
                  className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1 .5"
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/20">
              <div>
                <Label className="text-sm">Set as OPEN Year</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Transactions will be validated against this year.</p>
              </div>
              <Switch checked={form.status === 'OPEN'} onCheckedChange={v => setForm({...form, status: v ? 'OPEN' : 'SOFT_CLOSED'})} />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="default" className="w-full" onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Creating...' : 'Create Period'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reopenDialog} onOpenChange={(v) => !v && setReopenDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Re-Open Closed Year</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-300 p-3 rounded-lg text-sm border border-red-200 dark:border-red-500/20">
              <strong>Warning:</strong> Re-opening a closed fiscal year allows historical modifications. 
              Any changes will trigger an automatic recascading to subsequent years.
            </div>
            <div>
              <Label>Justification Reason *</Label>
              <Input 
                value={reopenReason} 
                onChange={e => setReopenReason(e.target.value)} 
                placeholder="Audit adjustment for Q4..." 
                className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1 .5"
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setReopenDialog(null)}>Cancel</Button>
            <Button variant="default" onClick={handleReopen} disabled={reopenMutation.isPending}>
              {reopenMutation.isPending ? 'Processing...' : 'Confirm Unlock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {fiscalYears.length > 0 && <FiscalYearClosingWizard />}
    </div>
  );
}
