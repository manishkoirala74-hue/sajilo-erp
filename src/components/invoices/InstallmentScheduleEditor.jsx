import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generateInstallmentSchedule } from '@/lib/emiCalculationService';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DateInput from '@/components/shared/DateInput';
import DualDateDisplay from '@/components/shared/DualDateDisplay';
import { Calendar, Percent, ShieldCheck } from 'lucide-react';

export default function InstallmentScheduleEditor({
  invoiceDate,
  grandTotal: propGrandTotal,
  invoiceAmount,
  downPayment: propDownPayment,
  onDownPaymentChange,
  downPaymentAccountId: propDownPaymentAccountId,
  onDownPaymentAccountChange,
  accounts: propAccounts = [],
  bankAccounts = [],
  frequency: propFrequency,
  onFrequencyChange,
  installmentCount: propInstallmentCount,
  onInstallmentCountChange,
  interestRate: propInterestRate,
  onInterestRateChange,
  interestType: propInterestType,
  onInterestTypeChange,
  firstDueDate: propFirstDueDate,
  onFirstDueDateChange,
  onScheduleGenerated,
  onScheduleChange,
  initialValues = {}
}) {
  const grandTotal = Number(propGrandTotal ?? invoiceAmount ?? 0);
  const isSelfManaged = !onDownPaymentChange && Boolean(onScheduleChange);

  // Local state for self-managed mode
  const [localDownPayment, setLocalDownPayment] = useState(initialValues.downPayment ?? '');
  const [localDownPaymentAccountId, setLocalDownPaymentAccountId] = useState(initialValues.downPaymentAccountId ?? '');
  const [localFrequency, setLocalFrequency] = useState(initialValues.frequency || 'Monthly');
  const [localInstallmentCount, setLocalInstallmentCount] = useState(initialValues.tenureMonths || initialValues.installmentCount || 1);
  const [localInterestRate, setLocalInterestRate] = useState(initialValues.interestRate || '0');
  const [localInterestType, setLocalInterestType] = useState(initialValues.interestType || 'ZeroInterest');
  const [localFirstDueDate, setLocalFirstDueDate] = useState(initialValues.firstDueDate || '');

  // Synchronize from initialValues if they change externally
  useEffect(() => {
    if (isSelfManaged && initialValues) {
      if (initialValues.downPayment !== undefined) setLocalDownPayment(initialValues.downPayment);
      if (initialValues.downPaymentAccountId !== undefined) setLocalDownPaymentAccountId(initialValues.downPaymentAccountId);
      if (initialValues.frequency) setLocalFrequency(initialValues.frequency);
      if (initialValues.tenureMonths || initialValues.installmentCount) {
        setLocalInstallmentCount(initialValues.tenureMonths || initialValues.installmentCount);
      }
      if (initialValues.interestRate !== undefined) setLocalInterestRate(initialValues.interestRate);
      if (initialValues.interestType) setLocalInterestType(initialValues.interestType);
    }
  }, [initialValues.downPayment, initialValues.downPaymentAccountId, initialValues.frequency, initialValues.tenureMonths, initialValues.interestRate, initialValues.interestType, isSelfManaged]);

  const downPayment = isSelfManaged ? localDownPayment : (propDownPayment ?? '');
  const downPaymentAccountId = isSelfManaged ? localDownPaymentAccountId : (propDownPaymentAccountId ?? '');
  const frequency = isSelfManaged ? localFrequency : (propFrequency ?? 'Monthly');
  const installmentCount = isSelfManaged ? localInstallmentCount : (propInstallmentCount ?? 1);
  const interestRate = isSelfManaged ? localInterestRate : (propInterestRate ?? '0');
  const interestType = isSelfManaged ? localInterestType : (propInterestType ?? 'ZeroInterest');
  const firstDueDate = isSelfManaged ? localFirstDueDate : (propFirstDueDate ?? '');

  // Handlers bridging controlled vs self-managed
  const handleDownPaymentChange = (val) => {
    if (isSelfManaged) setLocalDownPayment(val);
    if (onDownPaymentChange) onDownPaymentChange(val);
  };

  const handleDownPaymentAccountChange = (val) => {
    if (isSelfManaged) setLocalDownPaymentAccountId(val);
    if (onDownPaymentAccountChange) onDownPaymentAccountChange(val);
  };

  const handleInstallmentCountChange = (val) => {
    if (isSelfManaged) setLocalInstallmentCount(val);
    if (onInstallmentCountChange) onInstallmentCountChange(val);
  };

  const handleFrequencyChange = (val) => {
    if (isSelfManaged) setLocalFrequency(val);
    if (onFrequencyChange) onFrequencyChange(val);
  };

  const handleInterestTypeChange = (val) => {
    if (isSelfManaged) setLocalInterestType(val);
    if (onInterestTypeChange) onInterestTypeChange(val);
  };

  const handleInterestRateChange = (val) => {
    if (isSelfManaged) setLocalInterestRate(val);
    if (onInterestRateChange) onInterestRateChange(val);
  };

  const handleFirstDueDateChange = (val) => {
    if (isSelfManaged) setLocalFirstDueDate(val);
    if (onFirstDueDateChange) onFirstDueDateChange(val);
  };

  // Memoized schedule generation with exact penny balancing and Day 0 Down payment
  const calculated = useMemo(() => {
    try {
      if (!grandTotal || grandTotal <= 0) return null;
      const res = generateInstallmentSchedule({
        invoiceDate,
        grandTotal,
        downPayment,
        installmentCount,
        frequency,
        interestRate,
        interestType,
        firstDueDate
      });
      return res;
    } catch (e) {
      console.warn('Schedule generation warning:', e.message);
      return null;
    }
  }, [
    invoiceDate,
    grandTotal,
    downPayment,
    installmentCount,
    frequency,
    interestRate,
    interestType,
    firstDueDate
  ]);

  // Notify parent component of schedule updates
  const lastEmitRef = useRef('');
  useEffect(() => {
    if (!calculated) return;
    const emitKey = JSON.stringify({
      total: calculated.totalReceivable,
      slices: calculated.schedule.length,
      dp: downPayment,
      acc: downPaymentAccountId,
      freq: frequency,
      rate: interestRate,
      type: interestType,
      tenure: installmentCount
    });

    if (lastEmitRef.current === emitKey) return;
    lastEmitRef.current = emitKey;

    if (onScheduleGenerated) {
      onScheduleGenerated(calculated);
    }
    if (onScheduleChange) {
      onScheduleChange({
        schedule: calculated.schedule,
        totalInterest: calculated.totalInterest,
        grandTotalWithInterest: calculated.totalReceivable,
        downPayment: Number(downPayment || 0),
        downPaymentAccountId: downPaymentAccountId || null,
        frequency,
        interestRate: Number(interestRate || 0),
        interestType,
        tenure: Number(installmentCount || 1)
      });
    }
  }, [calculated, downPayment, downPaymentAccountId, frequency, interestRate, interestType, installmentCount, onScheduleGenerated, onScheduleChange]);

  // Strictly filter only genuine Cash and Bank accounts (prevent customer/AR ledgers)
  const cashBankAccounts = useMemo(() => {
    const combined = [...(propAccounts || []), ...(bankAccounts || [])];
    const uniqueMap = new Map();
    combined.forEach(acc => {
      if (acc && acc.id && !uniqueMap.has(acc.id)) uniqueMap.set(acc.id, acc);
    });

    return Array.from(uniqueMap.values()).filter(a => {
      if (!a || a.ledger_type !== 'Sub Ledger' || a.is_active === false) return false;

      // 1. Authoritative check: Explicit database flags on ChartOfAccount
      if (a.is_cash_account === true || a.is_bank_account === true) {
        return true;
      }

      // 2. Direct account_type match
      if (a.account_type === 'Cash' || a.account_type === 'Bank') {
        return true;
      }

      // 3. Fallback for seeded default Cash in Hand (Code 1110) or ledgers grouped under Bank Accounts (Group 1120)
      const code = String(a.account_code || '');
      const parentName = (a.parent_account_name || '').toLowerCase();

      // Must be an Asset (Strictly excludes Liabilities like Bank Loan 2210)
      if (a.account_type !== 'Asset') return false;

      // Seeded default Cash in Hand
      if (code === '1110') return true;

      // Sub-ledger grouped under 1120 Bank Accounts parent group
      if (a.parent_account_code === '1120' || parentName === 'bank accounts' || parentName === 'bank') {
        return true;
      }

      return false;
    });
  }, [propAccounts, bankAccounts]);

  const fmt = (n) => `NPR ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4 rounded-2xl border border-stone-200 dark:border-stone-800 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <h3 className="font-semibold text-base text-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" /> Installment (EMI) Plan Configuration
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Financed goods balance broken into periodic payment maturities
          </p>
        </div>
        {calculated && (
          <div className="text-right">
            <span className="text-xs text-muted-foreground">Total Receivable:</span>
            <div className="font-bold text-sm text-primary">{fmt(calculated.totalReceivable)}</div>
          </div>
        )}
      </div>

      {/* PARAMETERS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Down payment */}
        <div>
          <Label className="text-xs font-medium">Down Payment Amount</Label>
          <div className="relative mt-1">
            <Input
              type="text"
              inputMode="decimal"
              value={downPayment}
              onChange={(e) => handleDownPaymentChange(e.target.value)}
              placeholder="0.00"
              className="font-mono text-right pr-3"
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Financed Bal: {fmt(Math.max(0, (grandTotal || 0) - (Number(downPayment) || 0)))}
          </p>
        </div>

        {/* Down Payment Deposit Account (Zero-Click Sweep) */}
        <div>
          <Label className="text-xs font-medium">Down Payment Account</Label>
          <Select 
            value={downPaymentAccountId || 'PAY_LATER'} 
            onValueChange={(val) => handleDownPaymentAccountChange(val === 'PAY_LATER' ? '' : val)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select Deposit Account" />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="PAY_LATER" className="font-medium text-amber-600">
                ⏳ Pay Later (Record Day 0 Arrears)
              </SelectItem>
              {cashBankAccounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.account_name} ({acc.account_code || 'Bank/Cash'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            {downPaymentAccountId ? '✓ Auto-clears Installment #0 at checkout' : 'Pending Day 0 balance'}
          </p>
        </div>

        {/* Tenor / Installment Count */}
        <div>
          <Label className="text-xs font-medium">Number of Installments *</Label>
          <Input
            type="number"
            min={1}
            max={60}
            value={installmentCount}
            onChange={(e) => handleInstallmentCountChange(e.target.value)}
            className="mt-1 font-mono text-right"
          />
        </div>

        {/* Frequency */}
        <div>
          <Label className="text-xs font-medium">Payment Frequency</Label>
          <Select value={frequency} onValueChange={handleFrequencyChange}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="Weekly">Weekly (Every 7 days)</SelectItem>
              <SelectItem value="Monthly">Monthly (Recommended)</SelectItem>
              <SelectItem value="Quarterly">Quarterly (Every 3 months)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Interest Type */}
        <div>
          <Label className="text-xs font-medium">Interest Plan</Label>
          <Select value={interestType} onValueChange={handleInterestTypeChange}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="ZeroInterest">0% Promo EMI (Zero Interest)</SelectItem>
              <SelectItem value="Flat">Flat Annual Interest Rate</SelectItem>
              <SelectItem value="Reducing">Reducing Balance (Amortized)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Interest Rate */}
        {interestType !== 'ZeroInterest' && (
          <div>
            <Label className="text-xs font-medium">Annual Interest Rate (%)</Label>
            <div className="relative mt-1">
              <Input
                type="text"
                inputMode="decimal"
                value={interestRate}
                onChange={(e) => handleInterestRateChange(e.target.value)}
                placeholder="10.0"
                className="font-mono text-right pr-7"
              />
              <Percent className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-3" />
            </div>
            {calculated?.totalInterest > 0 && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
                Financing Charge: +{fmt(calculated.totalInterest)}
              </p>
            )}
          </div>
        )}

        {/* First Due Date */}
        <div>
          <DateInput
            label="First Installment Due Date"
            value={firstDueDate}
            onChange={handleFirstDueDateChange}
            className="mt-1"
          />
        </div>
      </div>

      {/* SCHEDULE PREVIEW TABLE */}
      {calculated && calculated.schedule && (
        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Generated Schedule Preview
            </span>
            <span className="text-xs text-muted-foreground">
              {calculated.schedule.length} Total Slices (Penny Balanced)
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 px-3 text-left">Slice #</th>
                  <th className="py-2 px-3 text-left">Due Date (AD & BS)</th>
                  <th className="py-2 px-3 text-right">Principal</th>
                  <th className="py-2 px-3 text-right">Interest</th>
                  <th className="py-2 px-3 text-right font-semibold">Total Amount</th>
                  <th className="py-2 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {calculated.schedule.map((item) => (
                  <tr 
                    key={item.installment_no}
                    className={item.is_down_payment ? 'bg-amber-50/50 dark:bg-amber-950/20 font-medium' : 'hover:bg-muted/40'}
                  >
                    <td className="py-2 px-3">
                      {item.is_down_payment ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                          Inst #0 (Down Payment)
                        </span>
                      ) : (
                        `Inst #${item.installment_no}`
                      )}
                    </td>
                    <td className="py-2 px-3">
                      <DualDateDisplay date={item.due_date} />
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{fmt(item.principal_amount)}</td>
                    <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                      {item.interest_amount > 0 ? fmt(item.interest_amount) : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-foreground">
                      {fmt(item.total_amount)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                        {item.is_down_payment && downPaymentAccountId ? 'Cleared at checkout' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
