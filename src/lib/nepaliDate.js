// Nepali (BS) Calendar Utility
import NepaliDate from 'nepali-date-converter';

export const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Ashad', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

const pad = n => String(n).padStart(2, '0');
const addDaysAD = (ad, n) => {
  const [y, m, d] = ad.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

// Parse a 'YYYY-MM-DD' or full ISO string into a UTC midnight Date to avoid timezone shifts
// This is kept for formatting functions
function parseDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  const cleanStr = dateStr.substring(0, 10);
  const [y, m, d] = cleanStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Convert AD date string (YYYY-MM-DD) → { year, month, day } in BS
 */
export function adToBS(adDateStr) {
  if (!adDateStr) return null;
  const cleanStr = adDateStr.substring(0, 10);
  const [y, m, d] = cleanStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  
  try {
    const nepaliDate = new NepaliDate(new Date(y, m - 1, d));
    return {
      year: nepaliDate.getYear(),
      month: nepaliDate.getMonth() + 1, // Convert back to 1-indexed for the UI
      day: nepaliDate.getDate()
    };
  } catch (e) {
    return null;
  }
}

/**
 * Convert BS { year, month, day } → AD date string (YYYY-MM-DD)
 */
export function bsToAD(bsYear, bsMonth, bsDay) {
  try {
    const jsDate = new NepaliDate(bsYear, bsMonth - 1, bsDay).toJsDate();
    const adYear = jsDate.getFullYear();
    const adMonth = String(jsDate.getMonth() + 1).padStart(2, '0'); // Zero-pad
    const adDay = String(jsDate.getDate()).padStart(2, '0'); // Zero-pad
    return `${adYear}-${adMonth}-${adDay}`;
  } catch (e) {
    return null;
  }
}

/**
 * Validate a BS date
 */
export function isValidBSDate(bsYear, bsMonth, bsDay) {
  if (!bsYear || !bsMonth || !bsDay) return false;
  try {
    const nepaliDate = new NepaliDate(bsYear, bsMonth - 1, bsDay);
    // If the library rolled over an invalid date (e.g., Bhadra 32 -> Ashoj 1), these won't match
    return (
      nepaliDate.getYear() === bsYear &&
      nepaliDate.getMonth() === bsMonth - 1 &&
      nepaliDate.getDate() === bsDay
    );
  } catch (e) {
    return false;
  }
}

/**
 * Get days in a BS month
 */
export function getBSMonthDays(bsYear, bsMonth) {
  const start = bsToAD(bsYear, bsMonth, 1);
  const next  = bsMonth === 12 ? bsToAD(bsYear + 1, 1, 1) : bsToAD(bsYear, bsMonth + 1, 1);
  return Math.round((Date.parse(next) - Date.parse(start)) / 86400000);
}

/**
 * Returns month boundaries and days array for grid rendering.
 * calendar: 'AD' | 'BS', month 1-12
 */
export function getMonthPeriod(calendar, year, month) {
  let startAD, length, label;
  if (calendar === 'BS') {
    startAD = bsToAD(year, month, 1);
    length  = getBSMonthDays(year, month);
    label   = `${BS_MONTHS[month - 1]} ${year}`;
  } else {
    startAD = `${year}-${pad(month)}-01`;
    length  = new Date(Date.UTC(year, month, 0)).getUTCDate();
    label   = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  const days = Array.from({ length }, (_, i) => {
    const ad = addDaysAD(startAD, i);
    const bs = adToBS(ad) || { day: '-', month: '-' };
    return {
      ad,
      adDay: Number(ad.slice(8)),
      bsDay: bs.day,
      bsMonth: bs.month,
      weekday: new Date(ad + 'T00:00:00Z').getUTCDay() // 0=Sun ... 6=Sat
    };
  });
  return { calendar, year, month, startAD, endAD: days[length - 1].ad, label, days };
}

/**
 * Get today's date in BS respecting Nepal Standard Time (Asia/Kathmandu, UTC+05:45)
 */
export function getTodayBS() {
  try {
    const nptFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kathmandu',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const adStr = nptFormatter.format(new Date());
    return adToBS(adStr);
  } catch (e) {
    const today = new Date();
    const adStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    return adToBS(adStr);
  }
}

/**
 * Format a BS date object as 'DD MonthName YYYY'
 */
export function formatBS(bsDate) {
  if (!bsDate) return '';
  return `${bsDate.day} ${BS_MONTHS[bsDate.month - 1]} ${bsDate.year}`;
}

/**
 * Format a BS date object as 'YYYY-MM-DD'
 */
export function formatBSISO(bsDate) {
  if (!bsDate) return '';
  return `${bsDate.year}-${String(bsDate.month).padStart(2,'0')}-${String(bsDate.day).padStart(2,'0')}`;
}

/**
 * Format an AD date string (YYYY-MM-DD) as 'DD Mon YYYY'
 */
export function formatAD(adDateStr) {
  if (!adDateStr) return '';
  const date = parseDate(adDateStr);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatToDmyAD(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${d}/${m}/${y}`;
}

export function formatToDmyBS(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const localAdStr = `${y}-${m}-${d}`;
  
  const bsDate = adToBS(localAdStr);
  if (!bsDate) return '';
  return `${String(bsDate.day).padStart(2, '0')}/${String(bsDate.month).padStart(2, '0')}/${bsDate.year}`;
}

export const formatDualDateString = (dateStr, showBS = true) => {
  if (!dateStr) return '';
  const adString = `${formatToDmyAD(dateStr)} AD`;
  if (!showBS) return adString;
  return `${adString} / ${formatToDmyBS(dateStr)} BS`;
};

export const BS_MONTH_LABELS = [
  'Baisakh', 'Jestha', 'Ashad', 'Shrawan', 'Bhadra', 'Ashoj',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

export const BS_MONTH_SHORT_LABELS = [
  'Bai', 'Jes', 'Ash', 'Shr', 'Bha', 'Aso',
  'Kar', 'Mgs', 'Pou', 'Mag', 'Fal', 'Cha'
];

/**
 * Returns local ISO date string (YYYY-MM-DD) avoiding UTC offset bugs.
 * Respects Nepal Standard Time (UTC+05:45).
 */
export const getLocalDateString = (dateObj = new Date()) => {
  try {
    const nptFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kathmandu',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return nptFormatter.format(dateObj);
  } catch (_) {
    const offset = dateObj.getTimezoneOffset() * 60000;
    return new Date(dateObj.getTime() - offset).toISOString().slice(0, 10);
  }
};

/**
 * 1. KPI BOUNDARY: Returns current Month-To-Date (MTD) date boundaries.
 * Strictly guarantees top KPI cards reflect only the current month's figures.
 *
 * @param {'AD' | 'BS'} calendarMode 
 * @returns {{ startDate: string, endDate: string, currentMonthLabel: string }}
 */
export function getCurrentMonthRange(calendarMode = 'AD') {
  const today = new Date();
  const endDate = getLocalDateString(today);

  if (calendarMode === 'BS') {
    const todayBS = getTodayBS();
    const startDate = bsToAD(todayBS.year, todayBS.month, 1);
    const currentMonthLabel = `${BS_MONTH_LABELS[todayBS.month - 1]} ${todayBS.year}`;
    return { startDate, endDate, currentMonthLabel };
  }

  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const startDate = `${y}-${m}-01`;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentMonthLabel = `${monthNames[today.getMonth()]} ${y}`;

  return { startDate, endDate, currentMonthLabel };
}

/**
 * 2. CHART BOUNDARY: Returns rolling 6-month buckets and query boundaries.
 * Fully immune to 31st day-overflow and early morning UTC rollback.
 *
 * @param {'AD' | 'BS'} calendarMode 
 * @param {number} monthCount Default 6
 * @returns {{ startDate: string, endDate: string, buckets: Array<object> }}
 */
export function getDashboardChartRange(calendarMode = 'AD', monthCount = 6) {
  const today = new Date();
  const endDate = getLocalDateString(today);

  if (calendarMode === 'BS') {
    const todayBS = getTodayBS();
    const buckets = [];

    for (let i = monthCount - 1; i >= 0; i--) {
      let m = todayBS.month - i;
      let y = todayBS.year;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const label = BS_MONTH_LABELS[m - 1];
      const shortLabel = BS_MONTH_SHORT_LABELS[m - 1];
      buckets.push({
        key,
        label,
        shortLabel,
        year: y,
        month: m,
        tooltipLabel: `${label} ${y}`
      });
    }

    const earliest = buckets[0];
    const startDate = bsToAD(earliest.year, earliest.month, 1);
    return { startDate, endDate, buckets };
  }

  // Fallback / Standard Gregorian (AD)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const buckets = [];

  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = monthNames[d.getMonth()];
    buckets.push({
      key,
      label,
      shortLabel: label,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      tooltipLabel: `${label} ${d.getFullYear()}`
    });
  }

  const earliestBucket = buckets[0];
  const startDate = `${earliestBucket.year}-${String(earliestBucket.month).padStart(2, '0')}-01`;

  return { startDate, endDate, buckets };
}