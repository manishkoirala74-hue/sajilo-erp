import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, ShieldCheck } from 'lucide-react';
import SearchableSelect from '@/components/shared/SearchableSelect';
function SectionCard({ title, icon: CardIcon, children }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mb-6">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
        <CardIcon className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function PayrollGLSettings({ settings, onChange }) {
  const [accounts, setAccounts] = useState([]);
  
  // Safe parsing of JSONB
  const parseJSON = (val) => {
    if (!val) return [];
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch (e) { return []; }
    }
    return Array.isArray(val) ? val : [];
  };

  const earnings = parseJSON(settings.hr_earning_mappings);
  const deductions = parseJSON(settings.hr_deduction_mappings);

  useEffect(() => {
    sajilo.entities.ChartOfAccount.filter({ ledger_type: 'Sub Ledger', is_active: true }, 'account_name', 300)
      .then(setAccounts);
  }, []);

  const addEarning = () => {
    onChange({ hr_earning_mappings: [...earnings, { name: '', account_id: '', account_code: '', account_name: '', account_type: '' }] });
  };

  const addDeduction = () => {
    onChange({ hr_deduction_mappings: [...deductions, { name: '', account_id: '', account_code: '', account_name: '', account_type: '' }] });
  };

  const updateArray = (type, index, field, value) => {
    const list = type === 'earning' ? [...earnings] : [...deductions];
    list[index][field] = value;
    
    // Auto-fill account details when account_id changes
    if (field === 'account_id') {
      const acc = accounts.find(a => a.id === value);
      if (acc) {
        list[index].account_code = acc.account_code;
        list[index].account_name = acc.account_name;
        list[index].account_type = acc.account_type;
      }
    }
    
    onChange({ [type === 'earning' ? 'hr_earning_mappings' : 'hr_deduction_mappings']: list });
  };

  const removeArray = (type, index) => {
    const list = type === 'earning' ? [...earnings] : [...deductions];
    list.splice(index, 1);
    onChange({ [type === 'earning' ? 'hr_earning_mappings' : 'hr_deduction_mappings']: list });
  };

  return (
    <SectionCard title="Payroll Component Mapping (Subsidiary GL Tracking)" icon={ShieldCheck}>
      <p className="text-xs text-muted-foreground mb-6">
        Dynamically map individual payroll components to your Chart of Accounts. 
        When Payroll is processed, the engine will natively debit these Expense accounts and credit the Liabilities/Assets.
      </p>

      {/* GLOBAL NET SALARY PAYABLE */}
      <div className="bg-muted/30 p-4 rounded-lg mb-6 border border-border">
        <h4 className="text-sm font-semibold mb-2">Global Control: Salary Payable</h4>
        <p className="text-xs text-muted-foreground mb-3">
          This is the Liability account credited for the final Net Take-Home Pay. The ERP will automatically attach the Employee ID as the sub-ledger entity on these rows.
        </p>
        <div className="w-1/2">
          <SearchableSelect
            value={settings.hr_salary_payable_account_id || ''}
            onChange={v => onChange({ hr_salary_payable_account_id: v })}
            placeholder="— Select Liability Account —"
            options={accounts
              .filter(a => ['Liability', 'Current Liability'].includes(a.account_type))
              .map(a => ({ value: a.id, label: `${a.account_code} — ${a.account_name}` }))}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* EARNINGS GRID */}
        <div>
          <div className="flex items-center justify-between mb-3 border-b pb-2">
            <div>
              <h4 className="text-sm font-semibold">Earnings (Debits)</h4>
              <p className="text-[11px] text-muted-foreground">Map Base Salary, Allowances, etc. to Expenses</p>
            </div>
            <Button size="sm" variant="outline" onClick={addEarning}><Plus className="w-4 h-4 mr-1" /> Add Earning</Button>
          </div>
          
          <div className="space-y-3">
            {earnings.map((e, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input 
                    placeholder="Component Name (e.g. Base Salary)" 
                    value={e.name} 
                    onChange={ev => updateArray('earning', i, 'name', ev.target.value)}
                    className="h-9 mb-2"
                  />
                  <SearchableSelect 
                    value={e.account_id} 
                    onChange={v => updateArray('earning', i, 'account_id', v)}
                    placeholder="Select Expense Account"
                    options={accounts
                      .filter(a => ['Expense', 'Direct Expense', 'Indirect Expense'].includes(a.account_type))
                      .map(a => ({ value: a.id, label: `${a.account_code} — ${a.account_name}` }))}
                  />
                </div>
                <Button size="icon" variant="ghost" className="text-red-500 shrink-0" onClick={() => removeArray('earning', i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {earnings.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">No earning components mapped.</p>}
          </div>
        </div>

        {/* DEDUCTIONS GRID */}
        <div>
          <div className="flex items-center justify-between mb-3 border-b pb-2">
            <div>
              <h4 className="text-sm font-semibold">Deductions (Credits)</h4>
              <p className="text-[11px] text-muted-foreground">Map PF, TDS, Advances, Fines to Liabilities/Assets</p>
            </div>
            <Button size="sm" variant="outline" onClick={addDeduction}><Plus className="w-4 h-4 mr-1" /> Add Deduction</Button>
          </div>
          
          <div className="space-y-3">
            {deductions.map((d, i) => (
              <div key={i} className="flex gap-2 items-start">
                <div className="flex-1">
                  <Input 
                    placeholder="Component Name (e.g. PF Deduction)" 
                    value={d.name} 
                    onChange={ev => updateArray('deduction', i, 'name', ev.target.value)}
                    className="h-9 mb-2"
                  />
                  <SearchableSelect 
                    value={d.account_id} 
                    onChange={v => updateArray('deduction', i, 'account_id', v)}
                    placeholder="Select Liability/Asset Account"
                    options={accounts.map(a => ({ value: a.id, label: `${a.account_code} — ${a.account_name} (${a.account_type})` }))}
                  />
                </div>
                <Button size="icon" variant="ghost" className="text-red-500 shrink-0" onClick={() => removeArray('deduction', i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {deductions.length === 0 && <p className="text-xs text-muted-foreground italic text-center py-4">No deduction components mapped.</p>}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
