import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import { TrendingDown, CheckCircle2, AlertCircle, BookOpen, Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import { cn } from '@/lib/utils';

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

function resolveDepAccounts(asset, settings) {
  const category = asset.category || '';
  const isMachinery = ['Machinery', 'IT Equipment'].includes(category);
  const isVehicle = category === 'Vehicles';
  const expenseAccountId = isMachinery
    ? (settings.dep_factory_expense_account_id || '')
    : (settings.dep_admin_expense_account_id || '');
  const expenseAccountName = isMachinery
    ? (settings.dep_factory_expense_account_name || 'Factory Overhead Control (5100)')
    : (settings.dep_admin_expense_account_name || 'Depreciation Expense OPEX (6510)');
  let creditAccountId, creditAccountName;
  if (settings.dep_posting_mode === 'Direct') {
    creditAccountId = null;
    creditAccountName = `${asset.asset_name} (Cost) — Direct`;
  } else {
    if (isMachinery) {
      creditAccountId = settings.dep_accumulated_machinery_account_id || null;
      creditAccountName = settings.dep_accumulated_machinery_account_name || 'Accum. Dep. — Machinery (1525)';
    } else if (isVehicle) {
      creditAccountId = settings.dep_accumulated_vehicle_account_id || null;
      creditAccountName = settings.dep_accumulated_vehicle_account_name || 'Accum. Dep. — Vehicles (1545)';
    } else {
      creditAccountId = settings.dep_accumulated_office_account_id || null;
      creditAccountName = settings.dep_accumulated_office_account_name || 'Accum. Dep. — Office (1535)';
    }
  }
  return { expenseAccountId, expenseAccountName, creditAccountId, creditAccountName };
}

function calcMonthlyDep(asset, settings) {
  const gross = asset.gross_purchase_value || 0;
  const salvage = asset.salvage_value || 0;
  const life = asset.useful_life_months || 60;
  const nbv = asset.net_book_value || (gross - (asset.accumulated_depreciation || 0));
  const method = asset.depreciation_method || settings?.dep_default_method || 'Straight-Line';
  const rate = settings?.dep_default_rate_percent || 20;
  const useRate = settings?.dep_use_rate_override || false;
  if (method === 'Written-Down Value') return Math.max(0, (nbv * (rate / 100)) / 12);
  if (method === 'Straight-Line' && useRate) return Math.max(0, (gross * (rate / 100)) / 12);
  return Math.max(0, (gross - salvage) / life);
}

export default function DepreciationSchedules() {
  const [assets, setAssets] = useState([]);
  const [settings, setSettings] = useState({});
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [schedLoading, setSchedLoading] = useState(false);
  const [posting, setPosting] = useState(null);

  useEffect(() => {
    Promise.all([
      sajilo.entities.FixedAsset.filter({ status: 'Active' }, 'asset_name', 200),
      sajilo.entities.CompanySettings.list(),
    ]).then(([assetData, settingsData]) => {
      setAssets(assetData);
      setSettings(settingsData[0] || {});
      setLoading(false);
    });
  }, []);

  const loadSchedule = async (assetId) => {
    setSelectedAssetId(assetId);
    const asset = assets.find(a => a.id === assetId);
    setSelectedAsset(asset || null);
    if (!assetId) { setSchedule([]); return; }
    setSchedLoading(true);
    const data = await sajilo.entities.DepreciationSchedule.filter({ asset_id: assetId }, 'schedule_date', 60);
    setSchedule(data);
    setSchedLoading(false);
  };

  const generateSchedule = async () => {
    if (!selectedAsset) return;
    const monthly = calcMonthlyDep(selectedAsset, settings);
    const today = new Date();
    const existing = schedule.map(d => d.period_label);
    const periods = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!existing.includes(label)) {
        periods.push({
          asset_id: selectedAsset.id, asset_name: selectedAsset.asset_name, asset_code: selectedAsset.asset_code,
          schedule_date: d.toISOString().split('T')[0],
          calculated_depreciation_amount: parseFloat(monthly.toFixed(2)),
          is_posted: false, period_label: label
        });
      }
    }
    if (periods.length === 0) return toast.info('Schedule already exists for next 12 months');
    await sajilo.entities.DepreciationSchedule.bulkCreate(periods);
    toast.success(`Generated ${periods.length} depreciation periods`);
    loadSchedule(selectedAsset.id);
  };

  const postEntry = async (sched) => {
    setPosting(sched.id);
    const depAmount = sched.calculated_depreciation_amount;
    const { expenseAccountId, expenseAccountName, creditAccountId, creditAccountName } = resolveDepAccounts(selectedAsset, settings);
    const today = new Date().toISOString().split('T')[0];

    const journal = await sajilo.entities.GeneralLedgerJournal.create({
      entry_date: today,
      description: `Depreciation — ${selectedAsset.asset_name} (${sched.period_label})`,
      reference_module: 'Assets',
      source_document_id: selectedAsset.id,
      source_document_type: 'FixedAsset',
      status: 'Posted',
      total_debit: depAmount,
      total_credit: depAmount,
      is_balanced: true,
      posted_by: 'System — Depreciation Run',
      notes: `${settings?.dep_posting_mode || 'Accumulated'} mode — ${selectedAsset.depreciation_method || settings?.dep_default_method}`
    });

    await sajilo.entities.GeneralLedgerLine.bulkCreate([
      { journal_id: journal.id, account_id: expenseAccountId || 'N/A', account_name: expenseAccountName, account_type: selectedAsset.category === 'Machinery' ? 'COGS' : 'OPEX', debit_amount: depAmount, credit_amount: 0, description: `Dep. expense — ${selectedAsset.asset_name}` },
      { journal_id: journal.id, account_id: creditAccountId || 'N/A', account_name: creditAccountName, account_type: 'Asset', debit_amount: 0, credit_amount: depAmount, description: `Accum. dep. — ${selectedAsset.asset_name}` }
    ]);

    if (expenseAccountId) {
      const expAcc = await sajilo.entities.ChartOfAccount.filter({ id: expenseAccountId });
      if (expAcc[0]) await sajilo.entities.ChartOfAccount.update(expenseAccountId, { current_balance: (expAcc[0].current_balance || 0) + depAmount });
    }
    if (creditAccountId) {
      const crAcc = await sajilo.entities.ChartOfAccount.filter({ id: creditAccountId });
      if (crAcc[0]) await sajilo.entities.ChartOfAccount.update(creditAccountId, { current_balance: (crAcc[0].current_balance || 0) + depAmount });
    }

    await sajilo.entities.DepreciationSchedule.update(sched.id, { is_posted: true, posted_date: today, posted_by: 'System' });
    const newAccum = (selectedAsset.accumulated_depreciation || 0) + depAmount;
    const newNBV = Math.max((selectedAsset.gross_purchase_value || 0) - newAccum, selectedAsset.salvage_value || 0);
    await sajilo.entities.FixedAsset.update(selectedAsset.id, { accumulated_depreciation: newAccum, net_book_value: newNBV });
    setSelectedAsset(s => ({ ...s, accumulated_depreciation: newAccum, net_book_value: newNBV }));
    toast.success('Posted — Journal entry created in General Ledger');
    setPosting(null);
    loadSchedule(selectedAsset.id);
  };

  const postAllPending = async () => {
    const pending = schedule.filter(s => !s.is_posted);
    if (pending.length === 0) return toast.info('No pending periods to post');
    for (const s of pending) await postEntry(s);
  };

  const totalPosted = schedule.filter(s => s.is_posted).reduce((sum, s) => sum + s.calculated_depreciation_amount, 0);
  const totalPending = schedule.filter(s => !s.is_posted).reduce((sum, s) => sum + s.calculated_depreciation_amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Depreciation Schedules" subtitle="Calculate, generate and post asset depreciation to General Ledger" />

      {/* Asset selector */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-end gap-4">
          <div className="flex-1 max-w-sm">
            <label className="text-sm font-medium mb-1.5 block">Select Asset</label>
            <Select value={selectedAssetId} onValueChange={loadSchedule} disabled={loading}>
              <SelectTrigger>
                <SelectValue placeholder={loading ? 'Loading assets…' : 'Choose an active asset…'} />
              </SelectTrigger>
              <SelectContent>
                {assets.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="font-mono text-xs text-muted-foreground mr-2">{a.asset_code}</span>{a.asset_name}
                    <span className="ml-2 text-xs text-muted-foreground">({a.category})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedAsset && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={generateSchedule}>
                <Calculator className="w-4 h-4 mr-1.5" /> Generate 12 Months
              </Button>
              <Button onClick={postAllPending} disabled={!!posting}>
                <BookOpen className="w-4 h-4 mr-1.5" /> Post All Pending
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Asset summary + schedule */}
      {selectedAsset && (
        <>
          {/* Asset info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Gross Value', value: fmt(selectedAsset.gross_purchase_value), color: '' },
              { label: 'Accumulated Dep.', value: fmt(selectedAsset.accumulated_depreciation), color: 'text-amber-600 dark:text-amber-400' },
              { label: 'Net Book Value', value: fmt(selectedAsset.net_book_value), color: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'Monthly Charge', value: fmt(calcMonthlyDep(selectedAsset, settings)), color: 'text-blue-700 dark:text-blue-400' },
            ].map(c => (
              <div key={c.label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
                <p className={cn('font-bold text-lg', c.color)}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Config strip */}
          <div className="flex items-center gap-3 flex-wrap text-xs bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg px-4 py-2.5">
            <span className="font-semibold text-blue-800 dark:text-blue-300">Posting Config:</span>
            <span className="bg-card border border-blue-200 dark:border-blue-500/20 px-2 py-0.5 rounded">{selectedAsset.depreciation_method || settings?.dep_default_method || 'Straight-Line'}</span>
            <span className="bg-card border border-blue-200 dark:border-blue-500/20 px-2 py-0.5 rounded">{settings?.dep_posting_mode || 'Accumulated'} Mode</span>
            {settings?.dep_use_rate_override && <span className="bg-card border border-blue-200 dark:border-blue-500/20 px-2 py-0.5 rounded">Rate: {settings.dep_default_rate_percent}% p.a.</span>}
            {(() => {
              const { expenseAccountName, creditAccountName } = resolveDepAccounts(selectedAsset, settings);
              return <span className="ml-auto text-blue-700 dark:text-blue-400">Dr: {expenseAccountName} → Cr: {creditAccountName}</span>;
            })()}
          </div>

          {/* Period stats */}
          {schedule.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="text-xs text-muted-foreground">Total Periods</p>
                <p className="text-2xl font-bold">{schedule.length}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-4 text-center">
                <p className="text-xs text-emerald-700 dark:text-emerald-400">Posted</p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{fmt(totalPosted)}</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4 text-center">
                <p className="text-xs text-amber-700 dark:text-amber-400">Pending</p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{fmt(totalPending)}</p>
              </div>
            </div>
          )}

          {/* Schedule table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="font-semibold text-sm">Monthly Schedule</span>
              </div>
              <span className="text-xs text-muted-foreground">{schedule.filter(s => !s.is_posted).length} pending · {schedule.filter(s => s.is_posted).length} posted</span>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Period</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Amount</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Journal Entry</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Posted Date</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {schedLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading schedule…</td></tr>
                ) : schedule.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No schedule yet. Click "Generate 12 Months".</td></tr>
                ) : schedule.map(s => {
                  const { expenseAccountName, creditAccountName } = resolveDepAccounts(selectedAsset, settings);
                  return (
                    <tr key={s.id} className={cn('transition-colors', s.is_posted ? 'bg-emerald-50 dark:bg-emerald-500/10/40' : 'hover:bg-muted/20')}>
                      <td className="px-4 py-2.5 font-mono">{s.period_label}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-amber-700 dark:text-amber-400">{fmt(s.calculated_depreciation_amount)}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        <div><span className="text-blue-600 dark:text-blue-400 font-mono">Dr</span> {expenseAccountName}</div>
                        <div><span className="text-emerald-600 dark:text-emerald-400 font-mono">Cr</span> {creditAccountName}</div>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {s.is_posted
                          ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Posted</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertCircle className="w-3.5 h-3.5" /> Pending</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{s.posted_date || '—'}</td>
                      <td className="px-4 py-2.5">
                        {!s.is_posted && (
                          <Button size="sm" variant="outline" disabled={posting === s.id} onClick={() => postEntry(s)}>
                            <BookOpen className="w-3 h-3 mr-1" />
                            {posting === s.id ? 'Posting…' : 'Post + GL'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}