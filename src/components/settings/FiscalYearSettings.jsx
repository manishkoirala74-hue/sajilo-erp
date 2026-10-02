import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sajilo } from '@/api/sajiloClient';
import {
  Plus, Calendar, Unlock, KeyRound, ShieldAlert,
  Trash2, Pencil, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import FiscalYearClosingWizard from './FiscalYearClosingWizard';
import FiscalYearContiguityAdvisor from './FiscalYearContiguityAdvisor';
import DateInput from '@/components/shared/DateInput';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the number of days between two ISO date strings. */
function daysBetween(start, end) {
  return Math.round(
    (new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24)
  );
}

/**
 * Validates the create/correct form fields client-side.
 * Returns an array of error strings (empty = valid).
 */
function validateFyForm(form, fiscalYears, excludeId = null) {
  const errors = [];

  if (!form.fiscal_year_name?.trim()) errors.push('Fiscal year name is required.');
  if (!form.start_date)              errors.push('Start date is required.');
  if (!form.end_date)                errors.push('End date is required.');

  if (form.start_date && form.end_date) {
    if (new Date(form.end_date) <= new Date(form.start_date)) {
      errors.push('End date must be after start date.');
    } else {
      const days = daysBetween(form.start_date, form.end_date);
      if (days < 28)  errors.push(`Fiscal year must span at least 28 days (entered: ${days} days).`);
      if (days > 400) errors.push(`Fiscal year cannot exceed 400 days (entered: ${days} days).`);

      // Client-side overlap check (the RPC also enforces this at DB level)
      const others = fiscalYears.filter(f => f.id !== excludeId);
      const overlapping = others.filter(f => {
        return new Date(form.start_date) <= new Date(f.end_date) &&
               new Date(form.end_date)   >= new Date(f.start_date);
      });
      if (overlapping.length > 0) {
        errors.push(
          `Dates overlap with "${overlapping[0].fiscal_year_name}" (${overlapping[0].start_date} – ${overlapping[0].end_date}).`
        );
      }
    }
  }

  return errors;
}

/**
 * Extracts strict YYYY-MM-DD from a date string or JS Date, 
 * bypassing timezone offset shifts.
 */
const toStrictGregorianDate = (val) => {
  if (!val) return null;
  if (typeof val === 'string') return val.substring(0, 10);
  const d = new Date(val);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FiscalYearSettings() {
  const queryClient = useQueryClient();
  const currentCompanyId = sajilo.getCompanyId();

  // ── Data fetch ──────────────────────────────────────────────────────────
  const { data: fiscalYears = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['Company', currentCompanyId, 'FiscalYear', 'fiscalYears'],
    queryFn: async () => {
      const data = await sajilo.entities.FiscalYear.list('-start_date');
      return data || [];
    },
    enabled: !!currentCompanyId,
  });

  // ── Form state ───────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState({
    fiscal_year_name: '',
    start_date: '',
    end_date: '',
    status: 'OPEN',
  });

  // ── Re-open dialog state ─────────────────────────────────────────────────
  const [reopenDialog, setReopenDialog] = useState(null);
  const [reopenReason, setReopenReason] = useState('');

  // ── Correct-dates dialog state ───────────────────────────────────────────
  const [correctDialog, setCorrectDialog] = useState(null);
  const [correctForm, setCorrectForm] = useState({ start_date: '', end_date: '', reason: '' });

  // ── Delete dialog state ──────────────────────────────────────────────────
  const [deleteDialog, setDeleteDialog] = useState(null);

  const invalidateFY = () =>
    queryClient.invalidateQueries({ predicate: q => q.queryKey.includes('FiscalYear') });

  // ──────────────────────────────────────────────────────────────────────────
  // Mutation: CREATE
  // ──────────────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await sajilo.auth.supabase.rpc('create_new_fiscal_year', {
        p_company_id: currentCompanyId,
        p_name:       form.fiscal_year_name.trim(),
        p_start_date: toStrictGregorianDate(form.start_date),
        p_end_date:   toStrictGregorianDate(form.end_date),
        p_status:     form.status,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Failed to create fiscal year.');
      return data;
    },
    onSuccess: () => {
      toast.success('Fiscal year created successfully.');
      setShowForm(false);
      setShowConfirm(false);
      invalidateFY();
    },
    onError: (e) => toast.error(e.message || 'Failed to create fiscal year.'),
  });

  // Validate → show inline confirm summary before firing the RPC
  const handleSave = () => {
    const errors = validateFyForm(form, fiscalYears);
    if (errors.length > 0) {
      errors.forEach(err => toast.error(err));
      return;
    }
    setShowConfirm(true); // show the styled confirmation summary
  };

  const handleConfirmCreate = () => saveMutation.mutate();

  // ──────────────────────────────────────────────────────────────────────────
  // Mutation: RE-OPEN
  // ──────────────────────────────────────────────────────────────────────────
  const reopenMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await sajilo.auth.supabase.rpc('reopen_fiscal_year', {
        p_company_id: currentCompanyId,
        p_fy_id:      reopenDialog.id,
        p_reason:     reopenReason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Fiscal year unlocked to SOFT_CLOSED state.');
      setReopenDialog(null);
      setReopenReason('');
      invalidateFY();
    },
    onError: (e) => {
      toast.error(e.message || 'Failed to reopen fiscal year.');
    },
  });

  const handleReopen = () => {
    if (!reopenReason.trim()) {
      toast.error('Re-opening requires a justification reason.');
      return;
    }
    reopenMutation.mutate();
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Mutation: HARD CLOSE (finalize)
  // ──────────────────────────────────────────────────────────────────────────
  const finalizeMutation = useMutation({
    mutationFn: async (fy) =>
      sajilo.entities.FiscalYear.update(fy.id, { status: 'HARD_CLOSED' }),
    onSuccess: () => {
      toast.success('Fiscal year HARD_CLOSED permanently.');
      invalidateFY();
    },
    onError: () => toast.error('Failed to finalize fiscal year.'),
  });

  const handleFinalize = (fy) => {
    if (!window.confirm(
      'WARNING: Finalizing to HARD_CLOSED permanently locks all adjusting entries ' +
      'for the Inland Revenue Department. It cannot be reopened. Proceed?'
    )) return;
    finalizeMutation.mutate(fy);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Mutation: CORRECT DATES (audit-logged RPC)
  // ──────────────────────────────────────────────────────────────────────────
  const correctMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await sajilo.auth.supabase.rpc('correct_fiscal_year_dates', {
        p_company_id: currentCompanyId,
        p_fy_id:      correctDialog.id,
        p_new_start:  toStrictGregorianDate(correctForm.start_date),
        p_new_end:    toStrictGregorianDate(correctForm.end_date),
        p_reason:     correctForm.reason,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Failed to correct dates.');
      return data;
    },
    onSuccess: () => {
      toast.success('Fiscal year dates corrected and audit-logged.');
      setCorrectDialog(null);
      setCorrectForm({ start_date: '', end_date: '', reason: '' });
      invalidateFY();
    },
    onError: (e) => toast.error(e.message || 'Failed to correct fiscal year dates.'),
  });

  const handleCorrect = () => {
    if (!correctForm.start_date || !correctForm.end_date) {
      toast.error('Both start date and end date are required.');
      return;
    }
    if (!correctForm.reason.trim()) {
      toast.error('A justification reason is required for date corrections.');
      return;
    }
    const errors = validateFyForm(
      { ...correctForm, fiscal_year_name: correctDialog.fiscal_year_name },
      fiscalYears,
      correctDialog.id
    );
    if (errors.length > 0) {
      errors.forEach(err => toast.error(err));
      return;
    }
    correctMutation.mutate();
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Mutation: DELETE (safe, zero-transaction RPC)
  // ──────────────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await sajilo.auth.supabase.rpc('delete_empty_fiscal_year', {
        p_company_id: currentCompanyId,
        p_fy_id:      deleteDialog.id,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Failed to delete fiscal year.');
      return data;
    },
    onSuccess: (data) => {
      if (data?.no_open_fy) {
        toast.warning(
          `"${deleteDialog.fiscal_year_name}" deleted. ` +
          'You have no active fiscal year. Go to Settings → Fiscal Calendar and Re-Open the correct year.',
          { duration: 8000 }
        );
      } else {
        toast.success(`"${deleteDialog.fiscal_year_name}" deleted successfully.`);
      }
      setDeleteDialog(null);
      invalidateFY();
    },
    onError: (e) => toast.error(e.message || 'Failed to delete fiscal year.'),
  });

  // ── Loading / Error states ────────────────────────────────────────────────
  if (isLoading) return (
    <div className="p-8 text-center text-sm text-muted-foreground">Loading Fiscal Years...</div>
  );
  if (isError) return (
    <div className="p-8 text-center text-sm text-red-600 flex flex-col items-center gap-2">
      Failed to load Fiscal Years.
      <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
    </div>
  );

  // ── Derived: whether a given OPEN FY can be deleted (no txns check is done server-side;
  //            we show the button always for OPEN/SOFT_CLOSED, server will reject with a
  //            clear message if transactions exist) ────────────────────────────────────────
  const isDeletable = (fy) => fy.status !== 'HARD_CLOSED';

  // ────────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-semibold text-foreground text-sm">Fiscal Year Management</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Define financial periods and control transaction boundaries.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setForm({ fiscal_year_name: '', start_date: '', end_date: '', status: 'OPEN' });
            setShowForm(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1.5" /> New Fiscal Year
        </Button>
      </div>

      {/* ── Fiscal Year Table ─────────────────────────────────────────── */}
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
                    <span className="ml-2 text-xs text-muted-foreground/60">
                      ({daysBetween(fy.start_date, fy.end_date)} days)
                    </span>
                  </td>
                  <td className="cell-density">
                    <div className="flex justify-center">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        fy.status === 'OPEN'        ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' :
                        fy.status === 'SOFT_CLOSED' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300' :
                                                      'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
                      }`}>
                        {fy.status}
                      </span>
                    </div>
                  </td>
                  <td className="cell-density">
                    <div className="flex justify-center gap-2 flex-wrap">

                      {/* Finalize (SOFT_CLOSED → HARD_CLOSED) */}
                      {fy.status === 'SOFT_CLOSED' && (
                        <button
                          onClick={() => handleFinalize(fy)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                                     bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Finalize Statutory Audit
                        </button>
                      )}

                      {/* Re-Open (SOFT_CLOSED or HARD_CLOSED) */}
                      {fy.status !== 'OPEN' && (
                        <button
                          onClick={() => setReopenDialog(fy)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                                     bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          Re-Open
                        </button>
                      )}

                      {/* Close Year (OPEN → triggers Closing Wizard scroll) */}
                      {fy.status === 'OPEN' && (
                        <button
                          onClick={() => {
                            document.getElementById('closing-wizard')?.scrollIntoView({ behavior: 'smooth' });
                            toast.info('Use the Closing Wizard below to close a fiscal year.');
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                                     bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Close Year
                        </button>
                      )}

                      {/* Correct Dates (OPEN only — allows fixing wrong dates before any txns) */}
                      {fy.status === 'OPEN' && (
                        <button
                          onClick={() => {
                            setCorrectDialog(fy);
                            setCorrectForm({
                              start_date: fy.start_date,
                              end_date:   fy.end_date,
                              reason:     '',
                            });
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                                     bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Correct Dates
                        </button>
                      )}

                      {/* Delete (OPEN or SOFT_CLOSED, zero-transaction guard enforced server-side) */}
                      {isDeletable(fy) && (
                        <button
                          onClick={() => setDeleteDialog(fy)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                                     bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
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

      {/* ── Contiguity Advisor ───────────────────────────────────────── */}
      {fiscalYears.length > 1 && (
        <div className="px-5 pb-5">
          <FiscalYearContiguityAdvisor fiscalYears={fiscalYears} />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          DIALOG: Create Fiscal Year (form step)
      ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showForm && !showConfirm} onOpenChange={(v) => { if (!v) setShowForm(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Fiscal Year</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Fiscal Year Name *</Label>
              <Input
                value={form.fiscal_year_name}
                onChange={e => setForm({ ...form, fiscal_year_name: e.target.value })}
                placeholder="e.g. FY 2082/2083"
                className="h-10 border border-border bg-background px-3 text-sm rounded-md
                           focus:ring-1 focus:ring-primary outline-none mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date *</Label>
                <DateInput
                  value={form.start_date}
                  onChange={val => setForm({ ...form, start_date: val })}
                  className="h-10 border border-border bg-background px-3 text-sm rounded-md
                             focus:ring-1 focus:ring-primary outline-none mt-1"
                />
              </div>
              <div>
                <Label>End Date *</Label>
                <DateInput
                  value={form.end_date}
                  onChange={val => setForm({ ...form, end_date: val })}
                  className="h-10 border border-border bg-background px-3 text-sm rounded-md
                             focus:ring-1 focus:ring-primary outline-none mt-1"
                />
              </div>
            </div>

            {/* Duration preview */}
            {form.start_date && form.end_date && new Date(form.end_date) > new Date(form.start_date) && (
              <p className="text-xs text-muted-foreground">
                Duration: <span className="font-medium text-foreground">
                  {daysBetween(form.start_date, form.end_date)} days
                </span>
              </p>
            )}

            <div className="flex items-center justify-between p-3 border border-border rounded-lg bg-muted/20">
              <div>
                <Label className="text-sm">Set as OPEN Year</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Transactions will be validated against this year.
                </p>
              </div>
              <Switch
                checked={form.status === 'OPEN'}
                onCheckedChange={v => setForm({ ...form, status: v ? 'OPEN' : 'SOFT_CLOSED' })}
              />
            </div>

            {form.status === 'OPEN' && fiscalYears.some(f => f.status === 'OPEN') && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50
                              dark:bg-amber-500/10 dark:text-amber-300 border border-amber-200
                              dark:border-amber-500/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  The current active year will be automatically moved to{' '}
                  <strong>SOFT_CLOSED</strong> when you proceed.
                </span>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button variant="default" className="w-full" onClick={handleSave}>
              Review &amp; Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════
          DIALOG: Create Confirmation Summary (frosted-glass style)
      ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showConfirm} onOpenChange={(v) => { if (!v) setShowConfirm(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Fiscal Year Creation</DialogTitle>
          </DialogHeader>

          <div className="p-4 rounded-md bg-[#FDFBF7] dark:bg-muted/20 border border-muted/30
                          mb-2 space-y-2 text-sm text-[#2A241F] dark:text-foreground">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-medium">{form.fiscal_year_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Start date:</span>
              <span className="font-medium">{form.start_date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">End date:</span>
              <span className="font-medium">{form.end_date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration:</span>
              <span className="font-medium">{daysBetween(form.start_date, form.end_date)} days</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span className={`font-semibold ${form.status === 'OPEN' ? 'text-green-700' : 'text-yellow-700'}`}>
                {form.status}
              </span>
            </div>

            {form.status === 'OPEN' && (
              <div className="mt-3 pt-3 border-t border-muted/20 text-amber-700
                              dark:text-amber-300 font-medium text-xs flex gap-2 items-start">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                The current active year will be automatically moved to SOFT_CLOSED.
              </div>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
            >
              ← Go Back
            </Button>
            <Button
              variant="default"
              onClick={handleConfirmCreate}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Creating...' : 'Confirm & Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════
          DIALOG: Re-Open
      ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!reopenDialog} onOpenChange={(v) => !v && setReopenDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Re-Open Closed Year</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-300 p-3
                            rounded-lg text-sm border border-red-200 dark:border-red-500/20">
              <strong>Warning:</strong> Re-opening a closed fiscal year allows historical
              modifications. Any changes will trigger an automatic recascading to subsequent years.
            </div>
            <div>
              <Label>Justification Reason *</Label>
              <Input
                value={reopenReason}
                onChange={e => setReopenReason(e.target.value)}
                placeholder="Audit adjustment for Q4..."
                className="h-10 border border-border bg-background px-3 text-sm rounded-md
                           focus:ring-1 focus:ring-primary outline-none mt-1"
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setReopenDialog(null)}>Cancel</Button>
            <Button
              variant="default"
              onClick={handleReopen}
              disabled={reopenMutation.isPending}
            >
              {reopenMutation.isPending ? 'Processing...' : 'Confirm Unlock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════
          DIALOG: Correct Dates (OPEN year, zero-transaction guard in RPC)
      ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!correctDialog} onOpenChange={(v) => !v && setCorrectDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Correct Fiscal Year Dates</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50
                            dark:bg-amber-500/10 dark:text-amber-300 border border-amber-200
                            dark:border-amber-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                This corrects the date boundaries for{' '}
                <strong>{correctDialog?.fiscal_year_name}</strong>.
                The operation is blocked if any journal entries already exist in this year's window.
                All date corrections are audit-logged.
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>New Start Date *</Label>
                <DateInput
                  value={correctForm.start_date}
                  onChange={val => setCorrectForm(f => ({ ...f, start_date: val }))}
                  className="h-10 border border-border bg-background px-3 text-sm rounded-md
                             focus:ring-1 focus:ring-primary outline-none mt-1"
                />
              </div>
              <div>
                <Label>New End Date *</Label>
                <DateInput
                  value={correctForm.end_date}
                  onChange={val => setCorrectForm(f => ({ ...f, end_date: val }))}
                  className="h-10 border border-border bg-background px-3 text-sm rounded-md
                             focus:ring-1 focus:ring-primary outline-none mt-1"
                />
              </div>
            </div>

            {correctForm.start_date && correctForm.end_date &&
              new Date(correctForm.end_date) > new Date(correctForm.start_date) && (
                <p className="text-xs text-muted-foreground">
                  New duration:{' '}
                  <span className="font-medium text-foreground">
                    {daysBetween(correctForm.start_date, correctForm.end_date)} days
                  </span>
                </p>
            )}

            <div>
              <Label>Justification Reason *</Label>
              <Input
                value={correctForm.reason}
                onChange={e => setCorrectForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Wrong year entered — correcting to Shrawan 1 – Chaitra end..."
                className="h-10 border border-border bg-background px-3 text-sm rounded-md
                           focus:ring-1 focus:ring-primary outline-none mt-1"
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setCorrectDialog(null)}>Cancel</Button>
            <Button
              variant="default"
              onClick={handleCorrect}
              disabled={correctMutation.isPending}
            >
              {correctMutation.isPending ? 'Saving...' : 'Save Correction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════
          DIALOG: Delete Fiscal Year
      ══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!deleteDialog} onOpenChange={(v) => !v && setDeleteDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Fiscal Year</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-start gap-3 bg-red-50 dark:bg-red-500/10 border
                            border-red-200 dark:border-red-500/20 rounded-xl p-4">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                  Delete &quot;{deleteDialog?.fiscal_year_name}&quot;?
                </p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                  This action is permanent and cannot be undone. The server will reject
                  deletion if <strong>any</strong> journal entries, invoices, or vouchers
                  exist within this fiscal year's date window. Only years with{' '}
                  <strong>zero transactions</strong> can be deleted.
                </p>
                {deleteDialog?.status === 'OPEN' && (
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-2 font-medium">
                    Because this year is currently OPEN, deleting it will leave the system with
                    no active fiscal year. You will need to explicitly Re-Open the correct year
                    before any new transactions can be posted.
                  </p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete Fiscal Year'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Closing Wizard ───────────────────────────────────────────── */}
      {fiscalYears.length > 0 && <FiscalYearClosingWizard />}
    </div>
  );
}
