import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Lock, Search, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { adToBS, bsToAD, BS_MONTHS, isValidBSDate, formatBS } from '@/lib/nepaliDate';

// ── Inline AD/BS Date Picker ────────────────────────────────────────────────
function DatePickerWithToggle({ value, onChange, label }) {
  const [mode, setMode] = useState('AD');
  const [bsY, setBsY] = useState('');
  const [bsM, setBsM] = useState('');
  const [bsD, setBsD] = useState('');

  // Sync BS fields when AD value changes externally
  useEffect(() => {
    if (mode === 'BS' && value) {
      const bs = adToBS(value);
      if (bs) { setBsY(String(bs.year)); setBsM(String(bs.month)); setBsD(String(bs.day)); }
    }
  }, [value, mode]);

  const handleModeToggle = (newMode) => {
    setMode(newMode);
    if (newMode === 'BS' && value) {
      const bs = adToBS(value);
      if (bs) { setBsY(String(bs.year)); setBsM(String(bs.month)); setBsD(String(bs.day)); }
    }
  };

  const handleBSChange = (y, m, d) => {
    const yr = parseInt(y || bsY); const mo = parseInt(m || bsM); const dy = parseInt(d || bsD);
    if (isValidBSDate(yr, mo, dy)) {
      const ad = bsToAD(yr, mo, dy);
      if (ad) onChange(ad);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label>{label}</Label>
        <div className="flex text-xs border border-border rounded overflow-hidden">
          {['AD', 'BS'].map(m => (
            <button key={m} type="button"
              onClick={() => handleModeToggle(m)}
              className={cn('px-2 py-0.5 transition-colors', mode === m ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              {m}
            </button>
          ))}
        </div>
      </div>
      {mode === 'AD' ? (
        <Input type="date" value={value || ''} onChange={e => onChange(e.target.value)} />
      ) : (
        <div className="flex gap-1">
          <Input placeholder="YYYY" value={bsY} onChange={e => { setBsY(e.target.value); handleBSChange(e.target.value, bsM, bsD); }} className="w-20 font-mono text-sm" maxLength={4} />
          <select value={bsM} onChange={e => { setBsM(e.target.value); handleBSChange(bsY, e.target.value, bsD); }}
            className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">Month</option>
            {BS_MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <Input placeholder="DD" value={bsD} onChange={e => { setBsD(e.target.value); handleBSChange(bsY, bsM, e.target.value); }} className="w-14 font-mono text-sm" maxLength={2} />
        </div>
      )}
      {mode === 'BS' && value && (() => { const bs = adToBS(value); return bs ? <p className="text-xs text-muted-foreground mt-1">AD: {value} · BS: {formatBS(bs)}</p> : null; })()}
    </div>
  );
}

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense', 'COGS', 'OPEX'];

const suggestNormalBalance = (type) =>
  ['Asset', 'COGS', 'OPEX', 'Cost of Goods Sold', 'Expense'].includes(type) ? 'Debit' : 'Credit';

// ── Flat searchable group picker ───────────────────────────────────────────────
function GroupPicker({ groups, value, onChange }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return groups.filter(g =>
      !q || g.account_name.toLowerCase().includes(q) || g.account_code?.toLowerCase().includes(q)
    );
  }, [groups, search]);

  return (
    <div className="border border-input rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-input bg-muted/20">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder="Search group…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="max-h-44 overflow-y-auto divide-y divide-border/40">
        {/* None option */}
        <button
          type="button"
          onClick={() => onChange('')}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/30 transition-colors',
            !value && 'bg-primary/5 font-medium text-primary'
          )}
        >
          <span className="text-muted-foreground italic">— None (Top-level) —</span>
        </button>
        {filtered.map(g => (
          <button
            key={g.id}
            type="button"
            onClick={() => onChange(g.id)}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/30 transition-colors',
              value === g.id && 'bg-primary/5 font-medium text-primary'
            )}
            style={{ paddingLeft: `${12 + (g._depth || 0) * 16}px` }}
          >
            {g._depth > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />}
            <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{g.account_code}</span>
            <span className="flex-1">{g.account_name}</span>
            {g.is_system_account && <Lock className="w-3 h-3 text-slate-400 shrink-0" />}
            <span className="text-[10px] text-muted-foreground shrink-0">{g.account_type}</span>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground italic px-3 py-3">No groups found</p>
        )}
      </div>
    </div>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────
export default function AccountFormModal({ open, onClose, account, parentAccounts, onSaved, defaultParent }) {
  const isEdit = !!account?.id;
  // Only Group Ledgers marked as system are locked — Sub Ledgers are always editable
  const isSystemAccount = !!account?.is_system_account && account?.ledger_type === 'Group Ledger';

  const [form,   setForm]   = useState({});
  const [saving, setSaving] = useState(false);

  // Flatten all Group Ledgers with depth for display
  const allGroups = useMemo(() => {
    const groups = parentAccounts.filter(a => a.ledger_type === 'Group Ledger');
    // Build id→children map
    const byParent = {};
    groups.forEach(g => {
      const pid = g.parent_account_id || '__root__';
      if (!byParent[pid]) byParent[pid] = [];
      byParent[pid].push(g);
    });
    // DFS to assign depth
    const result = [];
    const walk = (pid, depth) => {
      (byParent[pid] || []).forEach(g => {
        result.push({ ...g, _depth: depth });
        walk(g.id, depth + 1);
      });
    };
    walk('__root__', 0);
    return result;
  }, [parentAccounts]);

  useEffect(() => {
    if (!open) return;
    if (account) {
      setForm({ ...account });
    } else {
      // Inherit type from defaultParent
      const parentType = defaultParent?.account_type || 'Asset';
      const today = new Date().toISOString().split('T')[0];
      setForm({
        account_code:       '',
        account_name:       '',
        account_type:       parentType,
        account_subtype:    '',
        ledger_type:        'Sub Ledger',
        normal_balance:     suggestNormalBalance(parentType),
        parent_account_id:  defaultParent?.id   || '',
        parent_account_name: defaultParent?.account_name || '',
        ifrs_reference:     '',
        is_active:          true,
        is_system_account:  false,
        description:        '',
        creation_date:      today,
        opening_balance:    0,
        opening_balance_type: 'Dr',
      });
    }
  }, [open, account, defaultParent]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const isGroup = form.ledger_type === 'Group Ledger';

  const handleParentChange = async (parentId) => {
    const parent = parentAccounts.find(a => a.id === parentId);
    set('parent_account_id',   parentId);
    set('parent_account_name', parent?.account_name || '');
    // Inherit account type from parent
    if (parent?.account_type) {
      set('account_type', parent.account_type);
      set('normal_balance', suggestNormalBalance(parent.account_type));
    }
    // Auto-suggest code
    if (!parentId || !parent?.account_code) return;
    const allAccounts = await sajilo.entities.ChartOfAccount.list('account_code', 500);
    const baseCode = parseInt(parent.account_code, 10);
    if (isNaN(baseCode)) return;
    if (isGroup) {
      const siblings = allAccounts.filter(a => a.parent_account_id === parentId && a.ledger_type === 'Group Ledger');
      set('account_code', String(baseCode + (siblings.length + 1) * 10));
    } else {
      const siblings = allAccounts.filter(a => a.parent_account_id === parentId && a.ledger_type === 'Sub Ledger');
      set('account_code', String(baseCode + siblings.length + 1));
    }
  };

  const handleSave = async () => {
    if (!form.account_name?.trim()) { toast.error('Account name is required'); return; }
    if (!form.account_type)         { toast.error('Account type is required');  return; }
    setSaving(true);
    try {
      const { 
        id, 
        created_at,
        created_by,
        updated_at,
        updated_by,
        opening_balance, 
        opening_balance_type, 
        creation_date, 
        opening_date,
        parentAccount,
        _children,
        ...payload 
      } = form;

      if (!isGroup && opening_balance) {
        payload.current_balance = opening_balance;
      }

      if (isEdit) {
        await sajilo.entities.ChartOfAccount.update(account.id, payload);
        toast.success('Account updated');
      } else {
        const created = await sajilo.entities.ChartOfAccount.create(payload);
        toast.success(isGroup ? 'Group created' : 'Ledger created');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error('Failed to save account: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? 'Edit' : 'New'} {isGroup ? 'Ledger Group' : 'Ledger Account'}
            {isSystemAccount && (
              <span className="flex items-center gap-1 text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded border">
                <Lock className="w-3 h-3" /> System — Read Only
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {isSystemAccount ? (
          <div className="py-6 text-center text-muted-foreground text-sm">
            <Lock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            This is a system-defined IFRS account and cannot be modified.
          </div>
        ) : (
          <div className="space-y-4 mt-2">

            {/* Treated as Group checkbox */}
            <div className={cn(
              'flex items-start gap-3 rounded-lg border px-3 py-3 cursor-pointer transition-colors',
              isGroup ? 'bg-primary/5 border-primary/30' : 'bg-muted/20 border-border'
            )}>
              <Checkbox
                id="treated_as_group"
                checked={isGroup}
                onCheckedChange={v => {
                  set('ledger_type', v ? 'Group Ledger' : 'Sub Ledger');
                  if (form.parent_account_id) handleParentChange(form.parent_account_id);
                }}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="treated_as_group" className="cursor-pointer font-semibold">
                  Treated as Group
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isGroup
                    ? 'This will be a Group / Sub-Group — no journal postings allowed directly.'
                    : 'This will be a Ledger Account — journal entries can be posted to it.'}
                </p>
              </div>
            </div>

            {/* Name + Code */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>{isGroup ? 'Group Name' : 'Ledger Name'} *</Label>
                <Input
                  className="mt-1"
                  value={form.account_name || ''}
                  onChange={e => set('account_name', e.target.value)}
                  placeholder={isGroup ? 'e.g. Current Assets' : 'e.g. Cash in Hand'}
                  autoFocus
                />
              </div>
              <div>
                <Label>Account Code</Label>
                <Input
                  className="mt-1 font-mono"
                  value={form.account_code || ''}
                  onChange={e => set('account_code', e.target.value)}
                  placeholder="Auto-suggested"
                />
              </div>
              <div>
                <Label>Account Type *</Label>
                <select
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.account_type || ''}
                  onChange={e => { set('account_type', e.target.value); set('normal_balance', suggestNormalBalance(e.target.value)); }}
                >
                  {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Under (parent group) */}
            <div>
              <Label>Under (Parent Group)</Label>
              <div className="mt-1">
                <GroupPicker
                  groups={allGroups}
                  value={form.parent_account_id || ''}
                  onChange={handleParentChange}
                />
              </div>
              {form.parent_account_name && (
                <p className="text-xs text-muted-foreground mt-1">
                  Will be created under: <span className="font-medium text-foreground">{form.parent_account_name}</span>
                  {isGroup && ' as a Sub-Group'}
                </p>
              )}
            </div>

            {/* Creation Date (AD/BS toggle) */}
            <DatePickerWithToggle
              label="Creation Date"
              value={form.creation_date || ''}
              onChange={v => set('creation_date', v)}
            />

            {/* Opening Balance — Sub Ledger only (not Group) */}
            {!isGroup && (
              <div>
                <Label>Opening Balance <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="number"
                    className="flex-1"
                    value={form.opening_balance ?? 0}
                    onChange={e => set('opening_balance', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                  <select
                    value={form.opening_balance_type || 'Dr'}
                    onChange={e => set('opening_balance_type', e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="Dr">Dr (Debit)</option>
                    <option value="Cr">Credit</option>
                  </select>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Set an opening balance for this ledger account.</p>
              </div>
            )}

            {/* Description */}
            <div>
              <Label>Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                className="mt-1"
                value={form.description || ''}
                onChange={e => set('description', e.target.value)}
                placeholder="Brief purpose of this account"
              />
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between border rounded-lg px-3 py-2.5">
              <Label className="cursor-pointer">Active</Label>
              <Switch checked={!!form.is_active} onCheckedChange={v => set('is_active', v)} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : (isEdit ? 'Update' : isGroup ? 'Create Group' : 'Create Ledger')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}