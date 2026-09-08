export function formatCurrency(value, numberSystem = 'international', options = {}) {
  const { prefix = 'NPR ', showZeroAsDash = true, zeroValue = '0.00' } = options;
  if (value == null || isNaN(value)) return showZeroAsDash ? '—' : zeroValue;
  const num = Number(value);
  if (num === 0) return showZeroAsDash ? '—' : zeroValue;
  
  const absNum = Math.abs(num);
  const locale = numberSystem === 'south_asian' ? 'en-IN' : 'en-US';
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(absNum);
  
  return num < 0 ? `(${prefix}${formatted})` : `${prefix}${formatted}`;
}

export function formatNumber(value, numberSystem = 'international', options = {}) {
  const { showZeroAsDash = true, zeroValue = '0.00' } = options;
  if (value == null || isNaN(value)) return showZeroAsDash ? '—' : zeroValue;
  const num = Number(value);
  if (num === 0) return showZeroAsDash ? '—' : zeroValue;
  
  const absNum = Math.abs(num);
  const locale = numberSystem === 'south_asian' ? 'en-IN' : 'en-US';
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(absNum);
  
  return num < 0 ? `(${formatted})` : formatted;
}

export function formatCurrencyShort(value, numberSystem = 'international') {
  if (value == null || isNaN(value)) return 'NPR 0';
  const num = Number(value);
  if (num === 0) return 'NPR 0';
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (numberSystem === 'south_asian') {
    if (absNum >= 1e9) return `${sign}NPR ${(absNum / 1e9).toFixed(2).replace(/\.00$/, '')}Ar`;
    if (absNum >= 1e7) return `${sign}NPR ${(absNum / 1e7).toFixed(2).replace(/\.00$/, '')}Cr`;
    if (absNum >= 1e5) return `${sign}NPR ${(absNum / 1e5).toFixed(2).replace(/\.00$/, '')}L`;
    if (absNum >= 1e3) return `${sign}NPR ${(absNum / 1e3).toFixed(0)}K`;
  } else {
    if (absNum >= 1e9) return `${sign}NPR ${(absNum / 1e9).toFixed(2).replace(/\.00$/, '')}B`;
    if (absNum >= 1e6) return `${sign}NPR ${(absNum / 1e6).toFixed(2).replace(/\.00$/, '')}M`;
    if (absNum >= 1e3) return `${sign}NPR ${(absNum / 1e3).toFixed(0)}K`;
  }
  
  const locale = numberSystem === 'south_asian' ? 'en-IN' : 'en-US';
  return `${sign}NPR ${new Intl.NumberFormat(locale).format(absNum)}`;
}
