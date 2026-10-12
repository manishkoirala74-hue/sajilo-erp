/**
 * EMI Calculation Service — Sajilo ERP
 * Handles mathematical generation of installment schedules with Day 0 Down Payment (Installment #0)
 * and strict Penny Balancing (Cent Adjustment) to eliminate rounding discrepancies.
 */

export function generateInstallmentSchedule({
  invoiceDate,
  grandTotal,
  downPayment = 0,
  installmentCount = 1,
  frequency = 'Monthly',
  interestRate = 0,
  interestType = 'ZeroInterest',
  firstDueDate
}) {
  const downPaymentAmt = Number(Math.max(0, Number(downPayment) || 0).toFixed(2));
  const principalTotal = Number(Number(grandTotal).toFixed(2));
  const financedPrincipal = Number(Math.max(0, principalTotal - downPaymentAmt).toFixed(2));
  const count = Math.max(1, parseInt(installmentCount, 10) || 1);

  if (downPaymentAmt >= principalTotal) {
    throw new Error('Down payment cannot equal or exceed the Grand Total.');
  }

  let totalInterest = 0;
  if (interestType === 'Flat' && interestRate > 0) {
    const months = frequency === 'Weekly' ? count / 4 : frequency === 'Quarterly' ? count * 3 : count;
    totalInterest = Number(((financedPrincipal * (Number(interestRate) / 100) * months) / 12).toFixed(2));
  } else if (interestType === 'Reducing' && interestRate > 0) {
    // Standard Amortized Monthly EMI
    const annualRate = Number(interestRate) / 100;
    const periodsPerYear = frequency === 'Weekly' ? 52 : frequency === 'Quarterly' ? 4 : 12;
    const periodicRate = annualRate / periodsPerYear;
    if (periodicRate > 0) {
      const emi = (financedPrincipal * periodicRate * Math.pow(1 + periodicRate, count)) / (Math.pow(1 + periodicRate, count) - 1);
      totalInterest = Number(((emi * count) - financedPrincipal).toFixed(2));
    }
  }

  const totalFinancedWithInterest = Number((financedPrincipal + totalInterest).toFixed(2));
  const baseMonthlyAmount = Math.floor((totalFinancedWithInterest / count) * 100) / 100;
  const pennyRemainder = Number((totalFinancedWithInterest - (baseMonthlyAmount * count)).toFixed(2));

  const schedule = [];

  // ── REFINEMENT 1: Day 0 Down Payment as Installment #0 ──
  if (downPaymentAmt > 0) {
    schedule.push({
      installment_no: 0,
      is_down_payment: true,
      due_date: invoiceDate || new Date().toISOString().split('T')[0],
      original_due_date: invoiceDate || new Date().toISOString().split('T')[0],
      principal_amount: downPaymentAmt,
      interest_amount: 0,
      total_amount: downPaymentAmt,
      paid_amount: 0,
      status: 'Pending',
      notes: 'Day 0 Down Payment (Due at checkout)'
    });
  }

  // Generate Installments #1 through #N
  const effectiveFirstDate = firstDueDate || invoiceDate || new Date().toISOString().split('T')[0];
  let cursorDate = new Date(effectiveFirstDate);

  for (let i = 1; i <= count; i++) {
    const isLast = (i === count);
    const amount = isLast ? Number((baseMonthlyAmount + pennyRemainder).toFixed(2)) : baseMonthlyAmount;
    const interest = totalFinancedWithInterest > 0 
      ? Number(((amount * (totalInterest / totalFinancedWithInterest))).toFixed(2))
      : 0;
    const principal = Number((amount - interest).toFixed(2));

    const dateStr = cursorDate.toISOString().split('T')[0];

    schedule.push({
      installment_no: i,
      is_down_payment: false,
      due_date: dateStr,
      original_due_date: dateStr,
      principal_amount: principal,
      interest_amount: interest,
      total_amount: amount,
      paid_amount: 0,
      status: 'Pending',
      notes: `Installment ${i} of ${count}`
    });

    if (frequency === 'Weekly') {
      cursorDate.setDate(cursorDate.getDate() + 7);
    } else if (frequency === 'Monthly') {
      cursorDate.setMonth(cursorDate.getMonth() + 1);
    } else if (frequency === 'Quarterly') {
      cursorDate.setMonth(cursorDate.getMonth() + 3);
    }
  }

  // Exact penny assertion
  const scheduleSum = Number(schedule.reduce((sum, item) => sum + item.total_amount, 0).toFixed(2));
  const expectedSum = Number((principalTotal + totalInterest).toFixed(2));

  if (Math.abs(scheduleSum - expectedSum) > 0.01) {
    throw new Error(`Schedule validation failed: sum (${scheduleSum}) != expected total (${expectedSum})`);
  }

  return {
    financedPrincipal,
    totalInterest,
    totalFinancedWithInterest,
    totalReceivable: expectedSum,
    schedule
  };
}
