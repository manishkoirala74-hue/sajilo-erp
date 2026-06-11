import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Play, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function PayrollRuns() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState([]);
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [processing, setProcessing] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const data = await sajilo.entities.PayrollRun.list('-created_date', 50);
    setRuns(data);
    setLoading(false);
  };

  const runPayroll = async () => {
    setProcessing(true);
    const m = parseInt(month);
    const y = parseInt(year);
    const label = `${MONTHS[m - 1]} ${y}`;

    try {
      const authSession = await sajilo.auth.getSession();
      const company_id = authSession?.company_id;
      if(!company_id) throw new Error("No active company found in session");

      const { data, error } = await sajilo.auth.supabase.rpc('process_payroll_run', {
        p_company_id: company_id,
        p_month: m,
        p_year: y,
        p_label: label
      });

      if (error) throw error;

      toast.success(`Payroll processed atomically for ${label}. GL Journal Posted.`);
      setOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.message || 'Failed to process payroll');
    } finally {
      setProcessing(false);
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
    { key: 'total_pf', label: 'Total PF', render: v => fmt(v) },
    { key: 'total_tds', label: 'Total TDS', render: v => fmt(v) },
    { key: 'total_net', label: 'Net Payable', render: v => <span className="font-semibold text-emerald-600 dark:text-emerald-400">{fmt(v)}</span> },
    { key: 'status', label: 'Status', render: v => <StatusBadge status={v} /> },
    { key: 'id', label: '', render: (_, row) => (
      <Button size="sm" variant="ghost" onClick={() => openView(row)}>
        <Eye className="w-4 h-4" />
      </Button>
    )}
  ];

  return (
    <div>
      <PageHeader title="Payroll Runs" subtitle="Process and view monthly payroll"
        action={() => setOpen(true)} actionLabel="Run Payroll" actionIcon={Play} />

      <DataTable columns={columns} data={runs} searchKey="period_label" loading={loading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Process Payroll</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">This will execute the PostgreSQL RPC to calculate salaries based on dynamic components and post the balanced General Ledger Journal automatically.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={runPayroll} disabled={processing}>
                {processing ? 'Processing...' : 'Process & Post'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Payslips — {selected?.period_label}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Gross Payroll', val: fmt(selected.total_gross), color: 'text-foreground' },
                  { label: 'Total PF', val: fmt(selected.total_pf), color: 'text-amber-600 dark:text-amber-400' },
                  { label: 'Total TDS', val: fmt(selected.total_tds), color: 'text-orange-600 dark:text-orange-400' },
                  { label: 'Net Payable', val: fmt(selected.total_net), color: 'text-emerald-600 dark:text-emerald-400' },
                ].map(s => (
                  <div key={s.label} className="bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`font-bold text-sm ${s.color}`}>{s.val}</p>
                  </div>
                ))}
              </div>
              <table className="w-full text-xs border rounded-lg overflow-hidden">
                <thead className="bg-muted/50"><tr>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Deductions</th>
                  <th className="px-3 py-2 text-right font-semibold">Net</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {details.map((p, i) => (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{p.employee_name}</td>
                      <td className="px-3 py-2 text-right">{fmt(p.gross_pay)}</td>
                      <td className="px-3 py-2 text-right text-orange-600 dark:text-orange-400">{fmt(p.total_deductions)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{fmt(p.net_payable)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}