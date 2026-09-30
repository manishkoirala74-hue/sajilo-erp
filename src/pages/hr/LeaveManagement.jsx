import { useState, useEffect, useCallback } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { Plus, CheckCircle, XCircle, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import DateInput from '@/components/shared/DateInput';

// ─── helpers ────────────────────────────────────────────────────────────────

function calcDays(from, to) {
  if (!from || !to) return 0;
  const diff = new Date(to) - new Date(from);
  return diff < 0 ? 0 : Math.round(diff / 86400000) + 1;
}

const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Rejected'];

// ─── component ───────────────────────────────────────────────────────────────

export default function LeaveManagement() {
  const { activeCompany, user } = useAuth();
  const companyId = activeCompany?.id;

  // ── shared data ─────────────────────────────────────────────────────────
  const [employees, setEmployees] = useState([]);
  const [leavePolicies, setLeavePolicies] = useState([]);

  // ── tab 1 – requests ────────────────────────────────────────────────────
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');

  // new-request dialog
  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    employee_id: '',
    leave_type: '',
    from_date: '',
    to_date: '',
    reason: '',
  });
  const [newSaving, setNewSaving] = useState(false);

  // reject dialog
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null); // row
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSaving, setRejectSaving] = useState(false);

  // ── tab 2 – balances ────────────────────────────────────────────────────
  const [balances, setBalances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [fiscalYearFilter, setFiscalYearFilter] = useState('');
  const [fiscalYears, setFiscalYears] = useState([]);

  // ── fetch helpers ────────────────────────────────────────────────────────

  const fetchSharedData = useCallback(async () => {
    if (!companyId) return;
    const [{ data: empData, error: empErr }, { data: policyData, error: policyErr }] =
      await Promise.all([
        sajilo.auth.supabase.from('Employee')
          .select('id, full_name')
          .eq('company_id', companyId)
          .order('full_name'),
        sajilo.auth.supabase.from('LeavePolicy')
          .select('id, leave_type')
          .eq('company_id', companyId)
          .order('leave_type'),
      ]);
    if (empErr) toast.error('Failed to load employees');
    else setEmployees(empData ?? []);
    if (policyErr) toast.error('Failed to load leave policies');
    else setLeavePolicies(policyData ?? []);
  }, [companyId]);

  const fetchRequests = useCallback(async () => {
    if (!companyId) return;
    setRequestsLoading(true);
    try {
      let query = sajilo.auth.supabase.from('LeaveRequest')
        .select(
          `id, leave_type, from_date, to_date, days, reason, status, rejected_reason,
           Employee:employee_id ( id, full_name )`
        )
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'All') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRequests(data ?? []);
    } catch (err) {
      toast.error('Failed to load leave requests');
    } finally {
      setRequestsLoading(false);
    }
  }, [companyId, statusFilter]);

  const fetchBalances = useCallback(async () => {
    if (!companyId) return;
    setBalancesLoading(true);
    try {
      let query = sajilo.auth.supabase.from('LeaveLedger')
        .select('employee_id, leave_type, days, fiscal_year, Employee:employee_id ( full_name )')
        .eq('company_id', companyId);

      if (fiscalYearFilter) {
        query = query.eq('fiscal_year', fiscalYearFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // collect distinct fiscal years for the filter pill
      const years = [...new Set((data ?? []).map((r) => r.fiscal_year).filter(Boolean))].sort(
        (a, b) => b.localeCompare(a)
      );
      setFiscalYears(years);

      // group by employee_id + leave_type
      const map = {};
      for (const row of data ?? []) {
        const key = `${row.employee_id}||${row.leave_type}`;
        if (!map[key]) {
          map[key] = {
            employee_id: row.employee_id,
            employee_name: row.Employee?.full_name ?? '—',
            leave_type: row.leave_type,
            balance: 0,
          };
        }
        map[key].balance += row.days ?? 0;
      }
      setBalances(Object.values(map).sort((a, b) =>
        a.employee_name.localeCompare(b.employee_name)
      ));
    } catch (err) {
      toast.error('Failed to load leave balances');
    } finally {
      setBalancesLoading(false);
    }
  }, [companyId, fiscalYearFilter]);

  // ── effects ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchSharedData();
  }, [fetchSharedData]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  // ── new-request form ─────────────────────────────────────────────────────

  const newDays = calcDays(newForm.from_date, newForm.to_date);

  function handleNewField(field, value) {
    setNewForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmitRequest() {
    if (!newForm.employee_id) return toast.error('Select an employee');
    if (!newForm.leave_type) return toast.error('Select a leave type');
    if (!newForm.from_date || !newForm.to_date)
      return toast.error('Select from and to dates');
    if (newDays <= 0) return toast.error('To Date must be after From Date');

    setNewSaving(true);
    try {
      const { error } = await sajilo.auth.supabase.from('LeaveRequest').insert({
        company_id: companyId,
        employee_id: newForm.employee_id,
        leave_type: newForm.leave_type,
        from_date: newForm.from_date,
        to_date: newForm.to_date,
        days: newDays,
        reason: newForm.reason || null,
        status: 'Pending',
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success('Leave request submitted');
      setNewOpen(false);
      setNewForm({ employee_id: '', leave_type: '', from_date: '', to_date: '', reason: '' });
      fetchRequests();
    } catch (err) {
      toast.error(err.message ?? 'Failed to submit request');
    } finally {
      setNewSaving(false);
    }
  }

  // ── approve ──────────────────────────────────────────────────────────────

  async function handleApprove(row) {
    try {
      const { error } = await sajilo.auth.supabase.rpc('rpc_approve_leave', {
        p_request_id: row.id,
        p_approved_by: user?.id,
      });
      if (error) throw error;
      toast.success(`Leave approved for ${row.Employee?.full_name ?? 'employee'}`);
      fetchRequests();
      fetchBalances();
    } catch (err) {
      toast.error(err.message ?? 'Failed to approve leave');
    }
  }

  // ── reject ───────────────────────────────────────────────────────────────

  function openRejectDialog(row) {
    setRejectTarget(row);
    setRejectReason('');
    setRejectOpen(true);
  }

  async function handleReject() {
    if (!rejectReason.trim()) return toast.error('Enter a rejection reason');
    setRejectSaving(true);
    try {
      const { error } = await sajilo.auth.supabase.from('LeaveRequest')
        .update({
          status: 'Rejected',
          rejected_reason: rejectReason.trim(),
          rejected_by: user?.id ?? null,
        })
        .eq('id', rejectTarget.id);
      if (error) throw error;
      toast.success(`Leave rejected for ${rejectTarget.Employee?.full_name ?? 'employee'}`);
      setRejectOpen(false);
      setRejectTarget(null);
      fetchRequests();
    } catch (err) {
      toast.error(err.message ?? 'Failed to reject leave');
    } finally {
      setRejectSaving(false);
    }
  }

  // ── columns ──────────────────────────────────────────────────────────────

  const requestColumns = [
    {
      key: 'employee',
      label: 'Employee',
      render: (val, row) => row.Employee?.full_name ?? '—',
    },
    { key: 'leave_type', label: 'Leave Type' },
    { key: 'from_date', label: 'From', render: (val, row) => row.from_date ?? '—' },
    { key: 'to_date', label: 'To', render: (val, row) => row.to_date ?? '—' },
    {
      key: 'days',
      label: 'Days',
      render: (val, row) => (
        <span className="font-medium tabular-nums">{row.days ?? '—'}</span>
      ),
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (val, row) => (
        <span className="max-w-[180px] truncate block text-muted-foreground text-sm">
          {row.reason ?? '—'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (val, row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (val, row) => {
        if (row.status !== 'Pending') return null;
        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              className="bg-green-600 hover:bg-green-700 text-white h-7 px-2 text-xs"
              onClick={() => handleApprove(row)}
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-red-400 text-red-600 hover:bg-red-50 h-7 px-2 text-xs"
              onClick={() => openRejectDialog(row)}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Reject
            </Button>
          </div>
        );
      },
    },
  ];

  const balanceColumns = [
    { key: 'employee_name', label: 'Employee' },
    { key: 'leave_type', label: 'Leave Type' },
    {
      key: 'balance',
      label: 'Balance (Days)',
      render: (val, row) => (
        <span
          className={`font-semibold tabular-nums ${
            row.balance < 0 ? 'text-red-600' : 'text-green-700'
          }`}
        >
          {row.balance}
        </span>
      ),
    },
  ];

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Leave Management"
        subtitle="Manage employee leave requests and view leave balances"
      />

      <Tabs defaultValue="requests" className="w-full">
        {/* ── Tab List ── */}
        <TabsList className="mb-4 gap-1 bg-transparent p-0">
          {['requests', 'balances'].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="capitalize rounded-md px-4 py-1.5 text-sm font-medium
                         data-[state=inactive]:bg-muted data-[state=inactive]:text-muted-foreground
                         data-[state=active]:bg-background data-[state=active]:shadow-sm
                         data-[state=active]:border border-border transition-all"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ══════════════ TAB 1 – REQUESTS ══════════════ */}
        <TabsContent value="requests" className="mt-0 space-y-4">
          {/* toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* filter pills */}
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors
                    ${
                      statusFilter === f
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:bg-muted/70'
                    }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* new request button */}
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => setNewOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              New Request
            </Button>
          </div>

          <DataTable
            columns={requestColumns}
            data={requests}
            loading={requestsLoading}
            emptyMessage="No leave requests found."
          />
        </TabsContent>

        {/* ══════════════ TAB 2 – BALANCES ══════════════ */}
        <TabsContent value="balances" className="mt-0 space-y-4">
          {/* fiscal year filter */}
          <div className="flex items-center gap-3">
            <Label className="shrink-0 text-sm">Fiscal Year</Label>
            <Select
              value={fiscalYearFilter || 'all'}
              onValueChange={(v) => setFiscalYearFilter(v === 'all' ? '' : v)}
            >
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="All years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {fiscalYears.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border">
            <DataTable
              columns={balanceColumns}
              data={balances}
              loading={balancesLoading}
              emptyMessage="No leave balances found."
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* ══════════════ DIALOG – NEW REQUEST ══════════════ */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>New Leave Request</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* employee */}
            <div className="space-y-1.5">
              <Label htmlFor="nr-employee">Employee</Label>
              <Select
                value={newForm.employee_id}
                onValueChange={(v) => handleNewField('employee_id', v)}
              >
                <SelectTrigger id="nr-employee" className="w-full">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* leave type */}
            <div className="space-y-1.5">
              <Label htmlFor="nr-leave-type">Leave Type</Label>
              <Select
                value={newForm.leave_type}
                onValueChange={(v) => handleNewField('leave_type', v)}
              >
                <SelectTrigger id="nr-leave-type" className="w-full">
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {leavePolicies.map((p) => (
                    <SelectItem key={p.id} value={p.leave_type}>
                      {p.leave_type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* date range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nr-from">From Date</Label>
                <DateInput
                  id="nr-from"
                  value={newForm.from_date}
                  onChange={(v) => handleNewField('from_date', v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nr-to">To Date</Label>
                <DateInput
                  id="nr-to"
                  value={newForm.to_date}
                  onChange={(v) => handleNewField('to_date', v)}
                />
              </div>
            </div>

            {/* computed days */}
            {(newForm.from_date || newForm.to_date) && (
              <p className="text-sm text-muted-foreground">
                Total days:{' '}
                <span className="font-semibold text-foreground">{newDays}</span>
              </p>
            )}

            {/* reason */}
            <div className="space-y-1.5">
              <Label htmlFor="nr-reason">Reason</Label>
              <Textarea
                id="nr-reason"
                placeholder="Optional reason for leave…"
                rows={3}
                value={newForm.reason}
                onChange={(e) => handleNewField('reason', e.target.value)}
              />
            </div>

            {/* actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setNewOpen(false)}
                disabled={newSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSubmitRequest} disabled={newSaving}>
                {newSaving ? 'Submitting…' : 'Submit Request'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════ DIALOG – REJECT REASON ══════════════ */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {rejectTarget && (
              <p className="text-sm text-muted-foreground">
                Rejecting leave for{' '}
                <span className="font-semibold text-foreground">
                  {rejectTarget.Employee?.full_name ?? 'employee'}
                </span>{' '}
                ({rejectTarget.from_date} → {rejectTarget.to_date})
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Rejection Reason</Label>
              <Textarea
                id="reject-reason"
                placeholder="Enter reason for rejection…"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setRejectOpen(false)}
                disabled={rejectSaving}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={rejectSaving}
              >
                {rejectSaving ? 'Rejecting…' : 'Confirm Reject'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
