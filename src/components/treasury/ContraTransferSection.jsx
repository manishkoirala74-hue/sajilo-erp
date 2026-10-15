import { useState, useMemo } from 'react';
import { 
  ArrowRight, 
  ArrowLeftRight, 
  Landmark, 
  Banknote, 
  Wallet, 
  AlertCircle, 
  CheckCircle2, 
  Sparkles, 
  SlidersHorizontal,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/shared/SearchableSelect';
import { cn } from '@/lib/utils';

// South Asian (Nepali/Indian) numbering words converter
function numberToSouthAsianWords(num) {
  const n = Math.floor(Math.abs(Number(num) || 0));
  if (n === 0) return 'Zero Rupees Only';

  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigit(numVal) {
    if (numVal < 20) return a[numVal];
    const tens = Math.floor(numVal / 10);
    const ones = numVal % 10;
    return b[tens] + (ones > 0 ? ' ' + a[ones] : '');
  }

  function convertThreeDigit(numVal) {
    let result = '';
    const hundred = Math.floor(numVal / 100);
    const rest = numVal % 100;
    if (hundred > 0) result += a[hundred] + ' Hundred';
    if (rest > 0) result += (result ? ' and ' : '') + convertTwoDigit(rest);
    return result;
  }

  let crore = Math.floor(n / 10000000);
  let remainder = n % 10000000;
  let lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  let thousand = Math.floor(remainder / 1000);
  remainder = remainder % 1000;
  let hundred = remainder;

  const parts = [];
  if (crore > 0) parts.push(convertThreeDigit(crore) + ' Crore');
  if (lakh > 0) parts.push(convertTwoDigit(lakh) + ' Lakh');
  if (thousand > 0) parts.push(convertTwoDigit(thousand) + ' Thousand');
  if (hundred > 0) parts.push(convertThreeDigit(hundred));

  return parts.join(' ') + ' Rupees Only';
}

export default function ContraTransferSection({
  form,
  setForm,
  cashAccounts = [],
  allAccounts = [],
  glBalances = {},
  contraMode = 'simple',
  setContraMode,
}) {
  const [amountInput, setAmountInput] = useState(
    form.total_amount && form.total_amount > 0 ? String(form.total_amount) : ''
  );

  // Helper to determine cash vs bank account
  const isCash = (acc) => {
    if (!acc) return false;
    if (acc.is_cash_account) return true;
    const name = (acc.account_name || '').toLowerCase();
    const sub = (acc.account_subtype || '').toLowerCase();
    return (name.includes('cash') || name.includes('petty') || sub.includes('cash')) && !name.includes('bank');
  };

  const isBank = (acc) => {
    if (!acc) return false;
    if (acc.is_bank_account) return true;
    const name = (acc.account_name || '').toLowerCase();
    const sub = (acc.account_subtype || '').toLowerCase();
    return name.includes('bank') || sub.includes('bank') || !isCash(acc);
  };

  // Segregate accounts for smart preset selection
  const cashOnlyAccounts = useMemo(() => cashAccounts.filter(isCash), [cashAccounts]);
  const bankOnlyAccounts = useMemo(() => cashAccounts.filter(isBank), [cashAccounts]);

  const sourceAccountId = form.source_account_id;
  const targetEntry = form.entries?.[0] || {};
  const targetAccountId = targetEntry.account_id;

  const sourceAccount = allAccounts.find(a => a.id === sourceAccountId) || cashAccounts.find(a => a.id === sourceAccountId);
  const targetAccount = allAccounts.find(a => a.id === targetAccountId) || cashAccounts.find(a => a.id === targetAccountId);

  // Live balance lookups
  const getLiveBalance = (accountId) => {
    if (!accountId) return 0;
    if (glBalances[accountId] !== undefined) return glBalances[accountId];
    const acc = allAccounts.find(a => a.id === accountId);
    return acc?.current_balance || 0;
  };

  const fromBalance = getLiveBalance(sourceAccountId);
  const toBalance = getLiveBalance(targetAccountId);

  const transferAmount = parseFloat(amountInput) || 0;
  const fromProjected = fromBalance - transferAmount;
  const toProjected = toBalance + transferAmount;

  const formatNpr = (n) => `NPR ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Determine current active transaction type
  const isCashDeposit = isCash(sourceAccount) && isBank(targetAccount);
  const isCashWithdrawal = isBank(sourceAccount) && isCash(targetAccount);
  const isBankTransfer = isBank(sourceAccount) && isBank(targetAccount);
  const isCashTransfer = isCash(sourceAccount) && isCash(targetAccount);

  // Quick preset handlers
  const applyPreset = (type) => {
    const defaultCash = cashOnlyAccounts[0] || cashAccounts[0];
    const defaultBank = bankOnlyAccounts[0] || cashAccounts.find(a => a.id !== defaultCash?.id);
    const secondBank = bankOnlyAccounts[1] || bankOnlyAccounts[0];

    let newSource = null;
    let newTarget = null;
    let defaultMode = 'Cash';

    if (type === 'deposit') {
      newSource = defaultCash;
      newTarget = defaultBank;
      defaultMode = 'Cash Deposit';
    } else if (type === 'withdrawal') {
      newSource = defaultBank;
      newTarget = defaultCash;
      defaultMode = 'Cheque';
    } else if (type === 'bank_transfer') {
      newSource = defaultBank;
      newTarget = secondBank && secondBank.id !== defaultBank?.id ? secondBank : null;
      defaultMode = 'Bank Transfer';
    }

    if (newSource) {
      updateSourceAccount(newSource.id);
    }
    if (newTarget) {
      updateTargetAccount(newTarget.id);
    }
    setForm(prev => ({
      ...prev,
      payment_mode: defaultMode
    }));
  };

  // Swap From & To accounts in 1 click
  const handleSwap = () => {
    if (!sourceAccountId && !targetAccountId) return;
    const oldSourceId = sourceAccountId;
    const oldTargetId = targetAccountId;

    const newSourceAcc = targetAccount;
    const newTargetAcc = sourceAccount;

    const amt = parseFloat(amountInput) || 0;

    setForm(prev => {
      const updatedEntries = [...prev.entries];
      updatedEntries[0] = {
        ...updatedEntries[0],
        account_id: oldSourceId || '',
        account_name: newTargetAcc?.account_name || '',
        account_code: newTargetAcc?.account_code || '',
        account_type: newTargetAcc?.account_type || 'Asset',
        debit: amt,
        credit: 0,
        narration: prev.narration || ''
      };

      return {
        ...prev,
        source_account_id: oldTargetId || '',
        source_account_name: newSourceAcc?.account_name || '',
        source_account_code: newSourceAcc?.account_code || '',
        source_account_type: newSourceAcc?.account_type || 'Asset',
        entries: updatedEntries,
        total_amount: amt
      };
    });
  };

  const updateSourceAccount = (id) => {
    const acc = allAccounts.find(a => a.id === id);
    setForm(prev => ({
      ...prev,
      source_account_id: id,
      source_account_name: acc?.account_name || '',
      source_account_code: acc?.account_code || '',
      source_account_type: acc?.account_type || 'Asset'
    }));
  };

  const updateTargetAccount = (id) => {
    const acc = allAccounts.find(a => a.id === id);
    const amt = parseFloat(amountInput) || 0;
    setForm(prev => {
      const updatedEntries = [...(prev.entries || [])];
      updatedEntries[0] = {
        ...(updatedEntries[0] || {}),
        account_id: id,
        account_name: acc?.account_name || '',
        account_code: acc?.account_code || '',
        account_type: acc?.account_type || 'Asset',
        debit: amt,
        credit: 0,
        narration: prev.narration || ''
      };
      return {
        ...prev,
        entries: updatedEntries
      };
    });
  };

  const handleAmountChange = (val) => {
    setAmountInput(val);
    const amt = parseFloat(val) || 0;
    setForm(prev => {
      const updatedEntries = [...(prev.entries || [])];
      if (updatedEntries.length === 0) {
        updatedEntries.push({ account_id: '', debit: amt, credit: 0, narration: '' });
      } else {
        updatedEntries[0] = {
          ...updatedEntries[0],
          debit: amt,
          credit: 0
        };
      }
      return {
        ...prev,
        entries: updatedEntries,
        total_amount: amt
      };
    });
  };

  // Smart narration generator
  const generateSuggestedNarration = () => {
    if (!sourceAccount && !targetAccount) return;
    const srcName = sourceAccount?.account_name || 'Source';
    const tgtName = targetAccount?.account_name || 'Destination';
    const amtStr = transferAmount > 0 ? ` of ${formatNpr(transferAmount)}` : '';
    const refStr = form.reference_no ? ` via Ref #${form.reference_no}` : '';

    let text = '';
    if (isCashDeposit) {
      text = `Cash deposit${amtStr} into ${tgtName}${refStr}`;
    } else if (isCashWithdrawal) {
      text = `Cash withdrawal${amtStr} from ${srcName} to ${tgtName}${refStr}`;
    } else if (isBankTransfer) {
      text = `Fund transfer${amtStr} from ${srcName} to ${tgtName}${refStr}`;
    } else {
      text = `Internal contra transfer${amtStr} from ${srcName} to ${tgtName}${refStr}`;
    }

    setForm(prev => {
      const updatedEntries = [...(prev.entries || [])];
      if (updatedEntries[0]) updatedEntries[0].narration = text;
      return { ...prev, narration: text, entries: updatedEntries };
    });
  };

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      {/* Header bar with Quick Action Chips & Fallback Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-muted/40 rounded-xl border border-border">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase mr-1">Quick Actions:</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => applyPreset('deposit')}
            className={cn(
              "h-8 text-xs font-medium rounded-lg transition-all",
              isCashDeposit && "bg-emerald-500/10 border-emerald-500/50 text-emerald-700 dark:text-emerald-400 font-semibold ring-1 ring-emerald-500/30"
            )}
          >
            <Landmark className="w-3.5 h-3.5 mr-1 text-emerald-600 dark:text-emerald-400" />
            Deposit to Bank
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => applyPreset('withdrawal')}
            className={cn(
              "h-8 text-xs font-medium rounded-lg transition-all",
              isCashWithdrawal && "bg-blue-500/10 border-blue-500/50 text-blue-700 dark:text-blue-400 font-semibold ring-1 ring-blue-500/30"
            )}
          >
            <Banknote className="w-3.5 h-3.5 mr-1 text-blue-600 dark:text-blue-400" />
            Withdraw to Cash
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => applyPreset('bank_transfer')}
            className={cn(
              "h-8 text-xs font-medium rounded-lg transition-all",
              isBankTransfer && "bg-purple-500/10 border-purple-500/50 text-purple-700 dark:text-purple-400 font-semibold ring-1 ring-purple-500/30"
            )}
          >
            <ArrowLeftRight className="w-3.5 h-3.5 mr-1 text-purple-600 dark:text-purple-400" />
            Bank Transfer
          </Button>
        </div>

        {/* Fallback to detailed multi-row mode */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setContraMode('detailed')}
          className="text-xs text-muted-foreground hover:text-foreground shrink-0 h-8 gap-1.5"
          title="Switch to advanced multi-split ledger table"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Multi-Row Mode</span>
        </Button>
      </div>

      {/* Directional Flow: FROM -> TO Cards */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] items-center gap-3">
        {/* Source Card (Paid From / Outflow) */}
        <div className="p-4 rounded-xl border border-red-200/60 dark:border-red-950/40 bg-gradient-to-b from-red-500/[0.03] to-transparent shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Transfer From (Outflow / Credit) *
            </span>
            {sourceAccount && (
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                {isCash(sourceAccount) ? <Wallet className="w-3 h-3 text-amber-500" /> : <Landmark className="w-3 h-3 text-blue-500" />}
                {sourceAccount.account_type}
              </span>
            )}
          </div>

          <SearchableSelect
            options={cashAccounts.map(a => ({
              value: a.id,
              label: `${a.account_name} (${a.account_type || 'Cash/Bank'})`
            }))}
            value={sourceAccountId}
            onChange={updateSourceAccount}
            placeholder="Select Source Account"
            className="w-full"
          />

          {sourceAccountId ? (
            <div className="pt-1 border-t border-border/50 text-xs flex justify-between items-center">
              <span className="text-muted-foreground">Current Balance:</span>
              <span className="font-mono font-semibold text-foreground">{formatNpr(fromBalance)}</span>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground italic">Select account money is taken from</p>
          )}

          {sourceAccountId && transferAmount > 0 && (
            <div className={cn(
              "px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between font-medium",
              fromProjected < 0 
                ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-800" 
                : "bg-muted text-muted-foreground"
            )}>
              <span>Balance After:</span>
              <span className="font-mono font-bold">
                {fromProjected < 0 && '⚠️ '}{formatNpr(fromProjected)}
              </span>
            </div>
          )}
        </div>

        {/* Swap Direction Button */}
        <div className="flex justify-center my-[-4px] md:my-0">
          <button
            type="button"
            onClick={handleSwap}
            title="Swap Source and Destination"
            aria-label="Swap accounts"
            className="p-2.5 rounded-full bg-card border border-border shadow-sm hover:bg-muted text-muted-foreground hover:text-foreground active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
        </div>

        {/* Destination Card (Deposited To / Inflow) */}
        <div className="p-4 rounded-xl border border-emerald-200/60 dark:border-emerald-950/40 bg-gradient-to-b from-emerald-500/[0.03] to-transparent shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Transfer To (Inflow / Debit) *
            </span>
            {targetAccount && (
              <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                {isCash(targetAccount) ? <Wallet className="w-3 h-3 text-amber-500" /> : <Landmark className="w-3 h-3 text-blue-500" />}
                {targetAccount.account_type}
              </span>
            )}
          </div>

          <SearchableSelect
            options={cashAccounts
              .filter(a => a.id !== sourceAccountId)
              .map(a => ({
                value: a.id,
                label: `${a.account_name} (${a.account_type || 'Cash/Bank'})`
              }))}
            value={targetAccountId}
            onChange={updateTargetAccount}
            placeholder="Select Destination Account"
            className="w-full"
          />

          {targetAccountId ? (
            <div className="pt-1 border-t border-border/50 text-xs flex justify-between items-center">
              <span className="text-muted-foreground">Current Balance:</span>
              <span className="font-mono font-semibold text-foreground">{formatNpr(toBalance)}</span>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground italic">Select account receiving the funds</p>
          )}

          {targetAccountId && transferAmount > 0 && (
            <div className="px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between font-medium bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              <span>Balance After:</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                {formatNpr(toProjected)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Transfer Amount & Transaction Details */}
      <div className="p-4 bg-card rounded-xl border border-border shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Amount Input with Words Display */}
          <div className="space-y-1.5">
            <Label htmlFor="contra-amount" className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Transfer Amount (NPR) *</span>
              {transferAmount > 0 && (
                <span className="text-[11px] font-mono font-bold text-primary">
                  {formatNpr(transferAmount)}
                </span>
              )}
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">NPR</span>
              <Input
                id="contra-amount"
                type="number"
                min="0"
                step="any"
                value={amountInput}
                onChange={e => handleAmountChange(e.target.value)}
                placeholder="0.00"
                className="pl-12 text-base font-semibold font-mono h-10"
              />
            </div>
            {transferAmount > 0 && (
              <p className="text-[11px] text-muted-foreground font-medium italic line-clamp-1">
                {numberToSouthAsianWords(transferAmount)}
              </p>
            )}
          </div>

          {/* Transfer Mode */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Transfer / Instrument Mode</Label>
            <Select
              value={form.payment_mode || 'Cash Deposit'}
              onValueChange={v => setForm({ ...form, payment_mode: v })}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash Deposit">Cash Deposit (Bank Slip)</SelectItem>
                <SelectItem value="Cheque">Cheque</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer (ConnectIPS / RTGS / Fonepay)</SelectItem>
                <SelectItem value="Cash Withdrawal">ATM / Cash Withdrawal</SelectItem>
                <SelectItem value="Cash">Cash in Hand</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Secondary Details: Reference No, Bearer/Deposited By, Narration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="contra-ref" className="text-xs font-semibold text-foreground">
              Reference / Cheque / Deposit Slip No
            </Label>
            <Input
              id="contra-ref"
              value={form.reference_no || ''}
              onChange={e => setForm({ ...form, reference_no: e.target.value })}
              placeholder="e.g. Slip #1234 or Cheque #0948"
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contra-bearer" className="text-xs font-semibold text-foreground">
              Deposited / Handled By <span className="text-muted-foreground font-normal">(Optional Staff/Bearer)</span>
            </Label>
            <Input
              id="contra-bearer"
              value={form.contact_name || ''}
              onChange={e => setForm({ ...form, contact_name: e.target.value })}
              placeholder="e.g. Ram Shrestha (Staff)"
              className="h-10"
            />
          </div>
        </div>

        {/* Narration with Auto-Suggestion */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="contra-narration" className="text-xs font-semibold text-foreground">
              Narration / Memo
            </Label>
            <button
              type="button"
              onClick={generateSuggestedNarration}
              className="text-xs text-primary hover:underline flex items-center gap-1 font-medium focus:outline-none"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Suggest Narration</span>
            </button>
          </div>
          <Input
            id="contra-narration"
            value={form.narration || ''}
            onChange={e => {
              const val = e.target.value;
              setForm(prev => {
                const updatedEntries = [...(prev.entries || [])];
                if (updatedEntries[0]) updatedEntries[0].narration = val;
                return { ...prev, narration: val, entries: updatedEntries };
              });
            }}
            placeholder="Description of the transaction"
            className="h-10"
          />
        </div>
      </div>

      {/* Accounting Double-Entry Impact Preview */}
      <div className="p-3.5 rounded-xl border border-blue-200/70 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 text-xs space-y-2">
        <div className="flex items-center justify-between text-blue-800 dark:text-blue-300 font-semibold">
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            General Ledger Posting Preview
          </span>
          {transferAmount > 0 && sourceAccountId && targetAccountId && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3" /> Balanced
            </span>
          )}
        </div>

        {sourceAccountId && targetAccountId && transferAmount > 0 ? (
          <div className="font-mono space-y-1 bg-card/60 p-2.5 rounded-lg border border-border/40">
            <div className="flex justify-between items-center text-foreground">
              <span>Dr. {targetAccount?.account_name || 'Destination Account'} <span className="text-[10px] text-muted-foreground font-sans">(Asset Increases)</span></span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatNpr(transferAmount)}</span>
            </div>
            <div className="flex justify-between items-center text-foreground pl-4">
              <span>Cr. {sourceAccount?.account_name || 'Source Account'} <span className="text-[10px] text-muted-foreground font-sans">(Asset Decreases)</span></span>
              <span className="font-bold text-red-600 dark:text-red-400">{formatNpr(transferAmount)}</span>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground italic">
            Select both Source and Destination accounts and enter an amount to preview the debits and credits.
          </p>
        )}
      </div>
    </div>
  );
}
