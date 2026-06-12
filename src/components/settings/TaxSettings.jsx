import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { invalidateTaxCache } from '@/lib/taxService';
import { Plus, Pencil, Trash2, CheckCircle2, AlertCircle, Percent } from 'lucide-react';
import SearchableSelect from '@/components/shared/SearchableSelect';

/**
 * TaxSettings — Settings → Tax & VAT
 *
 * Manages TaxType records. Each TaxType has its own GL ledger account
 * (auto-created or manually linked). Replaces the global gl_vat_payable_id
 * setting and the hardcoded 0.13 throughout the system.
 */
export default function TaxSettings() {
  const [taxTypes, setTaxTypes]       = useState([]);
  const [subAccounts, setSubAccounts] = useState([]);
  const [groupAccounts, setGroupAccounts] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [form, setForm]               = useState(null);   // null = no form open
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(null);

  const emptyForm = {
    tax_name: '', tax_code: '', tax_rate: 13, tax_type: 'Exclusive',
    applies_to: 'Both', gl_account_id: '', gl_account_name: '',
    sort_order: 10, is_compound: false,
    is_default: false, is_active: true, description: '',
    _create_ledger: false, _parent_group_id: '',
  };

  const loadAll = async () => {
    setLoading(true);
    const [types, subs, groups] = await Promise.all([
      sajilo.entities.TaxType.filter({ is_active: true }, 'tax_name', 50).catch(() => []),
      sajilo.entities.ChartOfAccount.filter({ ledger_type: 'Sub Ledger',   is_active: true }, 'account_name', 300),
      sajilo.entities.ChartOfAccount.filter({ ledger_type: 'Group Ledger', is_active: true }, 'account_code', 300),
    ]);
    setTaxTypes(types);
    setSubAccounts(subs);
    setGroupAccounts(groups.filter(g => g.account_type === 'Liability'));
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const openNew  = () => setForm({ ...emptyForm });
  const openEdit = (t) => setForm({ ...emptyForm, ...t, _create_ledger: false, _parent_group_id: '' });
  const closeForm = () => setForm(null);

  const sf = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    if (!form.tax_name.trim()) { toast.error('Tax name is required'); return; }
    if (!form.tax_rate || form.tax_rate < 0) { toast.error('Tax rate must be ≥ 0'); return; }
    setSaving(true);

    try {
      let glAccountId   = form.gl_account_id   || null;
      let glAccountName = form.gl_account_name || '';

      // Auto-create a GL Sub Ledger if the user toggled the option
      if (form._create_ledger && form._parent_group_id) {
        const parent = groupAccounts.find(g => g.id === form._parent_group_id);
        if (!parent) throw new Error('Parent group not found');

        // Derive next code
        const allAccs = await sajilo.entities.ChartOfAccount.list('account_code', 2000);
        const prefix  = (parent.account_code || '').replace(/\D/g, '');
        const children = allAccs.filter(a => {
          const code = (a.account_code || '').replace(/\D/g, '');
          return code.startsWith(prefix) && code.length > prefix.length;
        });
        const maxNum  = children.length
          ? Math.max(...children.map(a => parseInt((a.account_code || '').replace(/\D/g, ''), 10) || 0))
          : parseInt(prefix + '00', 10);
        const nextCode = String(maxNum + 1);

        const newAcc = await sajilo.entities.ChartOfAccount.create({
          account_code:    nextCode,
          account_name:    form.tax_name,
          account_type:    'Liability',
          ledger_type:     'Sub Ledger',
          normal_balance:  'Credit',
          parent_account_id:   parent.id,
          parent_account_name: parent.account_name,
          is_active:       true,
          is_system_account: false,
          current_balance: 0,
          description:     `Auto-created tax payable ledger for ${form.tax_name}`,
        });
        glAccountId   = newAcc.id;
        glAccountName = newAcc.account_name;
      } else if (form.gl_account_id) {
        const acc = subAccounts.find(a => a.id === form.gl_account_id);
        glAccountName = acc?.account_name || form.gl_account_name || '';
      }

      const payload = {
        tax_name:      form.tax_name.trim(),
        tax_code:      form.tax_code.trim() || null,
        tax_rate:      parseFloat(form.tax_rate),
        tax_type:      form.tax_type,
        applies_to:    form.applies_to,
        sort_order:    parseInt(form.sort_order) || 0,
        is_compound:   !!form.is_compound,
        gl_account_id:   glAccountId || null,
        gl_account_name: glAccountName || null,
        is_default:    form.is_default,
        is_active:     form.is_active,
        description:   form.description || null,
      };

      if (form.id) {
        await sajilo.entities.TaxType.update(form.id, payload);
        toast.success('Tax type updated');
      } else {
        await sajilo.entities.TaxType.create(payload);
        toast.success('Tax type created');
      }

      invalidateTaxCache();
      closeForm();
      loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to save tax type');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this tax type? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await sajilo.entities.TaxType.update(id, { is_active: false });
      invalidateTaxCache();
      toast.success('Tax type removed');
      loadAll();
    } catch (err) {
      toast.error(err.message || 'Failed to remove tax type');
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-7 h-7 border-4 border-muted border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg px-4 py-3 text-sm text-blue-800 dark:text-blue-300 space-y-2">
        <p className="font-semibold flex items-center gap-1.5"><Percent className="w-4 h-4" />Dynamic Tax & VAT Engine — Cascading Multi-Tax Support</p>
        <p>Each Tax Type has its own dedicated GL ledger. Mark one as <strong>Default</strong> for items with <em>VAT Applicable</em> toggled on.</p>
        <div className="bg-card border border-blue-100 rounded px-3 py-2 text-xs space-y-1">
          <p className="font-semibold text-blue-900">How Cascading Works (Sort Order + Compound):</p>
          <p>Taxes are applied in <strong>Sort Order</strong> (lowest first). A <strong>Compound</strong> tax calculates on <em>net + all prior taxes</em>, not just net.</p>
          <p className="text-muted-foreground">Example — Excise 20% (sort 5, non-compound) + VAT 13% (sort 10, compound):</p>
          <p className="font-mono bg-muted/50 px-2 py-1 rounded">Base=100 → Excise=20 → VAT=(100+20)×13%=15.6 → Total Tax=35.6</p>
        </div>
      </div>

      {/* Table */}
      {taxTypes.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed rounded-xl">
          No tax types configured yet. Add your first one below.
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">Code</th>
                <th className="px-4 py-3 text-right font-semibold">Rate (%)</th>
                <th className="px-4 py-3 text-center font-semibold">Order</th>
                <th className="px-4 py-3 text-center font-semibold">Compound?</th>
                <th className="px-4 py-3 text-left font-semibold">Method</th>
                <th className="px-4 py-3 text-left font-semibold">Applies To</th>
                <th className="px-4 py-3 text-left font-semibold">GL Ledger</th>
                <th className="px-4 py-3 text-center font-semibold">Default</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...taxTypes].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(t => (
                <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{t.tax_name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.tax_code || '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{t.tax_rate}%</td>
                  <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">{t.sort_order ?? 0}</td>
                  <td className="px-4 py-3 text-center">
                    {t.is_compound
                      ? <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 px-2 py-0.5 rounded-full">Compound</span>
                      : <span className="text-xs text-muted-foreground">Simple</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      t.tax_type === 'Exclusive' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' : 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400'
                    }`}>{t.tax_type}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{t.applies_to}</td>
                  <td className="px-4 py-3 text-xs">
                    {t.gl_account_name
                      ? <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />{t.gl_account_name}</span>
                      : <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />Not linked</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-center">
                    {t.is_default && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> Default
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={deleting === t.id} onClick={() => handleDelete(t.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button onClick={openNew} variant="outline" className="gap-2">
        <Plus className="w-4 h-4" /> Add Tax Type
      </Button>

      {/* Inline Form */}
      {form && (
        <div className="border border-border rounded-xl p-5 space-y-4 bg-card shadow-sm">
          <h3 className="font-semibold text-sm text-foreground">{form.id ? 'Edit Tax Type' : 'New Tax Type'}</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tax Name *</Label>
              <Input value={form.tax_name} onChange={e => sf('tax_name', e.target.value)} placeholder="e.g. VAT 13%" className="mt-1" />
            </div>
            <div>
              <Label>Tax Code</Label>
              <Input value={form.tax_code} onChange={e => sf('tax_code', e.target.value)} placeholder="e.g. VAT13" className="mt-1 font-mono" />
            </div>
            <div>
              <Label>Tax Rate (%)* </Label>
              <Input type="number" min={0} max={100} step={0.001} value={form.tax_rate} onChange={e => sf('tax_rate', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Sort Order</Label>
              <p className="text-xs text-muted-foreground mb-1">Lower number = applied first (e.g. Excise=5, VAT=10)</p>
              <Input type="number" min={0} step={1} value={form.sort_order} onChange={e => sf('sort_order', parseInt(e.target.value) || 0)} className="mt-1" />
            </div>
            <div>
              <Label>Calculation Method</Label>
              <Select value={form.tax_type} onValueChange={v => sf('tax_type', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Exclusive">Exclusive — tax added on top of net price</SelectItem>
                  <SelectItem value="Inclusive">Inclusive — tax extracted from gross price</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Applies To</Label>
              <Select value={form.applies_to} onValueChange={v => sf('applies_to', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Both">Both Sales & Purchase</SelectItem>
                  <SelectItem value="Sales">Sales only</SelectItem>
                  <SelectItem value="Purchase">Purchase only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => sf('description', e.target.value)} placeholder="Optional note" className="mt-1" />
            </div>
          </div>

          {/* Compound toggle with explanation */}
          <div className="border border-border rounded-lg p-4 bg-purple-50 dark:bg-purple-500/10/40 space-y-2">
            <div className="flex items-center gap-3">
              <Switch checked={form.is_compound} onCheckedChange={v => sf('is_compound', v)} />
              <div>
                <p className="text-sm font-semibold">Compound Tax</p>
                <p className="text-xs text-muted-foreground">
                  When ON: this tax is calculated on <strong>net + all prior taxes</strong> in the stack.<br />
                  When OFF: this tax is calculated on the <strong>net price only</strong>.
                </p>
              </div>
            </div>
            {form.is_compound && (
              <div className="bg-card border border-purple-200 dark:border-purple-500/20 rounded px-3 py-2 text-xs text-purple-800 dark:text-purple-300 font-mono">
                Example: if net=100 and prior taxes=20 → base for this tax = 120<br />
                At {form.tax_rate}%: this tax = {((120) * Number(form.tax_rate || 0) / 100).toFixed(2)}
              </div>
            )}
          </div>

          {/* GL Ledger section */}
          <div className="space-y-3 border border-border rounded-lg p-4 bg-muted/20">
            <p className="text-sm font-semibold">GL Ledger Account</p>
            <div className="flex items-center gap-3">
              <Switch checked={form._create_ledger} onCheckedChange={v => sf('_create_ledger', v)} />
              <span className="text-sm">Auto-create a new Sub Ledger for this tax type</span>
            </div>
            {form._create_ledger ? (
              <div>
                <Label>Parent Liability Group *</Label>
                <SearchableSelect 
                  value={form._parent_group_id} 
                  onChange={v => sf('_parent_group_id', v)}
                  placeholder="Select a Liability Group Ledger"
                  options={groupAccounts.map(g => ({
                    value: g.id,
                    label: `${g.account_code} — ${g.account_name}`
                  }))}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  A new sub-ledger named "<strong>{form.tax_name || 'Tax Payable'}</strong>" will be created under this group.
                </p>
              </div>
            ) : (
              <div>
                <Label>Link Existing Sub Ledger</Label>
                <SearchableSelect 
                  value={form.gl_account_id || ''} 
                  onChange={v => sf('gl_account_id', v)}
                  placeholder="— Select existing account —"
                  options={subAccounts
                    .filter(a => a.account_type === 'Liability')
                    .map(a => ({
                      value: a.id,
                      label: `${a.account_code} — ${a.account_name}`
                    }))
                  }
                  className="mt-1"
                />
              </div>
            )}
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <Switch checked={form.is_default} onCheckedChange={v => sf('is_default', v)} />
              <span className="text-sm font-medium">Set as Default Tax Type</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => sf('is_active', v)} />
              <span className="text-sm font-medium">Active</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={closeForm}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : form.id ? 'Update Tax Type' : 'Create Tax Type'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
