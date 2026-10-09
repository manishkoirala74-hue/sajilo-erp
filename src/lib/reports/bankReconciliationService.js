/**
 * bankReconciliationService.js
 * Core service layer for Bank Reconciliation in Sajilo ERP.
 * Handles report extraction, optimistic calculations, batch commit mutations,
 * and actionable GL voucher creation for bank charges/interest.
 */

import { supabase, sajilo } from '@/api/sajiloClient';
import { postFinancialVoucher } from '@/lib/glPostingService';
import { toast } from 'sonner';

/**
 * Fetch bank reconciliation report data.
 * Tries PostgreSQL RPC 'get_bank_reconciliation_report' first;
 * gracefully falls back to direct client-side query if RPC is not yet applied.
 */
export async function fetchBankReconciliationReport({
  companyId,
  bankAccountId,
  statementDate,
  statementBalance = 0
}) {
  if (!companyId || !bankAccountId || !statementDate) return null;

  try {
    // 1. Try dedicated PostgreSQL RPC
    const { data, error } = await supabase.rpc('get_bank_reconciliation_report', {
      p_company_id: companyId,
      p_bank_account_id: bankAccountId,
      p_statement_date: statementDate,
      p_statement_balance: Number(statementBalance) || 0
    });

    if (!error && data) {
      return data;
    }

    if (error && error.code !== 'PGRST202') {
      console.warn('RPC get_bank_reconciliation_report error, attempting fallback:', error);
    }
  } catch (err) {
    console.warn('Error invoking get_bank_reconciliation_report RPC:', err);
  }

  // 2. Resilient Client-Side Fallback Engine
  return await fallbackFetchReconciliation({
    companyId,
    bankAccountId,
    statementDate,
    statementBalance: Number(statementBalance) || 0
  });
}

/**
 * Fallback query engine: queries tables directly when RPC is unavailable.
 */
