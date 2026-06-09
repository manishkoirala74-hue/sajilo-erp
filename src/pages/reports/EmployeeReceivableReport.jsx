import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import { FileText } from 'lucide-react';

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

export default function EmployeeReceivableReport() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // We query GeneralLedgerLine where entity_type = 'Employee'
      // We should filter for Asset accounts or just calculate Net Debit Balance
      const res = await sajilo.auth.supabase
        .from('GeneralLedgerLine')
        .select(`
          entity_id,
          debit_amount,
          credit_amount,
          account_type,
          Employee:entity_id (full_name, employee_code, department)
        `)
        .eq('entity_type', 'Employee')
        .in('account_type', ['Asset', 'Current Asset']); 
      
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
        // Receivable balance = Debit (Given/Owed) - Credit (Recovered)
        balances[r.entity_id].balance += (r.debit_amount - r.credit_amount);
      });

      const arr = Object.values(balances).filter(b => b.balance !== 0);
      setData(arr);
      setLoading(false);
    }
    load();
  }, []);

  const columns = [
    { key: 'code', label: 'Emp Code' },
    { key: 'name', label: 'Employee Name' },
    { key: 'dept', label: 'Department' },
    { key: 'balance', label: 'Advances / Receivables Due', render: v => <span className="font-bold text-orange-600">{fmt(v)}</span> }
  ];

  return (
    <div>
      <PageHeader title="Employee Receivable Balances" subtitle="Outstanding advances and receivables due from employees" icon={FileText} />
      <DataTable columns={columns} data={data} searchKey="name" loading={loading} />
    </div>
  );
}
