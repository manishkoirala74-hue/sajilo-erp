import { useState, useEffect, useCallback } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Persist a single CompanySettings field (JSON value) for the active company.
 * Uses upsert so it works whether or not a row exists yet.
 */
async function saveField(companyId, field, value) {
  const { error } = await sajilo.auth.supabase
    .from('CompanySettings')
    .upsert(
      { company_id: companyId, [field]: value },
      { onConflict: 'company_id' }
    );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Sub-component: one editable list panel (departments OR designations)
// ---------------------------------------------------------------------------

function ListPanel({ title, items, onSave, isSaving }) {
  const [list, setList] = useState(items);
  const [newValue, setNewValue] = useState('');
  const [editIndex, setEditIndex] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Keep local state in sync when parent re-fetches
  useEffect(() => {
    setList(items);
  }, [items]);

  // ── Add ──────────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    if (list.map((s) => s.toLowerCase()).includes(trimmed.toLowerCase())) {
      toast.error(`"${trimmed}" already exists.`);
      return;
    }
    const next = [...list, trimmed];
    try {
      await onSave(next);
      setList(next);
      setNewValue('');
      toast.success(`"${trimmed}" added.`);
    } catch {
      // onSave already shows toast
    }
  };

  const handleAddKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (idx) => {
    const removing = list[idx];
    const next = list.filter((_, i) => i !== idx);
    try {
      await onSave(next);
      setList(next);
      toast.success(`"${removing}" removed.`);
    } catch {
      // onSave already shows toast
    }
  };

  // ── Edit (inline) ────────────────────────────────────────────────────────
  const startEdit = (idx) => {
    setEditIndex(idx);
    setEditValue(list[idx]);
  };

  const cancelEdit = () => {
    setEditIndex(null);
    setEditValue('');
  };

  const confirmEdit = async (idx) => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    if (
      list
        .filter((_, i) => i !== idx)
        .map((s) => s.toLowerCase())
        .includes(trimmed.toLowerCase())
    ) {
      toast.error(`"${trimmed}" already exists.`);
      return;
    }
    const next = list.map((item, i) => (i === idx ? trimmed : item));
    try {
      await onSave(next);
      setList(next);
      setEditIndex(null);
      setEditValue('');
      toast.success('Updated successfully.');
    } catch {
      // onSave already shows toast
    }
  };

  const handleEditKeyDown = (e, idx) => {
    if (e.key === 'Enter') confirmEdit(idx);
    if (e.key === 'Escape') cancelEdit();
  };

  return (
    <div className="flex flex-col gap-3 flex-1 min-w-0">
      {/* Panel header */}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>

      {/* Scrollable item list */}
      <div className="border rounded-lg overflow-hidden">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No {title.toLowerCase()} added yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((item, idx) => (
              <li
                key={idx}
                className="flex items-center gap-2 px-3 py-2 group hover:bg-muted/40 transition-colors"
              >
                {editIndex === idx ? (
                  /* ── Inline edit row ── */
                  <>
                    <Input
                      className="h-7 text-sm flex-1"
                      value={editValue}
                      autoFocus
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => handleEditKeyDown(e, idx)}
                    />
                    <button
                      className="text-green-600 hover:text-green-700 disabled:opacity-40"
                      onClick={() => confirmEdit(idx)}
                      disabled={isSaving}
                      aria-label="Confirm rename"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={cancelEdit}
                      aria-label="Cancel rename"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  /* ── Display row ── */
                  <>
                    <span className="flex-1 text-sm truncate">{item}</span>
                    <button
                      className="text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => startEdit(idx)}
                      aria-label={`Edit ${item}`}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className="text-destructive hover:text-destructive/80 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40"
                      onClick={() => handleDelete(idx)}
                      disabled={isSaving}
                      aria-label={`Delete ${item}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add new item row */}
      <div className="flex gap-2">
        <Input
          className="h-8 text-sm"
          placeholder={`New ${title.replace('s', '').toLowerCase()}…`}
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleAddKeyDown}
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={handleAdd}
          disabled={isSaving || !newValue.trim()}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          <span className="ml-1">Add</span>
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DepartmentSettings() {
  const { activeCompany } = useAuth();
  const companyId = activeCompany?.id;

  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Fetch existing settings ──────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;

    const fetchSettings = async () => {
      setLoading(true);
      try {
        const { data, error } = await sajilo.auth.supabase
          .from('CompanySettings')
          .select('hr_departments, hr_designations')
          .eq('company_id', companyId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setDepartments(
            Array.isArray(data.hr_departments) ? data.hr_departments : (typeof data.hr_departments === 'string' ? JSON.parse(data.hr_departments || '[]') : [])
          );
          setDesignations(
            Array.isArray(data.hr_designations) ? data.hr_designations : (typeof data.hr_designations === 'string' ? JSON.parse(data.hr_designations || '[]') : [])
          );
        }
      } catch (err) {
        console.error('DepartmentSettings fetch error:', err);
        toast.error('Failed to load settings.');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [companyId]);

  // ── Persist helpers (memoised so ListPanel receives stable refs) ─────────
  const saveDepartments = useCallback(
    async (next) => {
      setSaving(true);
      try {
        await saveField(companyId, 'hr_departments', next);
        setDepartments(next);
      } catch (err) {
        console.error('Save departments error:', err);
        toast.error('Failed to save departments.');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [companyId]
  );

  const saveDesignations = useCallback(
    async (next) => {
      setSaving(true);
      try {
        await saveField(companyId, 'hr_designations', next);
        setDesignations(next);
      } catch (err) {
        console.error('Save designations error:', err);
        toast.error('Failed to save designations.');
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [companyId]
  );

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section description */}
      <div>
        <Label className="text-base font-semibold">
          Departments &amp; Designations
        </Label>
        <p className="text-sm text-muted-foreground mt-1">
          Define the departments and job designations available across your
          company. Changes take effect immediately for new employee records.
        </p>
      </div>

      {/* Side-by-side panels */}
      <div className="flex flex-col sm:flex-row gap-6">
        <ListPanel
          title="Departments"
          items={departments}
          onSave={saveDepartments}
          isSaving={saving}
        />
        <ListPanel
          title="Designations"
          items={designations}
          onSave={saveDesignations}
          isSaving={saving}
        />
      </div>
    </div>
  );
}