async function fallbackFetchReconciliation({ companyId, bankAccountId, statementDate, statementBalance }) {
  // A. Fetch BankAccount metadata
  const { data: bankAcc, error: bankErr } = await supabase
    .from('BankAccount')
    .select('id, account_name, account_number, currency, gl_account_id')
    .eq('id', bankAccountId)
    .single();

  if (bankErr || !bankAcc) throw new Error(bankErr?.message || 'Bank account not found');

  const glAccountId = bankAcc.gl_account_id;
  if (!glAccountId) throw new Error('Selected bank account has no mapped General Ledger account');

  // B. Fetch Posted GL lines up to statement date
  const { data: glLines, error: glErr } = await supabase
    .from('GeneralLedgerLine')
    .select(`
      id,
      journal_id,
      account_id,
      debit_amount,
      credit_amount,
      description,
      GeneralLedgerJournal!inner (
        id,
        voucher_no,
        entry_date,
        status,
        source_document_id,
        source_document_type
      )
    `)
    .eq('company_id', companyId)
    .eq('account_id', glAccountId)
    .eq('GeneralLedgerJournal.status', 'Posted')
    .lte('GeneralLedgerJournal.entry_date', `${statementDate}T23:59:59.999Z`);

  if (glErr) throw glErr;

  // C. Fetch existing reconciliation lines for this company
  let reconLinesMap = {};
  const { data: storedReconLines } = await supabase
    .from('BankReconciliationLine')
    .select('*')
    .eq('company_id', companyId);

  if (storedReconLines) {
    storedReconLines.forEach(l => { reconLinesMap[l.gl_line_id] = l; });
  }

  // D. Fetch existing saved session header if present
  let savedSession = null;
  const { data: sessionData } = await supabase
    .from('BankReconciliation')
    .select('*')
    .eq('company_id', companyId)
    .eq('bank_account_id', bankAccountId)
    .eq('statement_date', statementDate)
    .maybeSingle();

  if (sessionData) savedSession = sessionData;

  // E. Compute Book Balance and bucket Uncleared vs Cleared
  let bookBalance = 0;
  const payments = [];
  const receipts = [];

  (glLines || []).forEach(line => {
    const journal = line.GeneralLedgerJournal;
    const debit = Number(line.debit_amount || 0);
    const credit = Number(line.credit_amount || 0);
    bookBalance += (debit - credit);

    const stored = reconLinesMap[line.id];
    const isCleared = stored ? Boolean(stored.is_cleared) : false;
    const clearedDate = stored?.cleared_date || null;
    const txnDate = (journal?.entry_date || '').substring(0, 10);

    const lineItem = {
      gl_line_id: line.id,
      journal_id: journal?.id,
      voucher_no: journal?.voucher_no || '—',
      cheque_no: stored?.reference_no || journal?.source_document_id || '—',
      slip_no: stored?.reference_no || journal?.source_document_id || '—',
      reference_no: stored?.reference_no || '',
      transaction_date: txnDate,
      narration: line.description || '',
      is_cleared: isCleared,
      cleared_date: clearedDate,
    };

    if (credit > 0) {
      payments.push({ ...lineItem, line_type: 'Cheque', amount: credit });
    }
    if (debit > 0) {
      receipts.push({ ...lineItem, line_type: 'Deposit', amount: debit });
    }
  });

  const unclearedCheques = payments.filter(p => !p.is_cleared || (p.cleared_date && p.cleared_date > statementDate));
  const unclearedDeposits = receipts.filter(r => !r.is_cleared || (r.cleared_date && r.cleared_date > statementDate));

  const totalUnclearedCheques = unclearedCheques.reduce((s, c) => s + c.amount, 0);
  const totalUnclearedDeposits = unclearedDeposits.reduce((s, d) => s + d.amount, 0);

  const clearedItems = [
    ...payments.filter(p => p.is_cleared && p.cleared_date && p.cleared_date <= statementDate),
    ...receipts.filter(r => r.is_cleared && r.cleared_date && r.cleared_date <= statementDate)
  ];

  return {
    bank_account: {
      id: bankAcc.id,
      account_name: bankAcc.account_name,
      account_number: bankAcc.account_number || '—',
      currency: bankAcc.currency || 'NPR',
    },
    statement_date: statementDate,
    statement_balance: statementBalance,
    book_balance: Math.round(bookBalance * 100) / 100,
    total_uncleared_cheques: totalUnclearedCheques,
    total_uncleared_deposits: totalUnclearedDeposits,
    total_cleared_cheques: payments.filter(p => p.is_cleared && p.cleared_date <= statementDate).reduce((s, c) => s + c.amount, 0),
    total_cleared_deposits: receipts.filter(r => r.is_cleared && r.cleared_date <= statementDate).reduce((s, d) => s + d.amount, 0),
    bank_charges: savedSession?.bank_charges || 0,
    bank_interest: savedSession?.bank_interest || 0,
    adjustments: savedSession?.adjustments_amount || 0,
    uncleared_cheques: unclearedCheques,
    uncleared_deposits: unclearedDeposits,
    cleared_items: clearedItems,
    session_status: savedSession?.status || 'Draft',
    reconciliation_id: savedSession?.id || null,
  };
}

/**
 * Save bank reconciliation session in a single atomic batch action.
 */
