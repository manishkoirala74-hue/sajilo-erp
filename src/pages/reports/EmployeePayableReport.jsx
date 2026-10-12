import React, { useState, useEffect, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { FileText, Users } from 'lucide-react';
import { format } from 'date-fns';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { ReportPageTemplate, StandardReportTable } from '@/components/reports';

export default function EmployeePayableReport() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    fromDate: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
    toDate: format(new Date(), 'yyyy-MM-dd'),
  });

  const load = async () => {
    setLoading(true);
    try {
      // Query GeneralLedgerLine where entity_type = 'Employee'
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
    } catch (err) {
      console.error('[EmployeePayableReport error]', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totalBalance = useMemo(() => (data || []).reduce((s, r) => s + (r.balance || 0), 0), [data]);

  const columns = useMemo(() => [
    { key: 'code', label: 'Emp Code', preset: 'code', stickyFirst: true },
    { key: 'name', label: 'Employee Name', preset: 'description' },
    { key: 'dept', label: 'Department', preset: 'category' },
    { 
      key: 'balance', 
      label: 'Net Salary Payable (NPR)', 
      preset: 'amount',
      render: (v) => (
        <span className="font-mono text-xs tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
          {Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      )
    }
  ], []);

  const footer = useMemo(() => {
    if (!data || data.length === 0) return null;
    return {
      code: 'TOTAL',
      name: '',
      dept: '',
      balance: totalBalance
    };
  }, [data, totalBalance]);

  return (
    <ReportPageTemplate
      title="Employee Payable Balances"
      subtitle="Unliquidated net wages and salaries owed to employees"
      category="Payable"
      icon={Users}
      fromDate={filters.fromDate}
      toDate={filters.toDate}
      isLoading={loading}
      onRefresh={load}
      exportConfig={{
        columns,
        data,
        footer,
        filename: `Employee_Payable_Balances_${filters.fromDate}_${filters.toDate}`,
      }}
      filterSlot={
        <ReportFilterBar
          filters={filters}
          onChange={setFilters}
          onApply={load}
          showApplyButton
        />
      }
    >
      <StandardReportTable
        columns={columns}
        data={data}
        loading={loading}
        footer={footer}
        emptyMessage="No outstanding employee payables found."
      />
    </ReportPageTemplate>
  );
}
