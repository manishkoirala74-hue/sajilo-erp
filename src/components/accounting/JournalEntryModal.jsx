import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/shared/SearchableSelect';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import DateInput from '@/components/shared/DateInput';

const MODULES = ['General', 'Sales', 'Purchase', 'Manufacturing', 'Payroll', 'Assets', 'Stock'];

export default function JournalEntryModal({ open, onClose, accounts, onSaved }) {
  const [form, setForm] = useState({ entry_date: new Date().toISOString().split('T')[0], description: '', reference_module: 'General', notes: '' });
  const [employees, setEmployees] = useState([]);
  const [lines, setLines] = useState([
    { account_id: '', account_code: '', account_name: '', account_type: '', debit_amount: 0, credit_amount: 0, description: '', entity_type: '', entity_id: '' },
    { account_id: '', account_code: '', account_name: '', account_type: '', debit_amount: 0, credit_amount: 0, description: '', entity_type: '', entity_id: '' },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      sajilo.entities.Employee.list('full_name', 500).then(setEmployees);
    }
  }, [open]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit_amount) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit_amount) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;

  const setLine = (i, key, val) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [key]: val } : l));

  const selectAccount = (i, accountId) => {
    const acc = accounts.find(a => a.id === accountId);
    if (acc) setLines(ls => ls.map((l, idx) => idx === i ? { ...l, account_id: acc.id, account_code: acc.account_code, account_name: acc.account_name, account_type: acc.account_type } : l));
  };

  const selectEntity = (i, entityId) => {
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, entity_type: entityId ? 'Employee' : null, entity_id: entityId } : l));
  };

  const addLine = () => setLines(ls => [...ls, { account_id: '', account_code: '', account_name: '', account_type: '', debit_amount: 0, credit_amount: 0, description: '', entity_type: '', entity_id: '' }]);
  const removeLine = (i) => setLines(ls => ls.filter((_, idx) => idx !== i));

  const handleSave = async (status = 'Draft') => {
    if (!form.description || !form.entry_date) { toast.error('Date and description are required'); return; }
    if (lines.some(l => !l.account_id)) { toast.error('All lines must have an account selected'); return; }
    if (status === 'Posted' && !isBalanced) { toast.error('Journal must be balanced before posting'); return; }

    setSaving(true);
    try {
      const journal = await sajilo.entities.GeneralLedgerJournal.create({
        ...form, status, total_debit: totalDebit, total_credit: totalCredit, is_balanced: isBalanced,
        posted_by: status === 'Posted' ? 'current_user' : ''
      });

      // Clean up lines for DB
      const cleanLines = lines.map(l => ({
        journal_id: journal.id,
        account_id: l.account_id, account_code: l.account_code, account_name: l.account_name, account_type: l.account_type,
        debit_amount: l.debit_amount, credit_amount: l.credit_amount, description: l.description,
        entity_type: l.entity_id ? 'Employee' : null,
        entity_id: l.entity_id || null
      }));

      await sajilo.entities.GeneralLedgerLine.bulkCreate(cleanLines);

      // Update account balances if posting
      if (status === 'Posted') {
        for (const line of lines) {
          const acc = accounts.find(a => a.id === line.account_id);
          if (!acc) continue;
          const isDebitNormal = acc.normal_balance === 'Debit';
          const balanceChange = isDebitNormal
            ? (Number(line.debit_amount) - Number(line.credit_amount))
            : (Number(line.credit_amount) - Number(line.debit_amount));
          await sajilo.entities.ChartOfAccount.update(acc.id, { current_balance: (acc.current_balance || 0) + balanceChange });
        }
      }

      toast.success(`Journal entry ${status === 'Posted' ? 'posted' : 'saved as draft'}`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Journal Entry</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-4 mt-2">
          <div>
            <DateInput label="Entry Date *" value={form.entry_date} onChange={v => setForm(f => ({ ...f, entry_date: v }))} className="mt-1" />
          </div>
          <div>
            <Label>Reference Module</Label>
            <SearchableSelect
              className="mt-1"
              value={form.reference_module}
              onValueChange={v => setForm(f => ({ ...f, reference_module: v }))}
              options={MODULES.map(m => ({ value: m, label: m }))}
            />
          </div>
          <div>
            <Label>Description *</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" placeholder="Journal narration" />
          </div>
        </div>

        {/* Lines */}
        <div className="mt-4">
          <div className="grid grid-cols-12 gap-1 text-xs font-medium text-muted-foreground px-2 mb-1">
            <div className="col-span-3">Account</div>
            <div className="col-span-2">Sub-Ledger Entity</div>
            <div className="col-span-3">Description</div>
            <div className="col-span-1 text-right">Debit</div>
            <div className="col-span-2 text-right">Credit</div>
            <div className="col-span-1" />
          </div>
          <div className="space-y-1.5">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-1 items-center bg-muted/20 rounded-lg px-2 py-1.5">
                <div className="col-span-3">
                  <SearchableSelect
                    value={line.account_id}
                    onValueChange={v => selectAccount(i, v)}
                    placeholder="Select account"
                    options={accounts.filter(a => a.ledger_type === 'Sub Ledger' && a.is_active).map(a => ({
                      value: a.id, label: a.account_name, sub: a.account_code
                    }))}
                  />
                </div>
                <div className="col-span-2">
                  <Select value={line.entity_id || "none"} onValueChange={v => selectEntity(i, v === "none" ? null : v)}>
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue placeholder="No Entity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- No Entity --</SelectItem>
                      {employees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id} className="text-xs">{emp.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  <Input value={line.description} onChange={e => setLine(i, 'description', e.target.value)} className="h-8 text-xs" placeholder="Narration…" />
                </div>
                <div className="col-span-2">
                  <Input type="number" value={line.debit_amount || ''} onChange={e => { setLine(i, 'debit_amount', Number(e.target.value)); if (Number(e.target.value) > 0) setLine(i, 'credit_amount', 0); }} className="h-8 text-xs text-right" placeholder="0.00" />
                </div>
                <div className="col-span-1">
                  <Input type="number" value={line.credit_amount || ''} onChange={e => { setLine(i, 'credit_amount', Number(e.target.value)); if (Number(e.target.value) > 0) setLine(i, 'debit_amount', 0); }} className="h-8 text-xs text-right" placeholder="0.00" />
                </div>
                <div className="col-span-1 flex justify-center">
                  {lines.length > 2 && <button onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              </div>
            ))}
          </div>

          <button onClick={addLine} className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:underline">
            <Plus className="w-3.5 h-3.5" /> Add Line
          </button>
        </div>

        {/* Totals */}
        <div className={cn('flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium mt-3', isBalanced ? 'bg-emerald-50 border border-emerald-200' : 'bg-amber-50 border border-amber-200')}>
          <div className="flex items-center gap-2">
            {isBalanced ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-amber-600" />}
            <span className={isBalanced ? 'text-emerald-700' : 'text-amber-700'}>{isBalanced ? 'Balanced — Ready to Post' : `Difference: NPR ${Math.abs(totalDebit - totalCredit).toLocaleString()}`}</span>
          </div>
          <div className="flex gap-6 text-xs">
            <span>Total Dr: <strong className="font-mono">NPR {totalDebit.toLocaleString()}</strong></span>
            <span>Total Cr: <strong className="font-mono">NPR {totalCredit.toLocaleString()}</strong></span>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => handleSave('Draft')} disabled={saving}>Save as Draft</Button>
          <Button onClick={() => handleSave('Posted')} disabled={saving || !isBalanced}>Post Entry</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}