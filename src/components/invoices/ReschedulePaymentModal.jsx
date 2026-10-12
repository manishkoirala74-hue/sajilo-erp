import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import DateInput from '@/components/shared/DateInput';
import DualDateDisplay from '@/components/shared/DualDateDisplay';
import { reschedulePayment } from '@/lib/invoiceDueDateService';
import { sajilo } from '@/api/sajiloClient';
import { Calendar, Clock, AlertCircle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const REASON_CATEGORIES = [
  { code: 'CUSTOMER_LIQUIDITY_DELAY', label: 'Customer Cash-Flow / Working Capital Deferral' },
  { code: 'BILLING_DISPUTE_RESOLUTION', label: 'Dispute Investigation / Credit Reconciliation' },
  { code: 'MILESTONE_NEGOTIATION', label: 'Commercial Agreement / Milestone Shift' },
  { code: 'CHEQUE_CLEARANCE_GRACE', label: 'Post-Dated Cheque / Banking Clearance Grace' },
  { code: 'SEASONAL_AGRICULTURAL_TOURISM', label: 'Seasonal Revenue / Off-Season Tourism Grace' },
  { code: 'MANAGEMENT_GOODWILL', label: 'Executive / Management Goodwill Waiver' },
  { code: 'VENDOR_TERMS_RENEGOTIATION', label: 'Supplier Credit Terms Renegotiated' },
  { code: 'OTHER_JUSTIFIED', label: 'Other (Detailed Notes Required)' }
];

export default function ReschedulePaymentModal({
  isOpen,
  onClose,
  invoice,
  installment = null,
  allInstallments = [],
  onSuccess
}) {
  const [scope, setScope] = useState(installment ? 'SINGLE_INSTALLMENT' : 'ENTIRE_INVOICE');
  const [targetInstallmentId, setTargetInstallmentId] = useState(installment?.id || '');
  const [newDueDate, setNewDueDate] = useState('');
  const [reasonCode, setReasonCode] = useState(REASON_CATEGORIES[0].code);
  const [reasonNotes, setReasonNotes] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactChannel, setContactChannel] = useState('Phone Call');
  const [saving, setSaving] = useState(false);

  // Active target installment or invoice
  const activeInstallment = allInstallments.find(i => i.id === targetInstallmentId) || installment;
  const currentDueDate = activeInstallment?.due_date || invoice?.due_date;

  useEffect(() => {
    if (installment) {
      setTargetInstallmentId(installment.id);
      setScope('SINGLE_INSTALLMENT');
      setNewDueDate(installment.due_date || '');
    } else if (invoice) {
      setScope('ENTIRE_INVOICE');
      setNewDueDate(invoice.due_date || '');
    }
    setReasonNotes('');
    setContactPerson('');
  }, [installment, invoice, isOpen]);

  // Calculate day delta
  const daysDelta = React.useMemo(() => {
    if (!currentDueDate || !newDueDate) return 0;
    const prev = new Date(currentDueDate).getTime();
    const next = new Date(newDueDate).getTime();
    return Math.round((next - prev) / (1000 * 60 * 60 * 24));
  }, [currentDueDate, newDueDate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newDueDate) {
      toast.error('Please select a valid new due date');
      return;
    }
    if (daysDelta === 0) {
      toast.error('New due date is identical to current due date');
      return;
    }
    if (!reasonNotes.trim()) {
      toast.error('Detailed justification notes are mandatory for due date changes');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        p_company_id: invoice.company_id || sajilo.getCompanyId(),
        p_invoice_type: invoice.vendor_id ? 'PurchaseInvoice' : 'SalesInvoice',
        p_invoice_id: invoice.id,
        p_installment_id: (scope === 'ENTIRE_INVOICE') ? null : (activeInstallment?.id || null),
        p_reschedule_scope: scope,
        p_new_due_date: newDueDate,
        p_reason_code: reasonCode,
        p_reason_notes: reasonNotes.trim(),
        p_contact_person: contactPerson.trim() || null,
        p_contact_channel: contactChannel
      };

      await reschedulePayment(payload);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      // Handled in service
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n) => `NPR ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Calendar className="w-5 h-5 text-primary" /> Reschedule Payment / Due Date
          </DialogTitle>
        </DialogHeader>

        {invoice && (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {/* INVOICE & CUSTOMER CONTEXT SUMMARY */}
            <div className="bg-muted/40 rounded-xl p-3 border border-border text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Document:</span>
                <span className="font-mono font-semibold text-foreground">
                  {invoice.invoice_number} ({invoice.vendor_id ? 'Purchase Invoice' : 'Sales Invoice'})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Party:</span>
                <span className="font-medium text-foreground">{invoice.customer_name || invoice.vendor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice Total:</span>
                <span className="font-semibold text-foreground">{fmt(invoice.grand_total)}</span>
              </div>
              {activeInstallment && (
                <div className="flex justify-between border-t border-border/60 pt-1.5 text-primary font-medium">
                  <span>Selected Installment:</span>
                  <span>
                    {activeInstallment.is_down_payment ? 'Inst #0 (Down Payment)' : `Inst #${activeInstallment.installment_no}`} — {fmt(activeInstallment.total_amount)}
                  </span>
                </div>
              )}
            </div>

            {/* SCOPE SELECTION (If invoice has installments) */}
            {allInstallments.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Reschedule Scope
                </Label>
                <RadioGroup value={scope} onValueChange={setScope} className="grid grid-cols-1 gap-2">
                  <div className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${scope === 'SINGLE_INSTALLMENT' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <RadioGroupItem value="SINGLE_INSTALLMENT" id="r_single" className="mt-0.5" />
                    <div>
                      <Label htmlFor="r_single" className="font-semibold cursor-pointer">
                        Single Installment Only
                      </Label>
                      <p className="text-muted-foreground text-[11px] mt-0.5">
                        Adjusts only this specific installment maturity. Future installments retain their original dates.
                      </p>
                    </div>
                  </div>

                  <div className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${scope === 'CASCADING_SCHEDULE' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <RadioGroupItem value="CASCADING_SCHEDULE" id="r_cascading" className="mt-0.5" />
                    <div>
                      <Label htmlFor="r_cascading" className="font-semibold cursor-pointer">
                        Cascading Schedule Shift (Bounded)
                      </Label>
                      <p className="text-muted-foreground text-[11px] mt-0.5">
                        Shifts this installment and all subsequent unpaid installments forward by the same delta. Paid slices remain untouched.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* SELECT INSTALLMENT DROPDOWN IF MULTIPLE EXIST */}
            {allInstallments.length > 0 && scope !== 'ENTIRE_INVOICE' && (
              <div>
                <Label className="text-xs font-medium">Target Installment</Label>
                <Select value={targetInstallmentId} onValueChange={setTargetInstallmentId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Installment Slice" />
                  </SelectTrigger>
                  <SelectContent className="z-[60]">
                    {allInstallments.filter(i => i.status !== 'Paid').map(item => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.is_down_payment ? 'Inst #0 (Down Payment)' : `Inst #${item.installment_no}`} (Due: {item.due_date}) — {fmt(item.total_amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* CURRENT VS NEW DUE DATE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-muted/20 p-3 rounded-xl border border-border">
              <div>
                <Label className="text-xs text-muted-foreground">Current Due Date</Label>
                <div className="mt-1 font-semibold text-sm">
                  <DualDateDisplay date={currentDueDate} />
                </div>
              </div>

              <div>
                <DateInput
                  label="New Due Date *"
                  value={newDueDate}
                  onChange={setNewDueDate}
                  className="mt-0"
                />
              </div>
            </div>

            {/* DELTA BADGE */}
            {daysDelta !== 0 && (
              <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium ${daysDelta > 0 ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>
                <Clock className="w-4 h-4 shrink-0" />
                <span>
                  Net Change: <strong>{daysDelta > 0 ? `+${daysDelta} Days Extension` : `${daysDelta} Days Early Reduction`}</strong>
                </span>
              </div>
            )}

            {/* REASON CATEGORY */}
            <div>
              <Label className="text-xs font-medium">Reason Category *</Label>
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[60]">
                  {REASON_CATEGORIES.map(r => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* CONTACT LOGGING */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Representative Contacted</Label>
                <Input
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g. Mr. Rajesh Sharma"
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Communication Channel</Label>
                <Select value={contactChannel} onValueChange={setContactChannel}>
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[60]">
                    <SelectItem value="Phone Call">Phone Call</SelectItem>
                    <SelectItem value="In-Person Meeting">In-Person Meeting</SelectItem>
                    <SelectItem value="Email Communication">Email Communication</SelectItem>
                    <SelectItem value="Formal Letter">Formal Letter</SelectItem>
                    <SelectItem value="WhatsApp / SMS">WhatsApp / SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* JUSTIFICATION NOTES (MANDATORY) */}
            <div>
              <Label className="text-xs font-medium">Detailed Justification & Commitment Notes *</Label>
              <Textarea
                rows={3}
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value)}
                placeholder="Document specific business reason, customer promised milestone, and payment commitments..."
                className="mt-1 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || daysDelta === 0}>
                {saving ? 'Processing...' : 'Confirm Reschedule'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
