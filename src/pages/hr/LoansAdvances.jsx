import { useState, useEffect, useCallback, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { Plus, Award, TrendingDown, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import DateInput from '@/components/shared/DateInput';

export default function LoansAdvances() {
  const { activeCompany } = useAuth();
  const [loans, setLoans] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('All');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form State
  const [editId, setEditId] = useState(null);
  const [employeeId, setEmployeeId] = useState('');
  const [loanType, setLoanType] = useState('Salary Advance');
  const [principalAmount, setPrincipalAmount] = useState('');
  const [outstandingAmount, setOutstandingAmount] = useState('');
  const [monthlyDeduction, setMonthlyDeduction] = useState('');
  const [disbursementDate, setDisbursementDate] = useState('');
  const [status, setStatus] = useState('Active');
  const [notes, setNotes] = useState('');

  const fetchLoans = useCallback(async () => {
    if (!activeCompany?.id) return;
    setLoading(true);
    try {
      const { data, error } = await sajilo.auth.supabase
        .from('EmployeeLoan')
        .select('*, Employee(full_name, employee_code)')
        .eq('company_id', activeCompany.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLoans(data || []);
    } catch (err) {
      toast.error('Failed to load loans: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [activeCompany?.id]);

  const fetchEmployees = useCallback(async () => {
    if (!activeCompany?.id) return;
    try {
      const { data, error } = await sajilo.auth.supabase
        .from('Employee')
        .select('id, full_name, employee_code')
        .eq('company_id', activeCompany.id)
        .order('full_name');
      if (error) throw error;
      setEmployees(data || []);
    } catch (err) {
      // ignore
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    fetchLoans();
    fetchEmployees();
  }, [fetchLoans, fetchEmployees]);

  const handleOpenNew = () => {
    setEditId(null);
    setEmployeeId('');
    setLoanType('Salary Advance');
    setPrincipalAmount('');
    setOutstandingAmount('');
    setMonthlyDeduction('');
    setDisbursementDate('');
    setStatus('Active');
    setNotes('');
    setOpen(true);
  };

  const handleOpenEdit = (loan) => {
    setEditId(loan.id);
    setEmployeeId(loan.employee_id);
    setLoanType(loan.loan_type);
    setPrincipalAmount(loan.principal_amount);
    setOutstandingAmount(loan.outstanding_amount);
    setMonthlyDeduction(loan.monthly_deduction);
    setDisbursementDate(loan.disbursement_date);
    setStatus(loan.status);
    setNotes(loan.notes || '');
    setOpen(true);
  };

  const handleSave = async () => {
    if (!employeeId || !principalAmount || !monthlyDeduction) {
      toast.error('Please fill required fields');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        company_id: activeCompany.id,
        employee_id: employeeId,
        loan_type: loanType,
        principal_amount: Number(principalAmount),
        outstanding_amount: editId ? Number(outstandingAmount) : Number(principalAmount),
        monthly_deduction: Number(monthlyDeduction),
        disbursement_date: disbursementDate || null,
        status: editId ? status : 'Active',
        notes: notes,
      };

      if (editId) {
        const { error } = await sajilo.auth.supabase
          .from('EmployeeLoan')
          .update(payload)
          .eq('id', editId);
        if (error) throw error;
        toast.success('Loan updated');
      } else {
        const { error } = await sajilo.auth.supabase
          .from('EmployeeLoan')
          .insert(payload);
        if (error) throw error;
        toast.success('Loan created');
      }
      setOpen(false);
      fetchLoans();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredLoans = useMemo(() => {
    if (filter === 'All') return loans;
    return loans.filter(l => l.status === filter);
  }, [loans, filter]);

  // Stats
  const activeLoansCount = loans.filter(l => l.status === 'Active').length;
  const totalOutstanding = loans.filter(l => l.status === 'Active').reduce((sum, l) => sum + Number(l.outstanding_amount), 0);
  const totalMonthlyDed = loans.filter(l => l.status === 'Active').reduce((sum, l) => sum + Number(l.monthly_deduction), 0);

  const columns = [
    { label: 'Employee', key: 'employee', render: (val, row) => row.Employee?.full_name || 'Unknown' },
    { label: 'Loan Type', key: 'loan_type' },
    { label: 'Principal', key: 'principal_amount', render: (val, row) => `NPR ${Number(row.principal_amount).toLocaleString()}` },
    { label: 'Outstanding', key: 'outstanding_amount', render: (val, row) => `NPR ${Number(row.outstanding_amount).toLocaleString()}` },
    { label: 'Monthly Ded.', key: 'monthly_deduction', render: (val, row) => `NPR ${Number(row.monthly_deduction).toLocaleString()}` },
    { label: 'Disbursement', key: 'disbursement_date' },
    { label: 'Status', key: 'status', render: (val, row) => <StatusBadge status={row.status} /> },
    { 
      label: 'Actions', 
      key: 'actions',
      render: (val, row) => (
        <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(row)}>
          <Eye className="w-4 h-4 mr-2" /> View/Edit
        </Button>
      )
    }
  ];

  return (
    <div className="flex flex-col h-full gap-4 p-6">
      <PageHeader 
        title="Loans & Advances" 
        subtitle="Manage employee salary advances and personal loans."
        action={handleOpenNew}
        actionLabel="Add Loan"
        actionIcon={Plus}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
        <div className="bg-card border rounded-xl p-4 flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-700 rounded-lg">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Active Loans</p>
            <p className="text-2xl font-bold">{activeLoansCount}</p>
          </div>
        </div>
        <div className="bg-card border rounded-xl p-4 flex items-center gap-4">
          <div className="p-3 bg-orange-100 text-orange-700 rounded-lg">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Outstanding</p>
            <p className="text-2xl font-bold">NPR {totalOutstanding.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-card border rounded-xl p-4 flex items-center gap-4">
          <div className="p-3 bg-green-100 text-green-700 rounded-lg">
            <TrendingDown className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Monthly Deduction</p>
            <p className="text-2xl font-bold">NPR {totalMonthlyDed.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-2">
        {['All', 'Active', 'Paid Off', 'Defaulted'].map(f => (
          <Button 
            key={f} 
            variant={filter === f ? 'default' : 'outline'} 
            size="sm" 
            className="rounded-full"
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
      </div>

      <div className="flex-1 min-h-0 bg-card rounded-xl border">
        <DataTable columns={columns} data={filteredLoans} searchKey="loan_type" loading={loading} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Loan' : 'Add Loan'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={employeeId} onValueChange={setEmployeeId} disabled={!!editId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Loan Type</Label>
              <Select value={loanType} onValueChange={setLoanType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Salary Advance">Salary Advance</SelectItem>
                  <SelectItem value="Personal Loan">Personal Loan</SelectItem>
                  <SelectItem value="Emergency Loan">Emergency Loan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Principal Amount (NPR)</Label>
                <Input type="number" inputMode="decimal" value={principalAmount} onChange={e => setPrincipalAmount(e.target.value)} disabled={!!editId} />
              </div>
              <div className="space-y-2">
                <Label>Monthly Deduction (NPR)</Label>
                <Input type="number" inputMode="decimal" value={monthlyDeduction} onChange={e => setMonthlyDeduction(e.target.value)} />
              </div>
            </div>
            {editId && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Outstanding Amount</Label>
                  <Input type="number" inputMode="decimal" value={outstandingAmount} onChange={e => setOutstandingAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Paid Off">Paid Off</SelectItem>
                      <SelectItem value="Defaulted">Defaulted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Disbursement Date</Label>
              <DateInput value={disbursementDate} onChange={setDisbursementDate} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
