import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Edit2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import DataTable from '@/components/shared/DataTable';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULTS = [
  {
    leave_type: 'Annual',
    display_name: 'Annual Leave',
    annual_accrual: 18,
    max_carry_forward: 15,
    is_paid: true,
  },
  {
    leave_type: 'Sick',
    display_name: 'Sick Leave',
    annual_accrual: 12,
    max_carry_forward: 0,
    is_paid: true,
  },
  {
    leave_type: 'Maternity',
    display_name: 'Maternity Leave',
    annual_accrual: 60,
    max_carry_forward: 0,
    is_paid: true,
  },
];

const EMPTY_FORM = {
  leave_type: '',
  display_name: '',
  annual_accrual: 0,
  max_carry_forward: 0,
  is_paid: true,
};

// ---------------------------------------------------------------------------
// Small helper: paid / unpaid badge
// ---------------------------------------------------------------------------

function PaidBadge({ paid }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        paid
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
      }`}
    >
      {paid ? 'Paid' : 'Unpaid'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Add / Edit Dialog
// ---------------------------------------------------------------------------

function PolicyDialog({ open, onClose, onSave, initial, isSaving }) {
  const [form, setForm] = useState(EMPTY_FORM);

  // Populate form when dialog opens
  useEffect(() => {
    if (open) {
      setForm(initial ?? EMPTY_FORM);
    }
  }, [open, initial]);

  const set = (field, value) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();

    const trimmedType = form.leave_type.trim();
    const trimmedName = form.display_name.trim();

    if (!trimmedType) {
      toast.error('Leave type key is required.');
      return;
    }
    if (!trimmedName) {
      toast.error('Display name is required.');
      return;
    }

    onSave({
      ...form,
      leave_type: trimmedType,
      display_name: trimmedName,
      annual_accrual: Number(form.annual_accrual) || 0,
      max_carry_forward: Number(form.max_carry_forward) || 0,
    });
  };

  const isEdit = Boolean(initial?.id);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Edit Leave Policy' : 'Add Leave Policy'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Leave Type key */}
          <div className="space-y-1.5">
            <Label htmlFor="lp-type">
              Leave Type Key{' '}
              <span className="text-muted-foreground font-normal">
                (e.g. Annual, Sick)
              </span>
            </Label>
            <Input
              id="lp-type"
              value={form.leave_type}
              onChange={(e) => set('leave_type', e.target.value)}
              placeholder="Annual"
              disabled={isEdit} // key is immutable after creation
              className={isEdit ? 'bg-muted cursor-not-allowed' : ''}
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Leave type key cannot be changed after creation.
              </p>
            )}
          </div>

          {/* Display Name */}
          <div className="space-y-1.5">
            <Label htmlFor="lp-name">Display Name</Label>
            <Input
              id="lp-name"
              value={form.display_name}
              onChange={(e) => set('display_name', e.target.value)}
              placeholder="Annual Leave"
            />
          </div>

          {/* Annual Accrual */}
          <div className="space-y-1.5">
            <Label htmlFor="lp-accrual">Annual Accrual (days)</Label>
            <Input
              id="lp-accrual"
              inputMode="decimal"
              value={form.annual_accrual}
              onChange={(e) => set('annual_accrual', e.target.value)}
              placeholder="18"
            />
          </div>

          {/* Max Carry Forward */}
          <div className="space-y-1.5">
            <Label htmlFor="lp-carry">Max Carry Forward (days)</Label>
            <Input
              id="lp-carry"
              inputMode="decimal"
              value={form.max_carry_forward}
              onChange={(e) => set('max_carry_forward', e.target.value)}
              placeholder="0"
            />
          </div>

          {/* Is Paid switch */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Paid Leave</p>
              <p className="text-xs text-muted-foreground">
                Employees receive salary during this leave
              </p>
            </div>
            <Switch
              checked={form.is_paid}
              onCheckedChange={(v) => set('is_paid', v)}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              {isEdit ? 'Update' : 'Add Policy'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function LeavePolicySettings() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;

  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null → add mode

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchPolicies = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const { data, error } = await sajilo.auth.supabase
        .from('LeavePolicy')
        .select('*')
        .eq('company_id', companyId)
        .order('leave_type', { ascending: true });

      if (error) throw error;
      setPolicies(data ?? []);
    } catch (err) {
      console.error('LeavePolicySettings fetch error:', err);
      toast.error('Failed to load leave policies.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // ── Save (add / edit) ────────────────────────────────────────────────────
  const handleSave = async (formData) => {
    setSaving(true);
    try {
      const payload = {
        ...formData,
        company_id: companyId,
      };

      // If editing an existing record include its id
      if (editTarget?.id) {
        payload.id = editTarget.id;
      }

      const { error } = await sajilo.auth.supabase
        .from('LeavePolicy')
        .upsert(payload, { onConflict: editTarget?.id ? 'id' : 'company_id,leave_type' });

      if (error) throw error;

      toast.success(
        editTarget
          ? 'Leave policy updated.'
          : `"${formData.display_name}" policy added.`
      );
      setDialogOpen(false);
      setEditTarget(null);
      await fetchPolicies();
    } catch (err) {
      console.error('LeavePolicySettings save error:', err);
      toast.error('Failed to save leave policy.');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (policy) => {
    if (
      !window.confirm(
        `Delete "${policy.display_name}" leave policy? This cannot be undone.`
      )
    )
      return;

    try {
      const { error } = await sajilo.auth.supabase
        .from('LeavePolicy')
        .delete()
        .eq('id', policy.id);

      if (error) throw error;
      toast.success(`"${policy.display_name}" deleted.`);
      await fetchPolicies();
    } catch (err) {
      console.error('LeavePolicySettings delete error:', err);
      toast.error('Failed to delete leave policy.');
    }
  };

  // ── Seed defaults ────────────────────────────────────────────────────────
  const handleSeedDefaults = async () => {
    setSaving(true);
    try {
      const rows = DEFAULTS.map((d) => ({ ...d, company_id: companyId }));
      const { error } = await sajilo.auth.supabase
        .from('LeavePolicy')
        .upsert(rows, { onConflict: 'company_id,leave_type' });

      if (error) throw error;
      toast.success('Default leave policies loaded.');
      await fetchPolicies();
    } catch (err) {
      console.error('Seed defaults error:', err);
      toast.error('Failed to load default policies.');
    } finally {
      setSaving(false);
    }
  };

  // ── DataTable column definitions ─────────────────────────────────────────
  const columns = [
    {
      header: 'Leave Type',
      accessorKey: 'leave_type',
      cell: ({ row }) => (
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
          {row.original.leave_type}
        </span>
      ),
    },
    {
      header: 'Display Name',
      accessorKey: 'display_name',
    },
    {
      header: 'Annual Accrual',
      accessorKey: 'annual_accrual',
      cell: ({ row }) => (
        <span>{row.original.annual_accrual} days</span>
      ),
    },
    {
      header: 'Max Carry Forward',
      accessorKey: 'max_carry_forward',
      cell: ({ row }) => (
        <span>{row.original.max_carry_forward} days</span>
      ),
    },
    {
      header: 'Is Paid',
      accessorKey: 'is_paid',
      cell: ({ row }) => <PaidBadge paid={row.original.is_paid} />,
    },
    {
      header: 'Actions',
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => {
              setEditTarget(row.original);
              setDialogOpen(true);
            }}
            aria-label="Edit policy"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => handleDelete(row.original)}
            aria-label="Delete policy"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Section description */}
      <div>
        <Label className="text-base font-semibold">Leave Policies</Label>
        <p className="text-sm text-muted-foreground mt-1">
          Configure leave types, annual entitlements, carry-forward limits, and
          pay status. These policies drive leave balances and approvals across
          the system.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => {
            setEditTarget(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Policy
        </Button>

        {policies.length === 0 && !loading && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleSeedDefaults}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Load Defaults
          </Button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : policies.length === 0 ? (
        <div className="border rounded-lg py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No leave policies configured yet.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Click <strong>Load Defaults</strong> to get started or{' '}
            <strong>Add Policy</strong> to create a custom one.
          </p>
        </div>
      ) : (
        <DataTable columns={columns} data={policies} />
      )}

      {/* Add / Edit Dialog */}
      <PolicyDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditTarget(null);
        }}
        onSave={handleSave}
        initial={editTarget}
        isSaving={saving}
      />
    </div>
  );
}
