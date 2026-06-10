import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { seedDefaultChartOfAccounts } from '@/lib/defaultCoaSeeder';
import { RefreshCw } from 'lucide-react';

// Standard GL posting account mappings (Sub Ledger accounts)
const GL_FIELDS = [
  { key: 'gl_sales_return_account',    label: 'Sales Returns & Allowances',        desc: 'Contra-revenue — debited on sales return' },
  { key: 'gl_purchase_return_account', label: 'Purchase Returns & Allowances',     desc: 'Contra-COGS — credited on purchase return' },
  { key: 'gl_default_sales_account',   label: 'Default Sales Revenue',             desc: 'Fallback if item has no sales account' },
  { key: 'gl_default_cogs_account',    label: 'Default COGS',                      desc: 'Fallback if item has no purchase account' },
  { key: 'gl_default_inventory_account', label: 'Default Inventory Asset',         desc: 'Fallback if item has no inventory account' },
  { key: 'gl_stock_variance_account',  label: 'Stock Variance / Write-off',        desc: 'Used for stock adjustment journals & item deletion write-offs' },
  { key: 'gl_opening_equity_account',  label: 'Opening Balance Equity',            desc: 'Credited when posting opening stock on item import' },
];

// Ledger Group Parent mappings (Group Ledger accounts only)
const LEDGER_GROUP_FIELDS = [
  {
    key: 'gl_customer_ledger_group',
    label: 'Customer Ledger Group Parent',
    desc: 'Asset group under which new Customer sub-ledgers are auto-created (e.g. 1020 – Trade Debtors). Dual-role partners (also marked as Vendor) also get their AR ledger here.',
    filterType: 'Asset',
  },
  {
    key: 'gl_supplier_ledger_group',
    label: 'Supplier Ledger Group Parent',
    desc: 'Liability group under which new Supplier sub-ledgers are auto-created (e.g. 2010 – Trade Creditors). Dual-role partners (also marked as Customer) also get their AP ledger here.',
    filterType: 'Liability',
  },
];

export default function GLAccountSettings({ settings, onChange }) {
  const [subAccounts,   setSubAccounts]   = useState([]);
  const [groupAccounts, setGroupAccounts] = useState([]);
  const [seeding, setSeeding] = useState(false);

  const loadAccounts = () => {
    Promise.all([
      sajilo.entities.ChartOfAccount.filter({ ledger_type: 'Sub Ledger',   is_active: true }, 'account_name', 300),
      sajilo.entities.ChartOfAccount.filter({ ledger_type: 'Group Ledger', is_active: true }, 'account_code', 300),
    ]).then(([subs, groups]) => {
      setSubAccounts(subs);
      setGroupAccounts(groups);
    });
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const handleRestoreDefaults = async () => {
    if (!window.confirm("This will load the default system Chart of Accounts. Continue?")) return;
    setSeeding(true);
    try {
      await seedDefaultChartOfAccounts();
      loadAccounts();
      toast.success("Default Chart of Accounts restored successfully.");
    } catch (e) {
      toast.error("Failed to restore default accounts.");
    }
    setSeeding(false);
  };


  const handleSubChange = (baseKey, accountId) => {
    const acc = subAccounts.find(a => a.id === accountId);
    onChange({ [`${baseKey}_id`]: accountId, [`${baseKey}_name`]: acc?.account_name || '' });
  };

  const handleGroupChange = (baseKey, accountId) => {
    const acc = groupAccounts.find(a => a.id === accountId);
    onChange({ [`${baseKey}_id`]: accountId, [`${baseKey}_name`]: acc ? `${acc.account_code} – ${acc.account_name}` : '' });
  };

  return (
    <div className="space-y-6">
      {/* ── Restore Defaults ── */}
      <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm text-orange-800 flex justify-between items-center">
        <div>
          <p className="font-semibold mb-0.5">Missing Accounts?</p>
          <p className="text-xs">If your Chart of Accounts is empty, you can restore the standard system accounts here.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRestoreDefaults} disabled={seeding} className="bg-white hover:bg-orange-100 text-orange-700 border-orange-300">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${seeding ? 'animate-spin' : ''}`} />
          {seeding ? 'Restoring...' : 'Restore Defaults'}
        </Button>
      </div>

      {/* ── Automated Ledger Generation — Group Parent Mapping ── */}
      <div className="space-y-3">
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm text-indigo-800">
          <p className="font-semibold mb-0.5">Automated Sub-Ledger Generation</p>
          Map each partner type to a <strong>Group Ledger</strong> parent. When a new Customer or Supplier is saved,
          the system automatically creates a sequential sub-ledger under the assigned group and links it to the partner
          profile. Partners marked as <em>both Customer and Vendor</em> receive ledgers under both groups, with
          balances netting naturally on each ledger.
        </div>
        <div className="grid grid-cols-1 gap-4">
          {LEDGER_GROUP_FIELDS.map(f => {
            const options = f.filterType
              ? groupAccounts.filter(a => a.account_type === f.filterType)
              : groupAccounts;
            return (
              <div key={f.key} className="flex items-center gap-4">
                <div className="w-56 shrink-0">
                  <p className="text-sm font-semibold text-indigo-900">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
                <div className="flex-1">
                  <Select
                    value={settings[`${f.key}_id`] || ''}
                    onValueChange={v => handleGroupChange(f.key, v)}
                  >
                    <SelectTrigger className="h-9 border-indigo-200 focus:ring-indigo-400">
                      <SelectValue placeholder="— Select Group Ledger —" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.account_code} — {a.account_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {settings[`${f.key}_name`] && (
                    <p className="text-xs text-indigo-600 mt-0.5">✓ {settings[`${f.key}_name`]}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Standard GL Posting Accounts ── */}
      <div className="space-y-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800 space-y-1">
          <p>Map your Chart of Accounts to each GL posting role. Used automatically when posting transactions.</p>
          <p className="text-xs">
            <strong>Priority order:</strong> Transaction-level selection → Partner-dedicated ledger → These fallback defaults.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {GL_FIELDS.map(f => (
            <div key={f.key} className="flex items-center gap-4">
              <div className="w-56 shrink-0">
                <p className="text-sm font-medium">{f.label}</p>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
              <div className="flex-1">
                <Select
                  value={settings[`${f.key}_id`] || ''}
                  onValueChange={v => handleSubChange(f.key, v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="— Select GL account —" />
                  </SelectTrigger>
                  <SelectContent>
                    {subAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.account_code} — {a.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {settings[`${f.key}_name`] && (
                  <p className="text-xs text-emerald-600 mt-0.5">✓ {settings[`${f.key}_name`]}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}