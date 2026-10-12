/**
 * Invoice Due Date & Installment Service — Sajilo ERP
 * Handles controlled due date rescheduling, installment receipts, reversals,
 * and multi-tenant broadcast channel invalidations.
 */

import { sajilo } from '@/api/sajiloClient';
import { toast } from 'sonner';

/**
 * Reschedule payment due date for single invoice, single installment, or cascading schedule
 */
export async function reschedulePayment(payload) {
  try {
    const result = await sajilo.rpc('rpc_reschedule_invoice_payment', payload, [
      'InvoiceInstallment',
      'InvoiceDueDateHistory',
      'SalesInvoice',
      'PurchaseInvoice',
      'GeneralLedgerLine'
    ]);
    toast.success('Payment due date rescheduled successfully');
    return result;
  } catch (error) {
    console.error('Reschedule error:', error);
    toast.error(error.message || 'Failed to reschedule payment');
    throw error;
  }
}

/**
 * Waterfall installment receipt allocation with IFRS 15 interest micro-journals
 */
export async function allocateInstallmentReceipt(payload) {
  try {
    const result = await sajilo.rpc('rpc_allocate_installment_receipt', payload, [
      'InvoiceInstallment',
      'SalesInvoice',
      'FinancialVoucher',
      'GeneralLedgerJournal',
      'GeneralLedgerLine'
    ]);
    toast.success('Installment payment allocated successfully');
    return result;
  } catch (error) {
    console.error('Allocation error:', error);
    toast.error(error.message || 'Receipt allocation failed');
    throw error;
  }
}

/**
 * Reverse receipt voucher & all linked interest realization micro-journals (Bounced Cheque Engine)
 */
export async function reverseReceiptVoucher(voucherId, reason) {
  try {
    const result = await sajilo.rpc('rpc_reverse_receipt_voucher', {
      p_company_id: sajilo.getCompanyId(),
      p_voucher_id: voucherId,
      p_reason: reason
    }, [
      'InvoiceInstallment',
      'SalesInvoice',
      'FinancialVoucher',
      'GeneralLedgerJournal',
      'GeneralLedgerLine'
    ]);
    toast.success('Receipt reversed — unearned interest and installment balances restored');
    return result;
  } catch (error) {
    console.error('Reversal error:', error);
    toast.error(error.message || 'Failed to reverse receipt');
    throw error;
  }
}

/**
 * Fetch Due Date & Reschedule Audit History for an invoice or specific installment
 */
export async function fetchDueDateHistory(invoiceId, installmentId = null) {
  try {
    let query = sajilo.entities.InvoiceDueDateHistory.filter({ invoice_id: invoiceId }, '-created_at', 50);
    const data = await query;
    if (installmentId) {
      return (data || []).filter(h => h.installment_id === installmentId || !h.installment_id);
    }
    return data || [];
  } catch (error) {
    console.error('Fetch history error:', error);
    return [];
  }
}

/**
 * Fetch installments for a specific invoice
 */
export async function fetchInvoiceInstallments(invoiceId) {
  try {
    const data = await sajilo.entities.InvoiceInstallment.filter(
      { invoice_id: invoiceId, is_deleted: false },
      'installment_no',
      100
    );
    return data || [];
  } catch (error) {
    console.error('Fetch installments error:', error);
    return [];
  }
}