export async function saveBankReconciliationSession({
  companyId,
  bankAccountId,
  statementDate,
  statementBalance,
  bookBalance,
  bankCharges = 0,
  bankInterest = 0,
  adjustments = 0,
  reconciledBalance,
  differenceAmount,
  status = 'Draft',
  notes = '',
  lineUpdates = []
}) {
  try {
    const { data, error } = await supabase.rpc('save_bank_reconciliation_session', {
      p_company_id: companyId,
      p_bank_account_id: bankAccountId,
      p_statement_date: statementDate,
      p_statement_balance: Number(statementBalance) || 0,
      p_book_balance: Number(bookBalance) || 0,
      p_bank_charges: Number(bankCharges) || 0,
      p_bank_interest: Number(bankInterest) || 0,
      p_adjustments: Number(adjustments) || 0,
      p_reconciled_balance: Number(reconciledBalance) || 0,
      p_difference_amount: Number(differenceAmount) || 0,
      p_status: status,
      p_notes: notes || '',
      p_line_updates: lineUpdates
    });

    if (!error && data) {
      return data;
    }

    if (error && error.code !== 'PGRST202') {
      console.warn('RPC save_bank_reconciliation_session error:', error);
      throw error;
    }
  } catch (err) {
    if (err.message && !err.message.includes('PGRST202')) throw err;
  }

  // Resilient fallback saving directly to tables
  const { data: bankAcc } = await supabase
    .from('BankAccount')
    .select('gl_account_id')
    .eq('id', bankAccountId)
    .single();

  const { data: header, error: headErr } = await supabase
    .from('BankReconciliation')
    .upsert({
      company_id: companyId,
      bank_account_id: bankAccountId,
      gl_account_id: bankAcc?.gl_account_id,
      statement_date: statementDate,
      statement_balance: Number(statementBalance) || 0,
      book_balance: Number(bookBalance) || 0,
      bank_charges: Number(bankCharges) || 0,
      bank_interest: Number(bankInterest) || 0,
      adjustments_amount: Number(adjustments) || 0,
      reconciled_balance: Number(reconciledBalance) || 0,
      difference_amount: Number(differenceAmount) || 0,
      status: status,
      notes: notes || '',
      updated_at: new Date().toISOString()
    }, { onConflict: 'company_id,bank_account_id,statement_date' })
    .select('id')
    .single();

  if (headErr) throw headErr;

  if (lineUpdates && lineUpdates.length > 0) {
    const linesToUpsert = lineUpdates.map(l => ({
      company_id: companyId,
      reconciliation_id: header.id,
      gl_line_id: l.gl_line_id,
      journal_id: l.journal_id,
      voucher_no: l.voucher_no,
      reference_no: l.reference_no,
      transaction_date: l.transaction_date,
      cleared_date: l.cleared_date,
      is_cleared: l.is_cleared,
      line_type: l.line_type,
      amount: l.amount,
      updated_at: new Date().toISOString()
    }));

    const { error: linesErr } = await supabase
      .from('BankReconciliationLine')
      .upsert(linesToUpsert, { onConflict: 'company_id,gl_line_id' });

    if (linesErr) throw linesErr;
  }

  return { success: true, reconciliation_id: header.id, status };
}

/**
 * Actionable Adjustment: Post Bank Charges or Interest directly as a General Ledger Voucher.
 * Removes the discrepancy at the ledger root!
 */
export async function postAdjustmentJournalVoucher({
  companyId,
  bankAccount,
  statementDate,
  type, // 'BankCharge' | 'BankInterest'
  amount,
  offsetAccountId,
  description
}) {
  const numAmount = Math.abs(Number(amount) || 0);
  if (numAmount <= 0) throw new Error('Adjustment amount must be greater than zero');
  if (!offsetAccountId) throw new Error('Please select an Expense/Revenue account');
  if (!bankAccount?.gl_account_id) throw new Error('Bank Account has no mapped GL Account');

  const isCharge = type === 'BankCharge';
  const voucherType = isCharge ? 'Payment' : 'Receipt';
  const voucher_number = `${isCharge ? 'BC' : 'BI'}-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

  // 1. Create Financial Voucher record
  const voucher = await sajilo.entities.FinancialVoucher.create({
    voucher_type: voucherType,
    voucher_date: statementDate,
    voucher_number,
    contact_name: bankAccount.account_name,
    payment_mode: 'Bank Transfer',
    reference_no: `BRS-${statementDate}`,
    narration: description || (isCharge ? `Bank Charges as per statement dated ${statementDate}` : `Bank Interest as per statement dated ${statementDate}`),
    total_amount: numAmount,
    status: 'Posted',
  });

  // 2. Configure Balanced GL Legs:
  // Bank Charge (Expense): Debit Expense Account, Credit Bank Account
  // Bank Interest (Income): Debit Bank Account, Credit Interest Income Account
  const lines = isCharge
    ? [
        { account_id: offsetAccountId, debit_amount: numAmount, credit_amount: 0, description: description || 'Bank Charges / Service Fee' },
        { account_id: bankAccount.gl_account_id, debit_amount: 0, credit_amount: numAmount, description: description || 'Bank Charges Deducted' }
      ]
    : [
        { account_id: bankAccount.gl_account_id, debit_amount: numAmount, credit_amount: 0, description: description || 'Bank Interest Credited' },
        { account_id: offsetAccountId, debit_amount: 0, credit_amount: numAmount, description: description || 'Bank Interest Income' }
      ];

  const idempotencyKey = crypto.randomUUID();
  await postFinancialVoucher({ ...voucher, lines }, false, idempotencyKey);

  toast.success(`Successfully posted ${isCharge ? 'Bank Charges' : 'Bank Interest'} voucher ${voucher_number} to General Ledger!`);
  return { voucher_number, amount: numAmount };
}
