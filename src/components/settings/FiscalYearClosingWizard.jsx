import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { AlertTriangle, CheckCircle2, ArrowRight, DatabaseBackup } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

export default function FiscalYearClosingWizard() {
  const [fiscalYears, setFiscalYears] = useState([]);
  const [closingYearId, setClosingYearId] = useState('');
  const [targetYearId, setTargetYearId] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [preFlightDrafts, setPreFlightDrafts] = useState(null);

  const fetchData = async () => {
    try {
      const data = await sajilo.entities.FiscalYear.list('-start_date');
      setFiscalYears(data);
    } catch (e) {
      toast.error('Failed to load Fiscal Years');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const runPreflight = async () => {
    if (!closingYearId) return;
    const fy = fiscalYears.find(f => f.id === closingYearId);
    if (!fy) return;

    try {
      const { count, error } = await sajilo.auth.supabase
        .from('GeneralLedgerJournal')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', sajilo.getCompanyId())
        .neq('status', 'Posted')
        .gte('entry_date', fy.start_date)
        .lte('entry_date', fy.end_date);
        
      if (error) throw error;
      setPreFlightDrafts(count || 0);
    } catch (e) {
      console.error(e);
      toast.error('Failed to run pre-flight checks');
    }
  };

  useEffect(() => {
    runPreflight();
  }, [closingYearId]);

  const executeClosing = async () => {
    if (!closingYearId || !targetYearId) {
      toast.error('Select both closing and target years');
      return;
    }
    if (closingYearId === targetYearId) {
      toast.error('Target year must be different from closing year');
      return;
    }
    if (preFlightDrafts > 0) {
      toast.error(`Cannot close: there are ${preFlightDrafts} pending vouchers.`);
      return;
    }

    if (!window.confirm('WARNING: This will zero out all Revenue and Expense accounts, roll forward Asset/Liability balances, snapshot inventory, and permanently LOCK the closing year. Are you absolutely sure?')) {
      return;
    }

    setProcessing(true);
    try {
      const { data, error } = await sajilo.auth.supabase.rpc('close_and_open_fiscal_year', {
        p_company_id: sajilo.getCompanyId(),
        p_closing_fy_id: closingYearId,
        p_new_fy_id: targetYearId
      });

      if (error) throw error;

      toast.success('Fiscal Year closed successfully! Balances rolled forward.');
      setClosingYearId('');
      setTargetYearId('');
      fetchData(); // Refresh UI states
    } catch (e) {
      console.error(e);
      toast.error('Error during Year-End Close: ' + e.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return null;

  const openYears = fiscalYears.filter(f => !f.is_locked);
  
  return (
    <div className="bg-card border border-border rounded-xl p-5 mt-6">
      <div className="flex items-center gap-2 mb-4">
        <DatabaseBackup className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h3 className="font-semibold text-foreground text-sm">Automated Year-End Closing Wizard</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        The closing wizard will zero out temporary accounts (Revenue/Expenses) into Retained Earnings, 
        roll forward permanent balances (Assets/Liabilities), carry over inventory, and lock the period.
      </p>

      <div className="grid grid-cols-2 gap-8 items-start relative">
        <div className="space-y-4">
          <label className="text-sm font-medium block">Year to Close</label>
          <Select value={closingYearId} onValueChange={setClosingYearId}>
            <SelectTrigger><SelectValue placeholder="Select Year" /></SelectTrigger>
            <SelectContent>
              {openYears.map(fy => (
                <SelectItem key={fy.id} value={fy.id}>{fy.fiscal_year_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {closingYearId && preFlightDrafts !== null && (
            <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${preFlightDrafts > 0 ? 'bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-500/20' : 'bg-green-50 dark:bg-green-500/10 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-500/20'}`}>
              {preFlightDrafts > 0 ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
              <div>
                <strong className="block mb-0.5">Pre-flight Check</strong>
                {preFlightDrafts > 0 
                  ? `Found ${preFlightDrafts} draft/pending journals. Please post or delete them before closing.`
                  : 'All journals are posted. Ready for closing.'}
              </div>
            </div>
          )}
        </div>

        <div className="absolute left-1/2 top-10 -translate-x-1/2 text-muted-foreground/50">
          <ArrowRight className="w-6 h-6" />
        </div>

        <div className="space-y-4">
          <label className="text-sm font-medium block">Target New Year (Roll Forward)</label>
          <Select value={targetYearId} onValueChange={setTargetYearId}>
            <SelectTrigger><SelectValue placeholder="Select Target Year" /></SelectTrigger>
            <SelectContent>
              {fiscalYears.map(fy => (
                <SelectItem key={fy.id} value={fy.id} disabled={fy.id === closingYearId}>{fy.fiscal_year_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-8 flex justify-end pt-5 border-t border-border">
        <Button 
          className="bg-indigo-600 hover:bg-indigo-700 text-white" 
          onClick={executeClosing}
          disabled={processing || !closingYearId || !targetYearId || preFlightDrafts > 0}
        >
          {processing ? 'Executing Closing Protocol...' : 'Execute Year-End Close'}
        </Button>
      </div>
    </div>
  );
}
