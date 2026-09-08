import { useCallback } from 'react';
import { useNumberFormat } from '@/lib/NumberFormatContext';
import { formatCurrency, formatNumber, formatCurrencyShort } from '@/lib/formatters';

export function useAmountFormatter() {
  const { numberSystem } = useNumberFormat();

  const formatAmount = useCallback(
    (value, options) => formatCurrency(value, numberSystem, options),
    [numberSystem]
  );

  const formatNum = useCallback(
    (value, options) => formatNumber(value, numberSystem, options),
    [numberSystem]
  );

  const formatAmountShort = useCallback(
    (value) => formatCurrencyShort(value, numberSystem),
    [numberSystem]
  );

  return { formatAmount, formatNumber: formatNum, formatAmountShort };
}
