import { useState, useEffect, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Play, Eye, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import { getMonthPeriod, getTodayBS, BS_MONTHS } from '@/lib/nepaliDate';
import { useAuth } from '@/lib/AuthContext';

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;
const MONTHS_AD = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function PayrollRuns() {
  const { activeCompany } = useAuth();
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState([]);
  
  const [calendarView, setCalendarView] = useState('BS');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (activeCompany?.id) {
      sajilo.auth.supabase.from('CompanySettings').select('hr_attendance_calendar').eq('id', activeCompany.id).single()
        .then(({ data }) => {
          const cal = data?.hr_attendance_calendar || 'BS';
          setCalendarView(cal);
          setMonth(String(cal === 'BS' ? getTodayBS()?.month || 1 : new Date().getMonth() + 1));
          setYear(String(cal === 'BS' ? getTodayBS()?.year || 2083 : new Date().getFullYear()));
        });
      fetchData();
    }
  }, [activeCompany?.id]);

  const fetchData = async () => {
    setLoading(true);
    const data = await sajilo.entities.PayrollRun.list('-created_at', 50);
    setRuns(data);
    setLoading(false);
  };

  const periodObj = useMemo(() => {
    if (!month || !year) return null;
    return getMonthPeriod(calendarView, parseInt(year), parseInt(month));
  }, [calendarView, year, month]);

  const runPayroll = async () => {
    if (!periodObj) return;
    setProcessing(true);
    try {
      const { data, error } = await sajilo.auth.supabase.rpc('process_payroll_run', {
        p_company_id: activeCompany.id,
        p_period_start: periodObj.startAD,
        p_period_end: periodObj.endAD,
        p_period_label: periodObj.label,
        p_calendar: calendarView,
        p_bs_year: calendarView === 'BS' ? periodObj.year : null,
        p_bs_month: calendarView === 'BS' ? periodObj.month : null
      });

      if (error) throw error;
      toast.success(`Payroll Draft generated for ${periodObj.label}. Please review before posting.`);
      setOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to process payroll');
    } finally {
      setProcessing(false);
    }
  };

  const postPayroll = async (runId) => {
    try {
      const { error } = await sajilo.auth.supabase.rpc('post_payroll_run', { p_run_id: runId });
      if (error) throw error;
      toast.success('Payroll posted to General Ledger and attendance locked.');
      fetchData();
    } catch (error) {
      toast.error('Failed to post payroll: ' + error.message);
    }
  };

  const openView = async (row) => {
    setSelected(row);
    setViewOpen(true);
    const result = await sajilo.entities.PayrollRunDetail.filter({ payroll_run_id: row.id }, 'employee_name', 500);
    setDetails(result);
  };

  const columns = [
    { key: 'run_reference', label: 'Reference' },
    { key: 'period_label', label: 'Period' },
    { key: 'employee_count', label: 'Employees', render: v => `${v} emp` },
    { key: 'total_gross', label: 'Gross Payroll', render: v => fmt(v) },
    { key: 'total_deductions', label: 'Deductions', render: v => fmt(v) },
    { key: 'total_net', label: 'Net Payable', render: v => <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmt(v)}</span> },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (_, row) => (
      <div className="flex gap-2 justify-end">
        {row.status === 'Draft' && (
          <Button size="sm" variant="default" onClick={() => postPayroll(row.id)}>
            <CheckCircle className="w-4 h-4 mr-2" /> Post
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => openView(row)}>
          <Eye className="w-4 h-4" />
        </Button>
      </div>
    )}
  ];

  const monthOptions = calendarView === 'BS' ? BS_MONTHS : MONTHS_AD;
  const yearOptions = calendarView === 'BS' ? [2081, 2082, 2083, 2084] : [2025, 2026, 2027];

  return (
    <div>
      <PageHeader title="Payroll Runs" subtitle="Process and view monthly payroll"
        action={() => setOpen(true)} actionLabel="Run Payroll" actionIcon={Play} />

      <DataTable columns={columns} data={runs} searchKey="period_label" loading={loading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Process Payroll ({calendarView})</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{monthOptions.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{yearOptions.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">This will generate a Draft payroll based on Attendance records. You can review the LOP deductions before posting it to the GL.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={runPayroll} disabled={processing}>
                {processing ? 'Processing...' : 'Generate Draft'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Payslips — {selected?.period_label}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Gross Payroll', val: fmt(selected.total_gross), color: 'text-foreground' },
                  { label: 'Total Deductions', val: fmt(selected.total_deductions), color: 'text-orange-600 dark:text-orange-400' },
                  { label: 'Net Payable', val: fmt(selected.total_net), color: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Status', val: selected.status, color: 'text-muted-foreground' },
                ].map(s => (
                  <div key={s.label} className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`font-bold text-sm ${s.color}`}>{s.val}</p>
                  </div>
                ))}
              </div>
              <table className="table-fluid-grid text-xs border rounded-lg overflow-hidden w-full text-left">
                <thead className="bg-muted/50"><tr>
                  <th className="p-2 border-b">Employee</th>
                  <th className="p-2 border-b text-right">Base Salary</th>
                  <th className="p-2 border-b text-right">LOP Days</th>
                  <th className="p-2 border-b text-right">LOP Ded.</th>
                  <th className="p-2 border-b text-right font-semibold">Net</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {details.map((p, i) => {
                    const breakdown = typeof p.deductions_breakdown === 'string' ? JSON.parse(p.deductions_breakdown || '{}') : (p.deductions_breakdown || {});
                    return (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="p-2 font-medium">{p.employee_name}</td>
                        <td className="p-2 text-right">{fmt(p.base_salary)}</td>
                        <td className="p-2 text-right">{breakdown['LOP Days'] || 0}</td>
                        <td className="p-2 text-right text-orange-600 dark:text-orange-400">{fmt(breakdown['LOP Amount'] || 0)}</td>
                        <td className="p-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{fmt(p.net_payable)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}