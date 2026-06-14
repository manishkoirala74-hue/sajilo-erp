import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BookOpen, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';

function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border bg-muted/20">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function AccountPicker({ label, desc, valueId, valueName, accounts, onSelect }) {
  return (
    <div>
      <Label>{label}</Label>
      {desc && <p className="text-xs text-muted-foreground mb-1.5">{desc}</p>}
      <Select value={valueId || ''} onValueChange={v => {
        const acc = accounts.find(a => a.id === v);
        onSelect(v, acc?.account_name || '');
      }}>
        <SelectTrigger className="mt-1 ">
          <SelectValue placeholder="Select GL Account…" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map(a => (
            <SelectItem key={a.id} value={a.id}>
              <span className="font-mono text-xs text-muted-foreground mr-2">{a.account_code}</span>{a.account_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {valueName && <p className="mt-1 text-xs text-muted-foreground ">Selected: <span className="font-medium">{valueName}</span></p>}
    </div>
  );
}

export default function DepreciationSettings({ settings, onChange }) {
  const [accounts, setAccounts] = useState([]);
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [accumAccounts, setAccumAccounts] = useState([]);

  useEffect(() => {
    sajilo.entities.ChartOfAccount.list('account_code', 500).then(data => {
      setAccounts(data);
      setExpenseAccounts(data.filter(a => a.ledger_type === 'Sub Ledger' && a.is_active && ['COGS', 'OPEX'].includes(a.account_type)));
      setAccumAccounts(data.filter(a => a.ledger_type === 'Sub Ledger' && a.is_active && a.account_type === 'Asset' && a.normal_balance === 'Credit'));
    });
  }, []);

  const set = (key, val) => onChange(key, val);

  const postingMode = settings?.dep_posting_mode || 'Accumulated';

  return (
    <div className="space-y-5">
      {/* Method & Rate */}
      <SectionCard title="Depreciation Calculation Method" icon={Calculator}>
        <div className="grid grid-cols-2 gap-5">
          <div>
            <Label>Default Depreciation Method</Label>
            <p className="text-xs text-muted-foreground mb-1.5">Applied to new assets unless overridden per asset</p>
            <Select value={settings?.dep_default_method || 'Straight-Line'} onValueChange={v => set('dep_default_method', v)}>
              <SelectTrigger className="mt-1 "><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Straight-Line">
                  <div>
                    <p className="font-medium">Straight-Line (SLM)</p>
                    <p className="text-xs text-muted-foreground">Equal charge every period</p>
                  </div>
                </SelectItem>
                <SelectItem value="Written-Down Value">
                  <div>
                    <p className="font-medium">Written-Down Value (WDV)</p>
                    <p className="text-xs text-muted-foreground">Declining balance on NBV</p>
                  </div>
                </SelectItem>
                <SelectItem value="Units of Production">
                  <div>
                    <p className="font-medium">Units of Production</p>
                    <p className="text-xs text-muted-foreground">Based on output/usage rate</p>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Default Annual Depreciation Rate (%)</Label>
            <p className="text-xs text-muted-foreground mb-1.5">Used for WDV and rate-based SLM calculations</p>
            <Input type="number" min={1} max={100} step={0.5}
              value={settings?.dep_default_rate_percent || 20}
              onChange={e => set('dep_default_rate_percent', Number(e.target.value))}
              className="h-10 border border-border bg-background px-3 text-sm rounded-md focus:ring-1 focus:ring-primary outline-none mt-1 " placeholder="e.g. 20" />
          </div>
          <div className="col-span-2">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Override Useful Life — Use Rate Instead</p>
                <p className="text-xs text-muted-foreground mt-0.5">When enabled, uses the rate % above instead of the asset's useful life months for the calculation</p>
              </div>
              <Switch checked={!!settings?.dep_use_rate_override} onCheckedChange={v => set('dep_use_rate_override', v)} />
            </div>
          </div>
        </div>

        {/* Formula Preview */}
        <div className="mt-4 bg-muted/40 rounded-lg px-4 py-3 text-xs font-mono text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground text-xs">Formula Preview:</p>
          {settings?.dep_default_method === 'Straight-Line' && !settings?.dep_use_rate_override && (
            <p>Monthly Dep. = (Gross Value − Salvage Value) ÷ Useful Life (months)</p>
          )}
          {settings?.dep_default_method === 'Straight-Line' && settings?.dep_use_rate_override && (
            <p>Monthly Dep. = (Gross Value × {settings?.dep_default_rate_percent || 20}%) ÷ 12</p>
          )}
          {settings?.dep_default_method === 'Written-Down Value' && (
            <p>Monthly Dep. = Net Book Value × ({settings?.dep_default_rate_percent || 20}% ÷ 12)</p>
          )}
          {settings?.dep_default_method === 'Units of Production' && (
            <p>Monthly Dep. = (Gross − Salvage) × (Units Produced ÷ Total Estimated Units)</p>
          )}
        </div>
      </SectionCard>

      {/* Posting Mode */}
      <SectionCard title="Journal Posting Mode" icon={BookOpen}>
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { value: 'Accumulated', title: 'Accumulated Depreciation (Recommended)', desc: 'Debit Expense Account → Credit Accumulated Depreciation (contra-asset). IAS 16 compliant. NBV visible on balance sheet.', badge: 'IAS 16' },
            { value: 'Direct', title: 'Direct Write-Down', desc: 'Debit Expense Account → Credit Asset Account directly. Simpler but reduces asset cost directly.', badge: '' },
          ].map(opt => (
            <button key={opt.value} onClick={() => set('dep_posting_mode', opt.value)}
              className={cn('border rounded-xl p-4 text-left transition-all', postingMode === opt.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:border-muted-foreground/30')}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">{opt.title}</p>
                {opt.badge && <span className="text-xs bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-500/20">{opt.badge}</span>}
              </div>
              <p className="text-xs text-muted-foreground">{opt.desc}</p>
              {postingMode === opt.value && <div className="mt-2 w-3 h-3 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        {/* Journal entry preview */}
        <div className="bg-muted/30 rounded-lg p-3 text-xs mb-5">
          <p className="font-semibold mb-2">Journal Entry Preview ({postingMode}):</p>
          {postingMode === 'Accumulated' ? (
            <table className="table-fluid-grid text-xs"><tbody>
              <tr><td className="cell-density py-0.5 text-blue-700 dark:text-blue-400 font-mono">Dr</td><td className="cell-density py-0.5">Depreciation Expense (OPEX/COGS)</td><td className="cell-density py-0.5 text-right font-mono">X</td></tr>
              <tr><td className="cell-density py-0.5 pl-4 text-emerald-700 dark:text-emerald-400 font-mono">Cr</td><td className="cell-density py-0.5 pl-4">Accumulated Depreciation (Contra-Asset)</td><td className="cell-density py-0.5 text-right font-mono">X</td></tr>
            </tbody></table>
          ) : (
            <table className="table-fluid-grid text-xs"><tbody>
              <tr><td className="cell-density py-0.5 text-blue-700 dark:text-blue-400 font-mono">Dr</td><td className="cell-density py-0.5">Depreciation Expense (OPEX/COGS)</td><td className="cell-density py-0.5 text-right font-mono">X</td></tr>
              <tr><td className="cell-density py-0.5 pl-4 text-emerald-700 dark:text-emerald-400 font-mono">Cr</td><td className="cell-density py-0.5 pl-4">Asset Account (Cost) — Direct reduction</td><td className="cell-density py-0.5 text-right font-mono">X</td></tr>
            </tbody></table>
          )}
        </div>

        {/* GL Account Mapping */}
        <div className="space-y-4">
          <p className="text-sm font-semibold">GL Account Mapping by Asset Category</p>
          <div className="grid grid-cols-2 gap-4">
            <AccountPicker
              label="Factory/Machinery — Expense Account"
              desc="e.g. Factory Overhead Control (5100)"
              valueId={settings?.dep_factory_expense_account_id}
              valueName={settings?.dep_factory_expense_account_name}
              accounts={expenseAccounts}
              onSelect={(id, name) => { set('dep_factory_expense_account_id', id); set('dep_factory_expense_account_name', name); }}
            />
            <AccountPicker
              label="Admin/Office Equipment — Expense Account"
              desc="e.g. Depreciation Expense OPEX (6510)"
              valueId={settings?.dep_admin_expense_account_id}
              valueName={settings?.dep_admin_expense_account_name}
              accounts={expenseAccounts}
              onSelect={(id, name) => { set('dep_admin_expense_account_id', id); set('dep_admin_expense_account_name', name); }}
            />
          </div>
          {postingMode === 'Accumulated' && (
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
              <p className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Accumulated Depreciation Contra Accounts</p>
              <AccountPicker
                label="Accumulated Dep. — Machinery"
                desc="e.g. Accum. Dep. Machinery (1525)"
                valueId={settings?.dep_accumulated_machinery_account_id}
                valueName={settings?.dep_accumulated_machinery_account_name}
                accounts={accumAccounts}
                onSelect={(id, name) => { set('dep_accumulated_machinery_account_id', id); set('dep_accumulated_machinery_account_name', name); }}
              />
              <AccountPicker
                label="Accumulated Dep. — Office Equipment"
                desc="e.g. Accum. Dep. Office (1535)"
                valueId={settings?.dep_accumulated_office_account_id}
                valueName={settings?.dep_accumulated_office_account_name}
                accounts={accumAccounts}
                onSelect={(id, name) => { set('dep_accumulated_office_account_id', id); set('dep_accumulated_office_account_name', name); }}
              />
              <AccountPicker
                label="Accumulated Dep. — Vehicles"
                desc="e.g. Accum. Dep. Vehicles (1545)"
                valueId={settings?.dep_accumulated_vehicle_account_id}
                valueName={settings?.dep_accumulated_vehicle_account_name}
                accounts={accumAccounts}
                onSelect={(id, name) => { set('dep_accumulated_vehicle_account_id', id); set('dep_accumulated_vehicle_account_name', name); }}
              />
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}