import React, { useState, useEffect, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';
import {
  Plus, Wrench, TrendingDown, CheckCircle2, AlertCircle,
  BookOpen, Calculator, Filter, Search, Trash2, TableProperties, ShoppingCart
} from 'lucide-react';
import BulkAssetCreation from '@/components/assets/BulkAssetCreation';
import DocumentUploader from '@/components/shared/DocumentUploader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/shared/StatusBadge';
import SearchableSelect from '@/components/shared/SearchableSelect';
import AssetBulkToolbar from '@/components/assets/AssetBulkToolbar';
import { postAssetPurchase, postAssetDepreciation, resolveDifferenceInTrialBalance } from '@/lib/glPostingService';
import { AlertTriangle } from 'lucide-react';
import AssetDisposalModal from '@/components/assets/AssetDisposalModal';
import AssetPurchaseModal from '@/components/assets/AssetPurchaseModal';
import { cn } from '@/lib/utils';

const fmt = n => `NPR ${Number(n || 0).toLocaleString()}`;

// Assets Ledger options helper
function useAssetLedgerOptions(accounts) {
  return useMemo(() =>
    accounts
      .filter(a =>
        a.ledger_type === 'Sub Ledger' &&
        a.is_active !== false &&
        a.account_type === 'Asset' &&
        !a.account_subtype?.toLowerCase().includes('accumulated') &&
        !a.account_subtype?.toLowerCase().includes('contra') &&
        !(a.account_name || '').toLowerCase().includes('accumulated')
      )
      .map(a => ({ value: a.id, label: `${a.account_code} — ${a.account_name}` })),
    [accounts]
  );
}

const empty = {
  asset_code: '', asset_name: '',
  purchase_date: new Date().toISOString().split('T')[0],
  gross_purchase_value: 0, salvage_value: 0, useful_life_months: 60,
  depreciation_method: 'Straight-Line', accumulated_depreciation: 0,
  net_book_value: 0, status: 'Active', location: '', assigned_to: '', notes: '',
  document_urls: [],
  asset_ledger_id: '', asset_ledger_name: '',
  accumulated_dep_ledger_id: '', accumulated_dep_ledger_name: '',
  dep_expense_ledger_id: '', dep_expense_ledger_name: '',
  gl_posted: false,
  payment_method_type: 'cash_bank',
  payment_account_id: '', payment_account_name: '',
};

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

function calcNBV(gross, salvage, accum) {
  return Math.max((parseFloat(gross) || 0) - (parseFloat(accum) || 0), parseFloat(salvage) || 0);
}

export default function FixedAssets() {
  const [assets, setAssets] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [vendors, setVendors] = useState([]);

  // Form / modal state
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  // Depreciation schedule modal
  const [depOpen, setDepOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [depSchedule, setDepSchedule] = useState([]);
  const [posting, setPosting] = useState(false);

  // Disposal modal
  const [disposalAsset, setDisposalAsset] = useState(null);

  // Bulk creation modal
  const [bulkOpen, setBulkOpen] = useState(false);

  // Purchase modal
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState([]);

  // Filters
  const [search, setSearch] = useState('');
  const [filterLedger, setFilterLedger] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');

  const assetLedgerOptions = useAssetLedgerOptions(accounts);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [data, settingsData, accs, bankAccs, partners] = await Promise.all([
      sajilo.entities.FixedAsset.list('-created_date', 500),
      sajilo.entities.CompanySettings.list(),
      sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_code', 500),
      sajilo.entities.BankAccount.filter({ is_active: true }, 'account_name', 200),
      sajilo.entities.BusinessPartner.filter({ is_vendor: true }, 'name', 500),
    ]);
    setAssets(data);
    const s = settingsData[0] || {};
    setSettings(s);
    setAccounts(accs);
    setBankAccounts(bankAccs);
    setVendors(partners);
    setLoading(false);
  };

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // ── Filtered assets ─────────────────────────────────────────────────────────
  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      if (filterStatus === 'active'  && a.status === 'Deleted') return false;
      if (filterStatus === 'deleted' && a.status !== 'Deleted') return false;
      if (filterLedger   !== 'all'  && a.asset_ledger_id !== filterLedger) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (a.asset_name       || '').toLowerCase().includes(q) ||
          (a.asset_code       || '').toLowerCase().includes(q) ||
          (a.asset_ledger_name|| '').toLowerCase().includes(q) ||
          (a.location         || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [assets, search, filterLedger, filterStatus]);

  // Unique asset ledgers for filter dropdown
  const ledgerOptions = useMemo(() => {
    const seen = new Map();
    assets.forEach(a => { if (a.asset_ledger_id) seen.set(a.asset_ledger_id, a.asset_ledger_name || a.asset_ledger_id); });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [assets]);

  // ── Validation ───────────────────────────────────────────────────────────────
  const validateForm = () => {
    if (!form.asset_name) { toast.error('Asset name is required'); return false; }
    return true;
  };

  // ── Save ─────────────────────────────────────────────────────────────────────
  const save = async () => {
    setShowValidation(true);
    if (!validateForm()) return;
    setSaving(true);
    try {
  const nbv = calcNBV(form.gross_purchase_value, form.salvage_value, form.accumulated_depreciation);
      const payload = { ...form, net_book_value: nbv };

      if (editing) {
        const originalAsset = assets.find(a => a.id === editing);
        await sajilo.entities.FixedAsset.update(editing, payload);

        // Post GL if: ledger is newly set OR ledger changed (old one different from new one)
        const ledgerChanged = payload.asset_ledger_id && payload.asset_ledger_id !== originalAsset?.asset_ledger_id;
        const wasUnposted   = !originalAsset?.gl_posted;
        const nowHasLedger  = payload.asset_ledger_id && (payload.gross_purchase_value || 0) > 0;

        if (nowHasLedger && (wasUnposted || ledgerChanged)) {
          const creditAcc = payload.payment_account_id
            ? { id: payload.payment_account_id, name: payload.payment_account_name }
            : null;
          const journalId = await postAssetPurchase({ ...payload, id: editing }, settings, false, null, creditAcc);
          if (journalId) {
            await sajilo.entities.FixedAsset.update(editing, { gl_posted: true });
            // Create financial voucher
            if (payload.payment_account_id) {
              const voucherNumber = `APV-${Date.now().toString().slice(-6)}`;
              await sajilo.entities.FinancialVoucher.create({
                voucher_number: voucherNumber,
                voucher_type: 'Journal',
                voucher_date: payload.purchase_date || new Date().toISOString().split('T')[0],
                total_amount: payload.gross_purchase_value,
                payment_mode: payload.payment_method_type === 'party_ledger' ? 'Bank Transfer' : 'Cash',
                reference_no: originalAsset?.asset_code,
                status: 'Posted',
                narration: `Asset Purchase — ${payload.asset_name}`,
                entries: [
                  { account_name: payload.asset_ledger_name, account_type: 'Asset', debit: payload.gross_purchase_value, credit: 0, narration: `DR Asset: ${payload.asset_name}` },
                  { account_name: payload.payment_account_name, account_type: payload.payment_method_type === 'party_ledger' ? 'Liability' : 'Asset', debit: 0, credit: payload.gross_purchase_value, narration: `CR Payment` },
                ],
              });
            }
            toast.success('Asset updated & journal posted to GL');
          } else {
            toast.success('Asset updated (check Settings → GL Accounts for posting)');
          }
        } else {
          toast.success('Asset updated');
        }
      } else {
        const code = `AST-${String(assets.length + 1).padStart(3, '0')}`;
        const created = await sajilo.entities.FixedAsset.create({ ...payload, asset_code: code });

        if (created.asset_ledger_id && settings) {
          const creditAcc = created.payment_account_id
            ? { id: created.payment_account_id, name: created.payment_account_name }
            : null;
          const journalId = await postAssetPurchase(created, settings, false, null, creditAcc);
          if (journalId) {
            await sajilo.entities.FixedAsset.update(created.id, { gl_posted: true });
            // Create financial voucher
            if (created.payment_account_id) {
              const voucherNumber = `APV-${Date.now().toString().slice(-6)}`;
              await sajilo.entities.FinancialVoucher.create({
                voucher_number: voucherNumber,
                voucher_type: 'Journal',
                voucher_date: created.purchase_date || new Date().toISOString().split('T')[0],
                total_amount: created.gross_purchase_value,
                payment_mode: created.payment_method_type === 'party_ledger' ? 'Bank Transfer' : 'Cash',
                reference_no: created.asset_code,
                status: 'Posted',
                narration: `Asset Purchase — ${created.asset_name}`,
                entries: [
                  { account_name: created.asset_ledger_name, account_type: 'Asset', debit: created.gross_purchase_value, credit: 0, narration: `DR Asset: ${created.asset_name}` },
                  { account_name: created.payment_account_name, account_type: created.payment_method_type === 'party_ledger' ? 'Liability' : 'Asset', debit: 0, credit: created.gross_purchase_value, narration: `CR Payment` },
                ],
              });
            }
            toast.success('Asset created & journal posted to GL');
          } else {
            toast.success('Asset created (set payment account & GL Accounts in Settings to auto-post)');
          }
        } else {
          toast.success('Asset created');
        }
      }

      setOpen(false); setEditing(null); setForm(empty); setShowValidation(false);
      fetchData();     } catch (err) {
      toast.error(err.message || 'Error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (a) => { setForm(a); setEditing(a.id); setOpen(true); setShowValidation(false); };

  // ── Depreciation schedule ────────────────────────────────────────────────────
  const viewDepreciation = async (asset) => {
    setSelected(asset);
    const schedules = await sajilo.entities.DepreciationSchedule.filter({ asset_id: asset.id }, 'schedule_date', 60);
    setDepSchedule(schedules);
    setDepOpen(true);
  };

  const generateDepreciation = async () => {
    if (!selected) return;
    const monthly = calcMonthlyDep(selected, settings);
    const today = new Date();
    const existing = depSchedule.map(d => d.period_label);
    const periods = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!existing.includes(label)) {
        periods.push({
          asset_id: selected.id, asset_name: selected.asset_name, asset_code: selected.asset_code,
          schedule_date: d.toISOString().split('T')[0],
          calculated_depreciation_amount: parseFloat(monthly.toFixed(2)),
          is_posted: false, period_label: label,
        });
      }
    }
    if (periods.length === 0) return toast.info('Schedule already exists for next 12 months');
    await sajilo.entities.DepreciationSchedule.bulkCreate(periods);
    toast.success(`Generated ${periods.length} depreciation periods`);
    viewDepreciation(selected);
  };

  const postDepreciation = async (sched) => {
    setPosting(sched.id);
    const depAmount = sched.calculated_depreciation_amount;

    // Use new per-asset GL wiring via postAssetDepreciation
    const journalId = await postAssetDepreciation(selected, depAmount, sched.period_label, settings || {});
    if (!journalId) { setPosting(null); return; }

    const today = new Date().toISOString().split('T')[0];
    await sajilo.entities.DepreciationSchedule.update(sched.id, { is_posted: true, posted_date: today, posted_by: 'System' });
    const newAccum = (selected.accumulated_depreciation || 0) + depAmount;
    const newNBV   = calcNBV(selected.gross_purchase_value, selected.salvage_value, newAccum);
    await sajilo.entities.FixedAsset.update(selected.id, { accumulated_depreciation: newAccum, net_book_value: newNBV });
    setSelected(s => ({ ...s, accumulated_depreciation: newAccum, net_book_value: newNBV }));
    toast.success('Posted — Journal entry created in General Ledger');
    setPosting(null);
    viewDepreciation({ ...selected, accumulated_depreciation: newAccum, net_book_value: newNBV });
    fetchData();
  };

  const postAllPending = async () => {
    const pending = depSchedule.filter(s => !s.is_posted);
    if (pending.length === 0) return toast.info('No pending periods to post');
    for (const sched of pending) { await postDepreciation(sched); }
  };

  // ── Post GL for all unposted assets (retroactive) ───────────────────────────
  const [bulkPosting, setBulkPosting] = useState(false);

  const postAllUnpostedAssets = async () => {
    const unposted = assets.filter(a =>
      a.asset_ledger_id && !a.gl_posted && a.status !== 'Deleted' && (a.gross_purchase_value || 0) > 0
    );
    if (unposted.length === 0) { toast.info('All assets with ledger mappings are already posted to GL.'); return; }

    // Pre-validate: check for Group Ledger mappings before attempting to post
    const groupLedgerAssets = [];
    for (const asset of unposted) {
      const acc = accounts.find(a => a.id === asset.asset_ledger_id);
      if (acc && acc.ledger_type === 'Group Ledger') {
        groupLedgerAssets.push(`"${asset.asset_name}" → "${acc.account_name}" (Group Ledger)`);
      }
    }
    if (groupLedgerAssets.length > 0) {
      toast.error(
        `Cannot post — the following assets are mapped to a Group Ledger. Please re-map to a Sub Ledger account:\n${groupLedgerAssets.join('\n')}`,
        { duration: 10000 }
      );
      return;
    }

    setBulkPosting(true);

    // Resolve DITB once for assets that have no explicit payment account (bulk imports)
    const ditb = await resolveDifferenceInTrialBalance();

    let success = 0;
    for (const asset of unposted) {
      let journalId;
      if (!asset.payment_account_id && ditb) {
        // Bulk-imported asset: DR Asset Ledger / CR Difference in Trial Balance
        const gross = asset.gross_purchase_value || 0;
        const entryDate = asset.purchase_date || new Date().toISOString().slice(0, 10);
        const journal = await sajilo.entities.GeneralLedgerJournal.create({
          entry_date: entryDate,
          description: `Asset Purchase — ${asset.asset_name} (${asset.asset_code || ''})`,
          reference_module: 'Assets',
          source_document_id: asset.id,
          source_document_type: 'FixedAsset',
          status: 'Posted',
          total_debit: gross,
          total_credit: gross,
          is_balanced: true,
        });
        await sajilo.entities.GeneralLedgerLine.bulkCreate([
          { journal_id: journal.id, account_id: asset.asset_ledger_id, account_name: asset.asset_ledger_name, account_type: 'Asset', debit_amount: gross, credit_amount: 0, description: `Asset cost: ${asset.asset_name}` },
          { journal_id: journal.id, account_id: ditb.id, account_name: ditb.name, debit_amount: 0, credit_amount: gross, description: `Asset import: ${asset.asset_name}` },
        ]);
        // Update COA balances
        const [assetAcc, ditbAcc] = await Promise.all([
          sajilo.entities.ChartOfAccount.filter({ id: asset.asset_ledger_id }, 'account_code', 1).then(r => r[0]),
          sajilo.entities.ChartOfAccount.filter({ id: ditb.id }, 'account_code', 1).then(r => r[0]),
        ]);
        if (assetAcc) await sajilo.entities.ChartOfAccount.update(assetAcc.id, { current_balance: Math.round(((assetAcc.current_balance || 0) + gross) * 100) / 100 });
        if (ditbAcc) {
          const debitNormal = ['Asset', 'COGS', 'Expense', 'OPEX', 'Cost of Goods Sold', 'Other Expense'].includes(ditbAcc.account_type);
          const change = debitNormal ? -gross : gross;
          await sajilo.entities.ChartOfAccount.update(ditbAcc.id, { current_balance: Math.round(((ditbAcc.current_balance || 0) + change) * 100) / 100 });
        }
        journalId = journal.id;
      } else {
        // Asset created via form with payment account: use standard postAssetPurchase
        const creditAcc = asset.payment_account_id
          ? { id: asset.payment_account_id, name: asset.payment_account_name }
          : null;
        journalId = await postAssetPurchase(asset, settings || {}, false, accounts, creditAcc);
      }
      if (journalId) {
        await sajilo.entities.FixedAsset.update(asset.id, { gl_posted: true });
        success++;
      }
    }
    toast.success(`Posted ${success} of ${unposted.length} asset purchase journal(s) to GL`);
    setBulkPosting(false);
    fetchData();
  };

  const unpostedCount = assets.filter(a => a.asset_ledger_id && !a.gl_posted && a.status !== 'Deleted' && (a.gross_purchase_value || 0) > 0).length;

  // ── Bulk operations ──────────────────────────────────────────────────────────
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredAssets.length) setSelectedIds([]);
    else setSelectedIds(filteredAssets.map(a => a.id));
  };

  const toggleSelectOne = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleBulkStatus = async (newStatus) => {
    // Disposed/Sold require the disposal accounting workflow — open modal for each
    if (newStatus === 'Disposed' || newStatus === 'Sold') {
      const target = assets.filter(a => selectedIds.includes(a.id));
      if (target.length === 1) {
        setDisposalAsset({ ...target[0], _pendingStatus: newStatus });
        return;
      }
      // Multiple: run without proceeds (bulk scrap, no GL proceeds)
      for (const id of selectedIds) {
        await sajilo.entities.FixedAsset.update(id, { status: newStatus });
      }
      toast.warning(`${selectedIds.length} assets marked "${newStatus}". For proper disposal GL entries, use the individual Dispose button per asset.`);
      setSelectedIds([]);
      fetchData();
      return;
    }
    for (const id of selectedIds) {
      await sajilo.entities.FixedAsset.update(id, { status: newStatus });
    }
    toast.success(`${selectedIds.length} asset(s) set to "${newStatus}"`);
    setSelectedIds([]);
    fetchData();
  };

  const handleBulkDelete = async () => {
    const toDelete = assets.filter(a => selectedIds.includes(a.id));
    const user = await sajilo.auth.me();

    // Check for GL transactions on linked accounts before deleting
    const allGLLines = await sajilo.entities.GeneralLedgerLine.list('-created_date', 5000);
    const glAccountIds = new Set(allGLLines.map(l => l.account_id).filter(Boolean));

    const blocked = [];
    const safe = [];
    for (const asset of toDelete) {
      const linkedIds = [asset.asset_ledger_id, asset.accumulated_dep_ledger_id, asset.dep_expense_ledger_id].filter(Boolean);
      const hasGLActivity = linkedIds.some(id => glAccountIds.has(id));
      const hasNBV = (asset.net_book_value || 0) !== 0;
      if (hasGLActivity || hasNBV) {
        blocked.push(asset.asset_name);
      } else {
        safe.push(asset);
      }
    }

    if (blocked.length > 0) {
      toast.error(`Cannot delete: ${blocked.join(', ')} — these assets have posted GL transactions or a non-zero Net Book Value. Use Dispose instead.`, { duration: 8000 });
    }

    if (safe.length === 0) { setSelectedIds([]); return; }

    for (const asset of safe) {

      // Soft-delete: set status to Deleted
      await sajilo.entities.FixedAsset.update(asset.id, { status: 'Deleted' });
      // Write to audit log
      await sajilo.entities.FixedAssetDeleteLog.create({
        asset_id: asset.id,
        asset_code: asset.asset_code,
        asset_name: asset.asset_name,
        category: asset.category,
        gross_purchase_value: asset.gross_purchase_value,
        net_book_value: asset.net_book_value,
        status_before_delete: asset.status,
        deleted_by: user?.email || 'unknown',
        deleted_at: new Date().toISOString(),
        reason: 'Bulk delete',
        asset_snapshot: asset,
      });
    }
    if (safe.length > 0) toast.success(`${safe.length} asset(s) soft-deleted & logged`);
    setSelectedIds([]);
    fetchData();
  };

  const allChecked = filteredAssets.length > 0 && selectedIds.length === filteredAssets.length;
  const someChecked = selectedIds.length > 0 && selectedIds.length < filteredAssets.length;

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Fixed Assets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Asset register with IAS 16 depreciation &amp; GL posting</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)}>
            <TableProperties className="w-4 h-4 mr-1.5" />
            Bulk Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPurchaseOpen(true)}>
            <ShoppingCart className="w-4 h-4 mr-1.5" />
            Purchase Asset
          </Button>
          <Button size="sm" onClick={() => { setForm(empty); setEditing(null); setOpen(true); setShowValidation(false); }}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Asset
          </Button>
        </div>
      </div>

      {/* ── Unposted GL Banner ────────────────────────────────────────────── */}
      {unpostedCount > 0 && (() => {
        const groupLedgerAssets = assets.filter(a => {
          if (!a.asset_ledger_id || a.gl_posted || a.status === 'Deleted') return false;
          const acc = accounts.find(ac => ac.id === a.asset_ledger_id);
          return acc && acc.ledger_type === 'Group Ledger';
        });
        const hasGroupLedger = groupLedgerAssets.length > 0;
        return (
          <div className={`mb-4 border rounded-lg px-4 py-3 space-y-2 ${hasGroupLedger ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20' : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className={`flex items-center gap-2 text-sm ${hasGroupLedger ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  <strong>{unpostedCount} asset{unpostedCount > 1 ? 's' : ''}</strong> have ledger mappings but no GL purchase journal posted yet.
                  Post them to reflect asset values in Trial Balance &amp; Balance Sheet.
                </span>
              </div>
              {!hasGroupLedger && (
                <Button size="sm" onClick={postAllUnpostedAssets} disabled={bulkPosting}
                  className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white">
                  <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                  {bulkPosting ? 'Posting…' : `Post ${unpostedCount} to GL`}
                </Button>
              )}
            </div>
            {hasGroupLedger && (
              <div className="text-xs text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-500/20 rounded px-3 py-2 space-y-1">
                <p className="font-semibold">⚠ Cannot post — these assets are mapped to a <em>Group Ledger</em>. Transactions must use a <em>Sub Ledger</em> account:</p>
                {groupLedgerAssets.map(a => {
                  const acc = accounts.find(ac => ac.id === a.asset_ledger_id);
                  return (
                    <p key={a.id}>• <strong>{a.asset_name}</strong> → "{acc?.account_name}" is a Group Ledger.
                      <button className="ml-1 underline text-red-800 dark:text-red-300 font-medium" onClick={() => openEdit(a)}>Edit asset</button> and select a Sub Ledger instead.
                    </p>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Filters Bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search assets…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="deleted">Deleted Only</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterLedger} onValueChange={setFilterLedger}>
          <SelectTrigger className="w-52">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All Ledger Groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ledger Groups</SelectItem>
            {ledgerOptions.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Bulk Toolbar ──────────────────────────────────────────────────── */}
      <AssetBulkToolbar
        selectedIds={selectedIds}
        onBulkStatus={handleBulkStatus}
        onBulkDelete={handleBulkDelete}
        onClearSelection={() => setSelectedIds([])}
      />

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="border border-border rounded-xl overflow-hidden bg-card">
        <table className="table-fluid-grid text-sm">
          <thead className="cell-density bg-muted/40 border-b border-border">
            <tr>
              <th className="cell-density w-10">
                <Checkbox
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked; }}
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <th className="cell-density text-left text-xs font-semibold text-muted-foreground">Code</th>
              <th className="cell-density text-left text-xs font-semibold text-muted-foreground">Asset Name</th>
              <th className="cell-density text-left text-xs font-semibold text-muted-foreground">Assets Ledger</th>
              <th className="cell-density text-left text-xs font-semibold text-muted-foreground">Method</th>
              <th className="cell-density text-right text-xs font-semibold text-muted-foreground">Gross Value</th>
              <th className="cell-density text-right text-xs font-semibold text-muted-foreground">Accum. Dep.</th>
              <th className="cell-density text-right text-xs font-semibold text-muted-foreground">NBV</th>
              <th className="cell-density text-center text-xs font-semibold text-muted-foreground">GL</th>
              <th className="cell-density text-center text-xs font-semibold text-muted-foreground">Status</th>
              <th className="cell-density " />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 11 }).map((_, j) => (
                    <td key={j} className="cell-density "><div className="h-4 bg-muted animate-pulse rounded" /></td>
                  ))}
                </tr>
              ))
            ) : filteredAssets.length === 0 ? (
              <tr><td colSpan={11} className="cell-density text-center text-muted-foreground">No assets found.</td></tr>
            ) : filteredAssets.map(a => (
              <tr key={a.id} className={cn('hover:bg-muted/20 transition-colors', a.status === 'Deleted' && 'opacity-50')}>
                <td className="cell-density ">
                  <Checkbox checked={selectedIds.includes(a.id)} onCheckedChange={() => toggleSelectOne(a.id)} />
                </td>
                <td className="cell-density font-mono text-xs text-muted-foreground">{a.asset_code}</td>
                <td className="cell-density font-medium">{a.asset_name}</td>
                <td className="cell-density text-xs max-w-[160px]" title={a.asset_ledger_name}>
                  {!a.asset_ledger_id
                    ? <span className="text-amber-500 italic">Not mapped</span>
                    : (() => {
                        const acc = accounts.find(ac => ac.id === a.asset_ledger_id);
                        return acc?.ledger_type === 'Group Ledger'
                          ? <span className="text-red-500 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3 shrink-0" />{a.asset_ledger_name} <em className="text-red-400">(Group)</em></span>
                          : <span className="text-muted-foreground truncate block">{a.asset_ledger_name}</span>;
                      })()
                  }
                </td>
                <td className="cell-density ">
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">{a.depreciation_method}</span>
                </td>
                <td className="cell-density text-right font-mono text-xs">{fmt(a.gross_purchase_value)}</td>
                <td className="cell-density text-right font-mono text-xs text-amber-600 dark:text-amber-400">{fmt(a.accumulated_depreciation)}</td>
                <td className="cell-density text-right font-mono text-xs text-emerald-700 dark:text-emerald-400 font-semibold">{fmt(a.net_book_value)}</td>
                <td className="cell-density text-center">
                  {a.gl_posted
                    ? <span title="Purchase journal posted"><CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mx-auto" /></span>
                    : <span title="Purchase journal not yet posted"><AlertCircle className="w-4 h-4 text-amber-400 mx-auto" /></span>
                  }
                </td>
                <td className="cell-density text-center"><StatusBadge status={a.status} /></td>
                <td className="cell-density ">
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)} title="Edit"><Wrench className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => viewDepreciation(a)} title="Depreciation Schedule"><TrendingDown className="w-3 h-3" /></Button>
                    {(a.status === 'Active' || a.status === 'In Repair') && (
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:bg-red-500/10"
                        onClick={() => setDisposalAsset(a)} title="Dispose Asset">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && (
          <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
            {filteredAssets.length} record{filteredAssets.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* ── Asset Form Dialog ──────────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Asset' : 'New Fixed Asset'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Asset Name *</Label><Input value={form.asset_name} onChange={e => f('asset_name', e.target.value)} /></div>
            <div>
              <Label>Assets Ledger *</Label>
              <SearchableSelect
                options={assetLedgerOptions}
                value={form.asset_ledger_id || ''}
                onValueChange={v => {
                  const acc = accounts.find(a => a.id === v);
                  f('asset_ledger_id', v);
                  f('asset_ledger_name', acc?.account_name || '');
                }}
                placeholder="Search asset ledger accounts…"
              />
            </div>
            <div><Label>Purchase Date</Label><Input type="date" value={form.purchase_date} onChange={e => f('purchase_date', e.target.value)} /></div>
            <div><Label>Gross Purchase Value (NPR)</Label><Input type="number" value={form.gross_purchase_value} onChange={e => f('gross_purchase_value', parseFloat(e.target.value) || 0)} /></div>
            <div><Label>Salvage Value (NPR)</Label><Input type="number" value={form.salvage_value} onChange={e => f('salvage_value', parseFloat(e.target.value) || 0)} /></div>
            <div><Label>Useful Life (months)</Label><Input type="number" value={form.useful_life_months} onChange={e => f('useful_life_months', parseInt(e.target.value) || 0)} /></div>
            <div>
              <Label>Depreciation Method</Label>
              <Select value={form.depreciation_method} onValueChange={v => f('depreciation_method', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Straight-Line">Straight-Line (SLM)</SelectItem>
                  <SelectItem value="Written-Down Value">Written-Down Value (WDV)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => f('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Active', 'In Repair', 'Disposed', 'Sold'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Location</Label><Input value={form.location} onChange={e => f('location', e.target.value)} /></div>
            <div><Label>Assigned To</Label><Input value={form.assigned_to} onChange={e => f('assigned_to', e.target.value)} /></div>
            <div className="col-span-2"><Label>Notes</Label><Input value={form.notes} onChange={e => f('notes', e.target.value)} /></div>

            {/* ── Payment Method ── */}
            <div className="col-span-2 border-t border-border pt-4">
              <Label className="text-sm font-semibold text-foreground mb-3 block">Post Payment for this Asset?</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Payment Method</Label>
                  <Select value={form.payment_method_type} onValueChange={v => {
                    f('payment_method_type', v);
                    f('payment_account_id', '');
                    f('payment_account_name', '');
                  }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash_bank">Cash / Bank Account</SelectItem>
                      <SelectItem value="party_ledger">Post to Party Ledger (Supplier)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{form.payment_method_type === 'party_ledger' ? 'Supplier Ledger' : 'Cash / Bank Account'}</Label>
                  {form.payment_method_type === 'cash_bank' ? (
                    <Select
                      value={form.payment_account_id}
                      onValueChange={v => {
                        const acc = bankAccounts.find(b => b.gl_account_id === v);
                        f('payment_account_id', v);
                        f('payment_account_name', acc?.account_name || '');
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select cash/bank account…" /></SelectTrigger>
                      <SelectContent>
                        {bankAccounts.filter(b => b.gl_account_id).map(b => (
                          <SelectItem key={b.id} value={b.gl_account_id}>
                            {b.account_name} ({b.account_type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={form.payment_account_id}
                      onValueChange={v => {
                        const vendor = vendors.find(vn => vn.payable_account_id === v);
                        f('payment_account_id', v);
                        f('payment_account_name', vendor?.payable_account_name || vendor?.name || '');
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select supplier ledger…" /></SelectTrigger>
                      <SelectContent>
                        {vendors.filter(vn => vn.payable_account_id).map(vn => (
                          <SelectItem key={vn.id} value={vn.payable_account_id}>
                            {vn.name} — {vn.payable_account_name || 'AP Ledger'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </div>

            <div className="col-span-2 border-t border-border pt-4">
              <DocumentUploader
                label="Supporting Documents"
                urls={form.document_urls || []}
                onChange={urls => f('document_urls', urls)}
              />
            </div>
          </div>

          {form.gross_purchase_value > 0 && (
            <div className="mt-3 bg-muted/40 rounded-lg px-4 py-3 text-xs text-muted-foreground font-mono">
              Est. Monthly Depreciation: <strong className="text-foreground">{fmt(calcMonthlyDep(form, settings || {}))}</strong>
              {' '} | Annual: <strong className="text-foreground">{fmt(calcMonthlyDep(form, settings || {}) * 12)}</strong>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{editing ? 'Update' : 'Create'} Asset</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Purchase Asset Modal ──────────────────────────────────────────── */}
      <AssetPurchaseModal
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        assets={assets}
        accounts={accounts}
        bankAccounts={bankAccounts}
        vendors={vendors}
        settings={settings}
        onSaved={fetchData}
      />

      {/* ── Bulk Asset Creation Modal ─────────────────────────────────────── */}
      <BulkAssetCreation
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        accounts={accounts}
        assets={assets}
        settings={settings}
        onSaved={fetchData}
      />

      {/* ── Asset Disposal Modal ──────────────────────────────────────────── */}
      <AssetDisposalModal
        asset={disposalAsset}
        accounts={accounts}
        settings={settings}
        open={!!disposalAsset}
        onClose={() => { setDisposalAsset(null); setSelectedIds([]); }}
        onPosted={() => fetchData()}
      />

      {/* ── Depreciation Schedule Dialog ───────────────────────────────────── */}
      <Dialog open={depOpen} onOpenChange={setDepOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              Depreciation Schedule — {selected?.asset_name}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                <div><p className="text-xs text-muted-foreground">Gross Value</p><p className="font-semibold">{fmt(selected.gross_purchase_value)}</p></div>
                <div><p className="text-xs text-muted-foreground">Accumulated</p><p className="font-semibold text-amber-600 dark:text-amber-400">{fmt(selected.accumulated_depreciation)}</p></div>
                <div><p className="text-xs text-muted-foreground">Net Book Value</p><p className="font-semibold text-emerald-700 dark:text-emerald-400">{fmt(selected.net_book_value)}</p></div>
                <div><p className="text-xs text-muted-foreground">Monthly Charge</p><p className="font-semibold text-blue-700 dark:text-blue-400">{fmt(calcMonthlyDep(selected, settings || {}))}</p></div>
              </div>

              {/* Per-asset GL wiring summary */}
              <div className="flex flex-wrap gap-2 text-xs bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-lg px-3 py-2">
                <span className="font-semibold text-blue-800 dark:text-blue-300">GL Wiring:</span>
                {selected.dep_expense_ledger_name
                  ? <><span className="bg-card border border-blue-200 dark:border-blue-500/20 px-2 py-0.5 rounded text-blue-700 dark:text-blue-400">Dr: {selected.dep_expense_ledger_name}</span>
                    <span className="bg-card border border-blue-200 dark:border-blue-500/20 px-2 py-0.5 rounded text-blue-700 dark:text-blue-400">Cr: {selected.accumulated_dep_ledger_name || '—'}</span></>
                  : <span className="text-amber-600 dark:text-amber-400 italic">No per-asset ledger set — uses category defaults from Settings</span>
                }
              </div>

              <div className="flex justify-between items-center">
                <p className="text-sm font-medium">12-Month Rolling Schedule</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={generateDepreciation}>
                    <Calculator className="w-3.5 h-3.5 mr-1.5" /> Generate 12 Months
                  </Button>
                  <Button size="sm" onClick={postAllPending} disabled={!!posting}>
                    <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Post All Pending
                  </Button>
                </div>
              </div>

              <div className="border border-border rounded-xl overflow-hidden">
                <table className="table-fluid-grid text-sm">
                  <thead className="cell-density bg-muted/40 border-b border-border">
                    <tr>
                      <th className="cell-density text-left text-xs font-semibold text-muted-foreground">Period</th>
                      <th className="cell-density text-right text-xs font-semibold text-muted-foreground">Dep. Amount</th>
                      <th className="cell-density text-left text-xs font-semibold text-muted-foreground">Accounts</th>
                      <th className="cell-density text-center text-xs font-semibold text-muted-foreground">Status</th>
                      <th className="cell-density text-xs font-semibold text-muted-foreground">Posted</th>
                      <th className="cell-density " />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {depSchedule.length === 0 ? (
                      <tr><td colSpan={6} className="cell-density text-center text-muted-foreground text-sm">No schedule yet. Click "Generate 12 Months".</td></tr>
                    ) : depSchedule.map(s => (
                      <tr key={s.id} className={cn('transition-colors', s.is_posted ? 'bg-emerald-50 dark:bg-emerald-500/10/40' : 'hover:bg-muted/20')}>
                        <td className="cell-density font-mono text-sm">{s.period_label}</td>
                        <td className="cell-density text-right font-mono font-semibold text-amber-700 dark:text-amber-400">{fmt(s.calculated_depreciation_amount)}</td>
                        <td className="cell-density text-xs text-muted-foreground">
                          <div><span className="text-blue-600 dark:text-blue-400">Dr</span> {selected.dep_expense_ledger_name || 'Dep. Expense'}</div>
                          <div><span className="text-emerald-600 dark:text-emerald-400">Cr</span> {selected.accumulated_dep_ledger_name || 'Accum. Dep.'}</div>
                        </td>
                        <td className="cell-density text-center">
                          {s.is_posted
                            ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /> Posted</span>
                            : <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertCircle className="w-3.5 h-3.5" /> Pending</span>
                          }
                        </td>
                        <td className="cell-density text-xs text-muted-foreground">{s.posted_date || '—'}</td>
                        <td className="cell-density ">
                          {!s.is_posted && (
                            <Button size="sm" variant="outline" disabled={posting === s.id} onClick={() => postDepreciation(s)}>
                              <BookOpen className="w-3 h-3 mr-1" />
                              {posting === s.id ? 'Posting…' : 'Post + GL'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-muted/30 rounded-lg px-4 py-3 text-xs text-muted-foreground">
                <BookOpen className="w-3.5 h-3.5 inline mr-1.5" />
                "Post + GL" uses this asset's specific ledger mapping. Fallback accounts come from <strong>Settings → Fixed Assets Depreciation</strong>.
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}