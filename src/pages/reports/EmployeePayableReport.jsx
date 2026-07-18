import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import { FileText } from 'lucide-react';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { format } from 'date-fns';

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

export default function EmployeePayableReport() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    fromDate: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
    toDate: format(new Date(), 'yyyy-MM-dd'),
  });

  const load = async () => {
      setLoading(true);
      // We query GeneralLedgerLine where entity_type = 'Employee' and credit_amount > debit_amount (Net Payables)
      const res = await sajilo.auth.supabase
        .from('GeneralLedgerLine')
        .select(`
          entity_id,
          debit_amount,
          credit_amount,
          Employee:entity_id (full_name, employee_code, department)
        `)
        .eq('entity_type', 'Employee');
      
      const balances = {};
      res.data?.forEach(r => {
        if (!r.entity_id) return;
        if (!balances[r.entity_id]) {
          balances[r.entity_id] = {
            id: r.entity_id,
            name: r.Employee?.full_name || 'Unknown',
            code: r.Employee?.employee_code || '-',
            dept: r.Employee?.department || '-',
            balance: 0
          };
        }
        // Payable balance = Credit (Owed) - Debit (Paid)
        balances[r.entity_id].balance += (r.credit_amount - r.debit_amount);
      });

      const arr = Object.values(balances).filter(b => b.balance !== 0);
      setData(arr);
      setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const columns = [
    { key: 'code', label: 'Emp Code' },
    { key: 'name', label: 'Employee Name' },
    { key: 'dept', label: 'Department' },
    { key: 'balance', label: 'Net Salary Payable', render: v => <span className="font-bold text-emerald-600 dark:text-emerald-400">{fmt(v)}</span> }
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Employee Payable Balances" subtitle="Unliquidated net wages owed to employees" icon={FileText} />
      <ReportFilterBar filters={filters} onChange={setFilters} onApply={load} showApplyButton />
      <DataTable columns={columns} data={data} searchKey="name" loading={loading} />
    </div>
  );
}
