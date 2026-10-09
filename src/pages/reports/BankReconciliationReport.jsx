import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sajilo } from '@/api/sajiloClient';
import { useDateFormat } from '@/lib/DateFormatContext';
import { format } from 'date-fns';
import {
  ArrowLeft, Landmark, Printer, RefreshCw, FileSpreadsheet, Download,
  CheckCircle2, AlertTriangle, ArrowDownLeft, ArrowUpRight, DollarSign,
  Calendar, Save, RotateCcw, PlusCircle, Search, HelpCircle, Eye,
  ChevronDown, ChevronUp, Info, Check, ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { BSDatePicker } from '@/components/reports/ReportFilterBar';
import VoucherLink from '@/components/shared/VoucherLink';
import SearchableSelect from '@/components/shared/SearchableSelect';
import { useAmountFormatter } from '@/hooks/useAmountFormatter';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  fetchBankReconciliationReport,
  saveBankReconciliationSession,
  postAdjustmentJournalVoucher
} from '@/lib/reports/bankReconciliationService';
import { generateBankReconciliationVectorPDF } from '@/utils/reportPdfEngine';
import { exportBankReconciliationXLSX } from '@/lib/reports/reportExcelExport';

export default function BankReconciliationReport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatDate, displayBsDate } = useDateFormat();
  const { formatAmount, formatNumber } = useAmountFormatter();
  const { activeCompany, user } = useAuth();
  const companyId = activeCompany?.id || sajilo.getCompanyId();

  // ── Filters & Parameter State ──
  const [bankAccountId, setBankAccountId] = useState('');
  const [statementDate, setStatementDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [statementBalance, setStatementBalance] = useState('');

  // ── Bank Accounts Catalogue ──
  const [bankAccounts, setBankAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // ── In-Memory Optimistic State (Zero Network Latency) ──
  const [cheques, setCheques] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [clearedItems, setClearedItems] = useState([]);
  const [bookBalance, setBookBalance] = useState(0);
  const [adjustments, setAdjustments] = useState({
    bankCharges: 0,
    bankInterest: 0,
    otherAdjustments: 0,
  });
  const [sessionStatus, setSessionStatus] = useState('Draft');
  const [sessionNotes, setSessionNotes] = useState('');
  const [dirtyLineIds, setDirtyLineIds] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isPdfExporting, setIsPdfExporting] = useState(false);
  const [isExcelExporting, setIsExcelExporting] = useState(false);

  // ── Tab Navigation & Search ──
  const [activeTab, setActiveTab] = useState('cheques'); // 'cheques' | 'deposits' | 'adjustments' | 'cleared'
  const [searchTerm, setSearchTerm] = useState('');
  const [isBrsWalkOpen, setIsBrsWalkOpen] = useState(false); // Collapsible formal BRS walk schedule

  // ── Actionable Adjustment Modal State ──
  const [adjModalOpen, setAdjModalOpen] = useState(false);
  const [adjType, setAdjType] = useState('BankCharge'); // 'BankCharge' | 'BankInterest'
  const [adjAmount, setAdjAmount] = useState('');
  const [adjAccountId, setAdjAccountId] = useState('');
  const [adjNarration, setAdjNarration] = useState('');
  const [adjPosting, setAdjPosting] = useState(false);
  const [allAccounts, setAllAccounts] = useState([]);

  // 1. Fetch Company Bank Accounts
  useEffect(() => {
    async function loadBanks() {
      try {
        setLoadingAccounts(true);
        const [banks, coa] = await Promise.all([
          sajilo.entities.BankAccount.filter({ is_active: true }),
          sajilo.entities.ChartOfAccount.filter({ is_active: true }, 'account_name', 500)
        ]);

        const validBanks = (banks || []).filter(b => b.account_type === 'Bank' || b.bank_name);
        setBankAccounts(validBanks);
        setAllAccounts(coa || []);

        if (validBanks.length > 0 && !bankAccountId) {
          setBankAccountId(validBanks[0].id);
        }
      } catch (err) {
        console.error('Failed to load bank accounts:', err);
      } finally {
        setLoadingAccounts(false);
      }
    }
    loadBanks();
  }, [companyId]);

  // Selected Bank Object
  const selectedBank = useMemo(() => {
    return bankAccounts.find(b => b.id === bankAccountId) || null;
  }, [bankAccounts, bankAccountId]);

  // 2. Fetch Reconciliation Report Query
  const {
    data: reportData,
    isLoading: isReportLoading,
    isFetching,
    refetch
  } = useQuery({
    queryKey: ['company', companyId, 'bankReconciliation', bankAccountId, statementDate],
    queryFn: () => fetchBankReconciliationReport({
      companyId,
      bankAccountId,
      statementDate,
      statementBalance: Number(statementBalance) || 0
    }),
    enabled: !!(companyId && bankAccountId && statementDate),
    staleTime: 60 * 1000
  });

  // 3. Sync Server Data to Local In-Memory State on fetch
  useEffect(() => {
    if (reportData) {
      setCheques(reportData.uncleared_cheques || []);
      setDeposits(reportData.uncleared_deposits || []);
      setClearedItems(reportData.cleared_items || []);
      setBookBalance(reportData.book_balance || 0);
      setAdjustments({
        bankCharges: reportData.bank_charges || 0,
        bankInterest: reportData.bank_interest || 0,
        otherAdjustments: reportData.adjustments || 0,
      });
      setSessionStatus(reportData.session_status || 'Draft');
      if (statementBalance === '' && reportData.statement_balance) {
        setStatementBalance(String(reportData.statement_balance));
      }
      setDirtyLineIds(new Set());
    }
  }, [reportData]);

  // ── Live In-Memory Mathematical Derivations (60 FPS) ──
  const activeUnclearedCheques = useMemo(() => {
    return cheques.filter(c => !c.is_cleared || (c.cleared_date && c.cleared_date > statementDate));
  }, [cheques, statementDate]);

  const activeUnclearedDeposits = useMemo(() => {
    return deposits.filter(d => !d.is_cleared || (d.cleared_date && d.cleared_date > statementDate));
  }, [deposits, statementDate]);

  const totalUnclearedCheques = useMemo(() => {
    return activeUnclearedCheques.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  }, [activeUnclearedCheques]);

  const totalUnclearedDeposits = useMemo(() => {
    return activeUnclearedDeposits.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  }, [activeUnclearedDeposits]);

  const numStatementBalance = Number(statementBalance) || 0;
  const hasStatementBalance = statementBalance !== '' && !isNaN(Number(statementBalance));

  const adjustedBankBalance = useMemo(() => {
    return numStatementBalance + totalUnclearedDeposits - totalUnclearedCheques;
  }, [numStatementBalance, totalUnclearedDeposits, totalUnclearedCheques]);

  const adjustedBookBalance = useMemo(() => {
    return bookBalance + (Number(adjustments.bankInterest) || 0) - (Number(adjustments.bankCharges) || 0) + (Number(adjustments.otherAdjustments) || 0);
  }, [bookBalance, adjustments]);

  const differenceAmount = useMemo(() => {
    return Math.round((adjustedBankBalance - adjustedBookBalance) * 100) / 100;
  }, [adjustedBankBalance, adjustedBookBalance]);

  const isReconciled = hasStatementBalance && Math.abs(differenceAmount) < 0.01;

  // ── Optimistic Toggle with Smart Date Defaulting ──
  const handleToggleClear = (item, lineType) => {
    const nextCleared = !item.is_cleared;
    // Smart Date: default to statementDate when clearing, null when unclearing
    const nextDate = nextCleared ? (item.cleared_date || statementDate) : null;

    if (lineType === 'Cheque') {
      setCheques(prev => prev.map(c => c.gl_line_id === item.gl_line_id ? { ...c, is_cleared: nextCleared, cleared_date: nextDate } : c));
    } else if (lineType === 'Deposit') {
      setDeposits(prev => prev.map(d => d.gl_line_id === item.gl_line_id ? { ...d, is_cleared: nextCleared, cleared_date: nextDate } : d));
    }

    setDirtyLineIds(prev => new Set(prev).add(item.gl_line_id));
  };

  const handleUpdateClearedDate = (item, lineType, newDate) => {
    if (lineType === 'Cheque') {
      setCheques(prev => prev.map(c => c.gl_line_id === item.gl_line_id ? { ...c, cleared_date: newDate } : c));
    } else if (lineType === 'Deposit') {
      setDeposits(prev => prev.map(d => d.gl_line_id === item.gl_line_id ? { ...d, cleared_date: newDate } : d));
    }
    setDirtyLineIds(prev => new Set(prev).add(item.gl_line_id));
  };

  // Batch Select All / Unclear All
  const handleBatchClear = (lineType, clearAll = true) => {
    const targetItems = lineType === 'Cheque' ? cheques : deposits;
    const updateFn = prev => prev.map(item => ({
      ...item,
      is_cleared: clearAll,
      cleared_date: clearAll ? (item.cleared_date || statementDate) : null
    }));

    if (lineType === 'Cheque') setCheques(updateFn);
    else setDeposits(updateFn);

    setDirtyLineIds(prev => {
      const next = new Set(prev);
      targetItems.forEach(i => next.add(i.gl_line_id));
      return next;
    });
  };

  // ── Atomic Batch Save Action ──
  const handleSaveReconciliation = async (lockSession = false) => {
    if (!bankAccountId) return toast.error('Select a Bank Account');
    if (!statementDate) return toast.error('Select a Statement Date');

    setIsSaving(true);
    try {
      const targetStatus = lockSession ? 'Reconciled' : 'Draft';

      // Gather all lines that have been touched or modified
      const allLines = [...cheques, ...deposits];
      const lineUpdates = allLines
        .filter(l => dirtyLineIds.has(l.gl_line_id) || l.is_cleared)
        .map(l => ({
          gl_line_id: l.gl_line_id,
          journal_id: l.journal_id,
          voucher_no: l.voucher_no,
          reference_no: l.reference_no || l.cheque_no || l.slip_no,
          transaction_date: l.transaction_date,
          cleared_date: l.cleared_date,
          is_cleared: l.is_cleared,
          line_type: l.line_type,
          amount: Number(l.amount) || 0
        }));

      await saveBankReconciliationSession({
        companyId,
        bankAccountId,
        statementDate,
        statementBalance: numStatementBalance,
        bookBalance,
        bankCharges: Number(adjustments.bankCharges) || 0,
        bankInterest: Number(adjustments.bankInterest) || 0,
        adjustments: Number(adjustments.otherAdjustments) || 0,
        reconciledBalance: adjustedBankBalance,
        differenceAmount,
        status: targetStatus,
        notes: sessionNotes,
        lineUpdates
      });

      setSessionStatus(targetStatus);
      setDirtyLineIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['company', companyId, 'bankReconciliation'] });
      toast.success(lockSession ? 'Reconciliation locked & marked as Reconciled!' : 'Reconciliation progress saved successfully!');
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('Failed to save reconciliation: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Actionable Adjustments ("Post to Ledger") ──
  const openAdjustmentModal = (type) => {
    setAdjType(type);
    const amountVal = type === 'BankCharge' ? adjustments.bankCharges : adjustments.bankInterest;
    setAdjAmount(amountVal ? String(amountVal) : '');
    setAdjNarration(type === 'BankCharge' ? `Bank service charges as per statement dated ${statementDate}` : `Bank interest credited as per statement dated ${statementDate}`);

    // Auto-select sensible account
    const accounts = allAccounts.filter(a => type === 'BankCharge' ? ['Expense', 'OPEX'].includes(a.account_type) : a.account_type === 'Revenue');
    const defaultAcc = accounts.find(a => (a.account_name || '').toLowerCase().includes(type === 'BankCharge' ? 'bank charge' : 'interest')) || accounts[0];
    setAdjAccountId(defaultAcc?.id || '');
    setAdjModalOpen(true);
  };

  const handlePostAdjustment = async () => {
    if (!adjAmount || Number(adjAmount) <= 0) return toast.error('Enter a valid amount');
    if (!adjAccountId) return toast.error('Select an Account');

    setAdjPosting(true);
    try {
      await postAdjustmentJournalVoucher({
        companyId,
        bankAccount: selectedBank,
        statementDate,
        type: adjType,
        amount: Number(adjAmount),
        offsetAccountId: adjAccountId,
        description: adjNarration
      });

      setAdjModalOpen(false);
      // Re-fetch report data so newly posted GL line appears in BRS
      await refetch();
    } catch (err) {
      console.error('Post adjustment failed:', err);
      toast.error(err.message || 'Failed to post adjustment voucher');
    } finally {
      setAdjPosting(false);
    }
  };

  // ── Export Handlers ──
  const handleVectorPdfExport = async () => {
    if (!selectedBank) return;
    setIsPdfExporting(true);
    try {
      await generateBankReconciliationVectorPDF({
        bankAccount: selectedBank,
        statementDate,
        statementBalance: numStatementBalance,
        bookBalance,
        totalUnclearedCheques,
        totalUnclearedDeposits,
        bankCharges: Number(adjustments.bankCharges) || 0,
        bankInterest: Number(adjustments.bankInterest) || 0,
        adjustments: Number(adjustments.otherAdjustments) || 0,
        adjustedBankBalance,
        adjustedBookBalance,
        differenceAmount,
        isReconciled,
        unclearedCheques: activeUnclearedCheques,
        unclearedDeposits: activeUnclearedDeposits,
        user
      });
      toast.success('Vector PDF generated with audit signatures!');
    } catch (err) {
      toast.error('Failed to export PDF: ' + err.message);
    } finally {
      setIsPdfExporting(false);
    }
  };

  const handleExcelExport = async () => {
    if (!selectedBank) return;
    setIsExcelExporting(true);
    try {
      await exportBankReconciliationXLSX({
        companyName: activeCompany?.company_name || 'Company',
        bankAccount: selectedBank,
        statementDate,
        statementBalance: numStatementBalance,
        bookBalance,
        totalUnclearedCheques,
        totalUnclearedDeposits,
        bankCharges: Number(adjustments.bankCharges) || 0,
        bankInterest: Number(adjustments.bankInterest) || 0,
        adjustments: Number(adjustments.otherAdjustments) || 0,
        adjustedBankBalance,
        adjustedBookBalance,
        differenceAmount,
        isReconciled,
        unclearedCheques: activeUnclearedCheques,
        unclearedDeposits: activeUnclearedDeposits,
        clearedItems
      });
      toast.success('Multi-sheet Excel workbook exported!');
    } catch (err) {
      toast.error('Failed to export Excel: ' + err.message);
    } finally {
      setIsExcelExporting(false);
    }
  };

  // Filtered Tab Items
  const filteredCheques = useMemo(() => {
    if (!searchTerm) return activeUnclearedCheques;
    const term = searchTerm.toLowerCase();
    return activeUnclearedCheques.filter(c =>
      c.voucher_no?.toLowerCase().includes(term) ||
      c.cheque_no?.toLowerCase().includes(term) ||
      c.narration?.toLowerCase().includes(term)
    );
  }, [activeUnclearedCheques, searchTerm]);

  const filteredDeposits = useMemo(() => {
    if (!searchTerm) return activeUnclearedDeposits;
    const term = searchTerm.toLowerCase();
    return activeUnclearedDeposits.filter(d =>
      d.voucher_no?.toLowerCase().includes(term) ||
      d.slip_no?.toLowerCase().includes(term) ||
      d.narration?.toLowerCase().includes(term)
    );
  }, [activeUnclearedDeposits, searchTerm]);

  return (
    <div className="flex flex-col gap-5 p-6 pb-28 max-w-[1440px] mx-auto print:p-2 print:pb-0">

      {/* ── Screen Header ── */}
      <div className="print:hidden flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/reports')} className="rounded-xl">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
                <Landmark className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Bank Reconciliation Report</h1>
              {sessionStatus === 'Reconciled' && (
                <span className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Reconciled &amp; Locked
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Match ERP bank ledger with physical bank statements, verify in-transit items, and balance your books
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="rounded-xl">
            <Printer className="w-4 h-4 mr-1.5" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcelExport} disabled={isExcelExporting || !selectedBank} className="rounded-xl">
            <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" />
            {isExcelExporting ? 'Exporting…' : 'Excel (.xlsx)'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleVectorPdfExport} disabled={isPdfExporting || !selectedBank} className="rounded-xl">
            <Download className="w-4 h-4 mr-1.5 text-blue-600" />
            {isPdfExporting ? 'Generating PDF…' : 'Audit PDF'}
          </Button>
          <Button
            onClick={() => handleSaveReconciliation(false)}
            disabled={isSaving || !selectedBank}
            className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Save className={`w-4 h-4 mr-1.5 ${isSaving ? 'animate-spin' : ''}`} />
            {isSaving ? 'Saving…' : 'Save Session'}
          </Button>
        </div>
      </div>

      {/* ── Unsaved Changes Buffer Banner ── */}
      {dirtyLineIds.size > 0 && (
        <div className="print:hidden bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3.5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              You have <strong>{dirtyLineIds.size}</strong> unsaved clearance change{dirtyLineIds.size > 1 ? 's' : ''}. Balances below are updated live in memory.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-8 text-xs text-muted-foreground hover:text-foreground">
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Discard
            </Button>
            <Button size="sm" onClick={() => handleSaveReconciliation(false)} disabled={isSaving} className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white">
              <Save className="w-3.5 h-3.5 mr-1" /> Save Now
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 1: Reconciliation Parameters & Setup Card ── */}
      <div className="print:hidden bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">1</span>
            <h2 className="text-sm font-bold text-foreground">Reconciliation Setup &amp; Cutoff</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isReportLoading || isFetching}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${(isReportLoading || isFetching) ? 'animate-spin' : ''}`} />
            {isReportLoading || isFetching ? 'Refreshing…' : 'Refresh Ledger'}
          </Button>
        </div>

        {/* Form fields layout: 3 spacious columns with no cramped wrapping */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
          {/* Column 1: Bank Account */}
          <div className="md:col-span-4 space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Bank Account
            </Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId} disabled={loadingAccounts}>
              <SelectTrigger className="w-full h-9 bg-card">
                <SelectValue placeholder={loadingAccounts ? 'Loading banks…' : 'Select Bank Account'} />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.account_name} {b.account_number ? `(${b.account_number})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBank && (
              <p className="text-[11px] text-muted-foreground truncate">
                {selectedBank.bank_name || 'Bank'} • A/C: {selectedBank.account_number || 'N/A'} • {selectedBank.currency || 'NPR'}
              </p>
            )}
          </div>

          {/* Column 2: Statement Cutoff Date (BSDatePicker receives dedicated, ample width) */}
          <div className="md:col-span-4 space-y-1.5 min-w-[340px]">
            <BSDatePicker label="Statement Cutoff Date" adValue={statementDate} onChange={setStatementDate} />
            <p className="text-[11px] text-muted-foreground">
              Statement ending date for matching transactions
            </p>
          </div>

          {/* Column 3: Bank Statement Balance */}
          <div className="md:col-span-4 space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Bank Statement Balance ({selectedBank?.currency || 'NPR'})
            </Label>
            <div className="relative">
              <Input
                type="text"
                inputMode="decimal"
                value={statementBalance}
                onChange={e => setStatementBalance(e.target.value)}
                placeholder="Enter statement closing balance"
                className="font-mono text-sm font-semibold pl-10 h-9 bg-card"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">
                {selectedBank?.currency || 'Rs.'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Exact closing balance from your physical statement
            </p>
          </div>
        </div>
      </div>

      {/* ── STEP 2: Unified Reconciliation Balance & Variance Strip ── */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
          {/* Block 1: Bank Statement Ending Balance */}
          <div className="p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="font-semibold uppercase tracking-wider text-[11px]">Statement Balance</span>
                <Landmark className="w-4 h-4 text-blue-500" />
              </div>
              <div className="font-mono text-xl font-bold text-foreground">
                {hasStatementBalance ? formatAmount(numStatementBalance) : (
                  <span className="text-muted-foreground text-sm font-normal italic">Not entered yet</span>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Per physical bank statement</p>
          </div>

          {/* Block 2: In-Transit / Uncleared Items */}
          <div className="p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="font-semibold uppercase tracking-wider text-[11px]">Uncleared In-Transit</span>
                <div className="flex items-center gap-1">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-amber-500" title="Payments" />
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" title="Receipts" />
                </div>
              </div>
              <div className="font-mono text-base font-bold text-foreground">
                <span className="text-emerald-600 dark:text-emerald-400">+{formatAmount(totalUnclearedDeposits)}</span>
                <span className="text-muted-foreground mx-1.5 font-normal">/</span>
                <span className="text-amber-600 dark:text-amber-400">-{formatAmount(totalUnclearedCheques)}</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {activeUnclearedDeposits.length} deposits / {activeUnclearedCheques.length} cheques pending
            </p>
          </div>

          {/* Block 3: ERP General Ledger Balance */}
          <div className="p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="font-semibold uppercase tracking-wider text-[11px]">ERP Ledger Balance</span>
                <DollarSign className="w-4 h-4 text-purple-500" />
              </div>
              <div className="font-mono text-xl font-bold text-foreground">
                {formatAmount(bookBalance)}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Cumulative GL bank position</p>
          </div>

          {/* Block 4: Reconciliation Variance & Status */}
          <div className={cn(
            "p-4 flex flex-col justify-between transition-colors",
            !hasStatementBalance
              ? "bg-muted/30"
              : isReconciled
                ? "bg-emerald-500/10 dark:bg-emerald-500/20"
                : "bg-amber-500/10 dark:bg-amber-500/20"
          )}>
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span className="font-semibold uppercase tracking-wider text-[11px]">Difference to Match</span>
                {isReconciled ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : hasStatementBalance ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <HelpCircle className="w-4 h-4 text-muted-foreground" />
                )}
              </div>

              {!hasStatementBalance ? (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">
                    Awaiting Statement Balance
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Enter statement ending balance above to compute variance
                  </p>
                </div>
              ) : isReconciled ? (
                <div>
                  <div className="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    NPR 0.00
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      ✓ Books and Bank are Reconciled!
                    </span>
                    <Button
                      size="sm"
                      onClick={() => handleSaveReconciliation(true)}
                      className="h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md"
                    >
                      Lock Session
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="font-mono text-xl font-bold text-amber-700 dark:text-amber-400">
                    {formatAmount(Math.abs(differenceAmount))}
                  </div>
                  <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300 mt-1">
                    {differenceAmount > 0 ? 'Bank exceeds Books' : 'Books exceed Bank'} (Check items below)
                  </p>
                </div>
              )}
            </div>
            {hasStatementBalance && (
              <p className="text-[10px] text-muted-foreground mt-2">
                Adjusted Bank: {formatAmount(adjustedBankBalance)} vs Adjusted Books: {formatAmount(adjustedBookBalance)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── STEP 3: Interactive Matching Workspace (Elevated Directly Above the Fold) ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        {/* Tab Switcher & Quick Search */}
        <div className="p-3 border-b border-border bg-muted/20 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveTab('cheques')}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                activeTab === 'cheques'
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              Money Out (Cheques)
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-primary-foreground/20 text-[10px]">
                {activeUnclearedCheques.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('deposits')}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                activeTab === 'deposits'
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Money In (Deposits)
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-primary-foreground/20 text-[10px]">
                {activeUnclearedDeposits.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('adjustments')}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                activeTab === 'adjustments'
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Bank Adjustments &amp; GL Posting
              {(adjustments.bankCharges > 0 || adjustments.bankInterest > 0) && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px]">
                  Active
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('cleared')}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                activeTab === 'cleared'
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Cleared Transactions
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-primary-foreground/20 text-[10px]">
                {clearedItems.length}
              </span>
            </button>
          </div>

          {/* Quick Search */}
          {['cheques', 'deposits'].includes(activeTab) && (
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search voucher, cheque, payee…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs rounded-lg"
              />
            </div>
          )}
        </div>

        {/* ── TAB 1: Uncleared Cheques Table ── */}
        {activeTab === 'cheques' && (
          <div>
            <div className="p-3 bg-muted/10 border-b border-border flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
              <span>
                Payments recorded in ERP on or before <strong>{formatDate(statementDate)}</strong> that have not yet cleared on your bank statement.
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => handleBatchClear('Cheque', true)} className="h-7 text-xs">
                  Clear All
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleBatchClear('Cheque', false)} className="h-7 text-xs">
                  Unclear All
                </Button>
              </div>
            </div>

            {filteredCheques.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-80" />
                No outstanding cheques! All recorded payments are cleared.
              </div>
            ) : (
              <div className="overflow-x-auto" role="region" aria-label="Uncleared cheques table" tabIndex={0}>
                <table className="w-full text-xs font-mono border-collapse">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground border-b border-border">
                      <th className="px-3 py-2 text-center w-12">Clear</th>
                      <th className="px-3 py-2 text-left w-36">Clearance Date</th>
                      <th className="px-3 py-2 text-left w-28">Voucher No</th>
                      <th className="px-3 py-2 text-left w-28">Cheque / Ref No</th>
                      <th className="px-3 py-2 text-left w-28">Issue Date</th>
                      <th className="px-3 py-2 text-left">Particulars / Beneficiary</th>
                      <th className="px-3 py-2 text-right w-32">Amount (NPR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredCheques.map(item => (
                      <tr key={item.gl_line_id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={item.is_cleared}
                            onChange={() => handleToggleClear(item, 'Cheque')}
                            className="w-4 h-4 rounded border-border text-primary cursor-pointer accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={item.cleared_date || statementDate}
                            onChange={e => handleUpdateClearedDate(item, 'Cheque', e.target.value)}
                            disabled={!item.is_cleared}
                            className={cn(
                              "h-7 px-2 border rounded text-xs bg-card text-foreground font-mono",
                              !item.is_cleared && "opacity-50 cursor-not-allowed bg-muted/40"
                            )}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <VoucherLink voucherNumber={item.voucher_no} />
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">{item.cheque_no || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatDate(item.transaction_date)}</td>
                        <td className="px-3 py-2 text-foreground font-sans truncate max-w-xs">{item.narration || '—'}</td>
                        <td className="px-3 py-2 text-right font-bold text-amber-600 dark:text-amber-400">
                          {formatNumber(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40 font-bold border-t border-border">
                      <td colSpan={6} className="px-3 py-2.5 text-muted-foreground font-sans">Total Uncleared Cheques</td>
                      <td className="px-3 py-2.5 text-right font-mono text-amber-600 dark:text-amber-400 text-sm">
                        {formatNumber(totalUnclearedCheques)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: Uncleared Deposits Table ── */}
        {activeTab === 'deposits' && (
          <div>
            <div className="p-3 bg-muted/10 border-b border-border flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
              <span>
                Receipts recorded in ERP on or before <strong>{formatDate(statementDate)}</strong> that have not yet been credited on your bank statement.
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => handleBatchClear('Deposit', true)} className="h-7 text-xs">
                  Clear All
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleBatchClear('Deposit', false)} className="h-7 text-xs">
                  Unclear All
                </Button>
              </div>
            </div>

            {filteredDeposits.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-80" />
                No deposits in transit! All recorded receipts are credited.
              </div>
            ) : (
              <div className="overflow-x-auto" role="region" aria-label="Uncleared deposits table" tabIndex={0}>
                <table className="w-full text-xs font-mono border-collapse">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground border-b border-border">
                      <th className="px-3 py-2 text-center w-12">Clear</th>
                      <th className="px-3 py-2 text-left w-36">Clearance Date</th>
                      <th className="px-3 py-2 text-left w-28">Voucher No</th>
                      <th className="px-3 py-2 text-left w-28">Slip / Ref No</th>
                      <th className="px-3 py-2 text-left w-28">Receipt Date</th>
                      <th className="px-3 py-2 text-left">Particulars / Depositor</th>
                      <th className="px-3 py-2 text-right w-32">Amount (NPR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredDeposits.map(item => (
                      <tr key={item.gl_line_id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={item.is_cleared}
                            onChange={() => handleToggleClear(item, 'Deposit')}
                            className="w-4 h-4 rounded border-border text-primary cursor-pointer accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={item.cleared_date || statementDate}
                            onChange={e => handleUpdateClearedDate(item, 'Deposit', e.target.value)}
                            disabled={!item.is_cleared}
                            className={cn(
                              "h-7 px-2 border rounded text-xs bg-card text-foreground font-mono",
                              !item.is_cleared && "opacity-50 cursor-not-allowed bg-muted/40"
                            )}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <VoucherLink voucherNumber={item.voucher_no} />
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">{item.slip_no || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatDate(item.transaction_date)}</td>
                        <td className="px-3 py-2 text-foreground font-sans truncate max-w-xs">{item.narration || '—'}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatNumber(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40 font-bold border-t border-border">
                      <td colSpan={6} className="px-3 py-2.5 text-muted-foreground font-sans">Total In-Transit Deposits</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                        {formatNumber(totalUnclearedDeposits)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 3: Actionable Adjustments & Direct Ledger Posting ── */}
        {activeTab === 'adjustments' && (
          <div className="p-6 space-y-6">
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-4 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-3">
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <strong>Actionable Adjustments Workflow:</strong>
                <p className="mt-0.5">
                  If your bank statement reflects service charges, SMS fees, or interest credits missing from your ERP General Ledger, use <strong>"Post to Ledger"</strong> below. This creates and posts a balanced journal voucher into your books, resolving the discrepancy at the ledger root!
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card A: Bank Charges */}
              <div className="border border-border rounded-xl p-4 space-y-3 bg-card">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    Bank Charges &amp; Service Fees
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openAdjustmentModal('BankCharge')}
                    className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <PlusCircle className="w-3.5 h-3.5 mr-1" /> Post to Ledger
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Debited by the bank (e.g. cheque clearance fees, ATM card annual charge, SMS alert charges).
                </p>
                <div>
                  <Label className="text-xs">Memo Amount (NPR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={adjustments.bankCharges || ''}
                    onChange={e => setAdjustments(prev => ({ ...prev, bankCharges: Number(e.target.value) || 0 }))}
                    placeholder="0.00"
                    className="font-mono text-sm mt-1"
                  />
                </div>
              </div>

              {/* Card B: Bank Interest */}
              <div className="border border-border rounded-xl p-4 space-y-3 bg-card">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Bank Interest Received
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openAdjustmentModal('BankInterest')}
                    className="h-7 text-xs border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                  >
                    <PlusCircle className="w-3.5 h-3.5 mr-1" /> Post to Ledger
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Credited by the bank (e.g. savings interest, sweep-in interest credit) not yet entered in ERP.
                </p>
                <div>
                  <Label className="text-xs">Memo Amount (NPR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={adjustments.bankInterest || ''}
                    onChange={e => setAdjustments(prev => ({ ...prev, bankInterest: Number(e.target.value) || 0 }))}
                    placeholder="0.00"
                    className="font-mono text-sm mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Card C: Manual Audit Notes & Other Adjustments */}
            <div className="border border-border rounded-xl p-4 space-y-3 bg-card">
              <h3 className="text-sm font-bold text-foreground">Other Reconciling Notes / Memos</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Adjustment Amount (+ or - NPR)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={adjustments.otherAdjustments || ''}
                    onChange={e => setAdjustments(prev => ({ ...prev, otherAdjustments: Number(e.target.value) || 0 }))}
                    placeholder="0.00"
                    className="font-mono text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Audit Explanatory Notes</Label>
                  <Input
                    value={sessionNotes}
                    onChange={e => setSessionNotes(e.target.value)}
                    placeholder="e.g. Bounced cheque #1029 awaiting customer redeposit"
                    className="text-xs mt-1"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 4: Cleared Transactions Audit Trail ── */}
        {activeTab === 'cleared' && (
          <div>
            <div className="p-3 bg-muted/10 border-b border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>
                All reconciled transactions cleared on or before <strong>{formatDate(statementDate)}</strong>.
              </span>
            </div>

            {clearedItems.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No cleared transactions recorded yet for this statement date.
              </div>
            ) : (
              <div className="overflow-x-auto" role="region" aria-label="Cleared items table" tabIndex={0}>
                <table className="w-full text-xs font-mono border-collapse">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground border-b border-border">
                      <th className="px-3 py-2 text-left w-28">Voucher No</th>
                      <th className="px-3 py-2 text-left w-28">Reference No</th>
                      <th className="px-3 py-2 text-left w-24">Type</th>
                      <th className="px-3 py-2 text-left w-28">Txn Date</th>
                      <th className="px-3 py-2 text-left w-28">Cleared Date</th>
                      <th className="px-3 py-2 text-right w-32">Amount (NPR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {clearedItems.map((item, idx) => (
                      <tr key={item.gl_line_id || idx} className="hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2">
                          <VoucherLink voucherNumber={item.voucher_no} />
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">{item.reference_no || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-semibold",
                            item.line_type === 'Cheque' ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                          )}>
                            {item.line_type || 'Transaction'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{formatDate(item.transaction_date)}</td>
                        <td className="px-3 py-2 font-bold text-foreground">{formatDate(item.cleared_date)}</td>
                        <td className="px-3 py-2 text-right font-bold text-foreground">
                          {formatNumber(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── STEP 4: Collapsible Formal BRS Schedule (Audit View) ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setIsBrsWalkOpen(prev => !prev)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                Formal Bank Reconciliation Statement (BRS Walk)
                <span className="text-[11px] font-normal text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                  Audit Schedule
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Formal schedule connecting Bank Statement Ending Balance to General Ledger
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span>{isBrsWalkOpen ? 'Hide Formal Schedule' : 'View Formal Schedule'}</span>
            <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isBrsWalkOpen && "rotate-180")} />
          </div>
        </button>

        {/* Collapsible content (always printed on paper/PDF print) */}
        <div className={cn(isBrsWalkOpen ? "block" : "hidden print:block", "border-t border-border")}>
          <div className="overflow-x-auto" role="region" aria-label="BRS Statement Walk" tabIndex={0}>
            <table className="w-full text-xs font-mono border-collapse print-exact-colors">
              <thead>
                <tr className="bg-muted/60 text-muted-foreground border-b border-border">
                  <th className="px-4 py-2.5 text-left w-[55%]">Particulars</th>
                  <th className="px-4 py-2.5 text-left w-[25%]">Audit Reference / Note</th>
                  <th className="px-4 py-2.5 text-right w-[20%]">Amount ({selectedBank?.currency || 'NPR'})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {/* Part 1: Bank Balance Walk */}
                <tr className="hover:bg-muted/10">
                  <td className="px-4 py-2 font-semibold text-foreground">Balance as per Bank Statement</td>
                  <td className="px-4 py-2 text-muted-foreground">Bank Statement Ending Balance as of {formatDate(statementDate)}</td>
                  <td className="px-4 py-2 text-right font-bold text-foreground">{formatNumber(numStatementBalance)}</td>
                </tr>
                <tr className="hover:bg-muted/10">
                  <td className="px-4 py-2 text-foreground pl-8">Add: Deposits in Transit (Uncleared Receipts)</td>
                  <td className="px-4 py-2 text-muted-foreground">{activeUnclearedDeposits.length} deposits recorded in ERP, not yet credited by bank</td>
                  <td className="px-4 py-2 text-right text-emerald-600 dark:text-emerald-400 font-medium">+{formatNumber(totalUnclearedDeposits)}</td>
                </tr>
                <tr className="hover:bg-muted/10">
                  <td className="px-4 py-2 text-foreground pl-8">Less: Outstanding Cheques (Uncleared Payments)</td>
                  <td className="px-4 py-2 text-muted-foreground">{activeUnclearedCheques.length} cheques issued in ERP, not yet presented to bank</td>
                  <td className="px-4 py-2 text-right text-amber-600 dark:text-amber-400 font-medium">({formatNumber(totalUnclearedCheques)})</td>
                </tr>
                <tr className="bg-muted/30 font-bold border-y-2 border-border">
                  <td className="px-4 py-2.5 text-primary">Adjusted Bank Balance</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-[11px]">True liquid balance after clearing transit items</td>
                  <td className="px-4 py-2.5 text-right text-primary text-sm">{formatNumber(adjustedBankBalance)}</td>
                </tr>

                {/* Part 2: Book Balance Walk */}
                <tr className="hover:bg-muted/10">
                  <td className="px-4 py-2 font-semibold text-foreground pt-4">Balance as per ERP General Ledger</td>
                  <td className="px-4 py-2 text-muted-foreground pt-4">Cumulative debit minus credit in GL up to {formatDate(statementDate)}</td>
                  <td className="px-4 py-2 text-right font-bold text-foreground pt-4">{formatNumber(bookBalance)}</td>
                </tr>
                <tr className="hover:bg-muted/10">
                  <td className="px-4 py-2 text-foreground pl-8">Add: Bank Interest Received</td>
                  <td className="px-4 py-2 text-muted-foreground">Credits from bank statement pending book entry</td>
                  <td className="px-4 py-2 text-right text-emerald-600 dark:text-emerald-400 font-medium">+{formatNumber(adjustments.bankInterest)}</td>
                </tr>
                <tr className="hover:bg-muted/10">
                  <td className="px-4 py-2 text-foreground pl-8">Less: Bank Charges &amp; Service Fees</td>
                  <td className="px-4 py-2 text-muted-foreground">Debits from bank statement pending book entry</td>
                  <td className="px-4 py-2 text-right text-red-600 dark:text-red-400 font-medium">({formatNumber(adjustments.bankCharges)})</td>
                </tr>
                {adjustments.otherAdjustments !== 0 && (
                  <tr className="hover:bg-muted/10">
                    <td className="px-4 py-2 text-foreground pl-8">Add/Less: Other Reconciling Adjustments</td>
                    <td className="px-4 py-2 text-muted-foreground">Discrepancy adjustments / manual audit memos</td>
                    <td className="px-4 py-2 text-right font-medium">{formatNumber(adjustments.otherAdjustments)}</td>
                  </tr>
                )}
                <tr className="bg-muted/30 font-bold border-y-2 border-border">
                  <td className="px-4 py-2.5 text-primary">Adjusted Book Balance</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-[11px]">True verified book position after statement memos</td>
                  <td className="px-4 py-2.5 text-right text-primary text-sm">{formatNumber(adjustedBookBalance)}</td>
                </tr>

                {/* Part 3: Difference Result */}
                <tr className={cn(
                  "font-bold text-sm",
                  isReconciled ? "bg-emerald-100/50 dark:bg-emerald-500/10" : "bg-red-100/50 dark:bg-red-500/10"
                )}>
                  <td className="px-4 py-3">RECONCILIATION VARIANCE (DIFFERENCE)</td>
                  <td className="px-4 py-3">
                    {isReconciled ? (
                      <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Perfect Match — Books and Bank are Reconciled!
                      </span>
                    ) : (
                      <span className="text-red-700 dark:text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" /> Discrepancy — Check uncleared items or unrecorded fees
                      </span>
                    )}
                  </td>
                  <td className={cn(
                    "px-4 py-3 text-right text-base font-bold",
                    isReconciled ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"
                  )}>
                    {formatNumber(differenceAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Actionable "Post to Ledger" Modal ── */}
      <Dialog open={adjModalOpen} onOpenChange={setAdjModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="w-5 h-5 text-primary" />
              Post {adjType === 'BankCharge' ? 'Bank Charges' : 'Bank Interest'} to GL
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              This will create a posted Financial Voucher directly into your General Ledger and auto-clear it on the bank statement.
            </p>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Bank Account</Label>
              <Input disabled value={selectedBank?.account_name || 'Bank'} className="text-xs bg-muted/40" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                {adjType === 'BankCharge' ? 'Expense Account (Debit)' : 'Revenue Account (Credit)'}
              </Label>
              <SearchableSelect
                options={allAccounts
                  .filter(a => adjType === 'BankCharge' ? ['Expense', 'OPEX'].includes(a.account_type) : a.account_type === 'Revenue')
                  .map(a => ({ value: a.id, label: `${a.account_name} (${a.account_code || a.account_type})` }))}
                value={adjAccountId}
                onChange={setAdjAccountId}
                placeholder="Select Chart of Account"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Amount (NPR)</Label>
              <Input
                type="number"
                step="0.01"
                value={adjAmount}
                onChange={e => setAdjAmount(e.target.value)}
                placeholder="0.00"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Narration</Label>
              <Input
                value={adjNarration}
                onChange={e => setAdjNarration(e.target.value)}
                placeholder="e.g. Bank SMS charge"
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjModalOpen(false)} disabled={adjPosting}>
              Cancel
            </Button>
            <Button onClick={handlePostAdjustment} disabled={adjPosting} className="bg-primary text-primary-foreground">
              {adjPosting ? 'Posting Voucher…' : 'Confirm & Post to Ledger'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
