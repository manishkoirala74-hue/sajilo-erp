// Nepali (BS) Calendar Utility
// Uses authoritative month-length dataset with precise AD↔BS conversion algorithms

const BS_CALENDAR_MAP = [
  { year: 2080, startAD: '2023-04-14', months: [31,32,31,32,31,30,31,30,29,30,29,30] },
  { year: 2081, startAD: '2024-04-13', months: [31,32,31,32,31,30,31,30,29,30,29,31] },
  { year: 2082, startAD: '2025-04-14', months: [31,31,32,32,31,30,30,30,29,30,30,30] },
  { year: 2083, startAD: '2026-04-14', months: [31,31,32,32,31,30,30,30,30,29,30,30] },
  { year: 2084, startAD: '2027-04-14', months: [31,32,31,32,31,30,30,30,30,29,30,30] },
  { year: 2085, startAD: '2028-04-13', months: [31,32,31,32,31,31,29,30,30,29,30,30] },
  { year: 2086, startAD: '2029-04-14', months: [31,31,32,31,31,31,30,29,30,30,29,30] },
  { year: 2087, startAD: '2030-04-14', months: [31,31,32,32,31,30,30,30,30,29,30,30] },
  { year: 2088, startAD: '2031-04-14', months: [30,32,31,32,31,30,31,30,29,30,29,30] },
  { year: 2089, startAD: '2032-04-13', months: [31,32,31,32,31,30,31,30,29,30,29,31] },
  { year: 2090, startAD: '2033-04-14', months: [31,31,32,32,31,30,30,30,29,30,30,30] },
];

export const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Ashad', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

// Parse a 'YYYY-MM-DD' or full ISO string into a UTC midnight Date to avoid timezone shifts
function parseDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  const cleanStr = dateStr.substring(0, 10);
  const [y, m, d] = cleanStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Difference in whole days between two Date objects (b - a)
function daysDiff(a, b) {
  return Math.round((b - a) / 86400000);
}

/**
 * Convert AD date string (YYYY-MM-DD) → { year, month, day } in BS
 */
export function adToBS(adDateStr) {
  const adDate = parseDate(adDateStr);

  // Find the last row whose startAD <= adDate
  let row = null;
  for (let i = BS_CALENDAR_MAP.length - 1; i >= 0; i--) {
    if (parseDate(BS_CALENDAR_MAP[i].startAD) <= adDate) {
      row = BS_CALENDAR_MAP[i];
      break;
    }
  }
  if (!row) return null;

  let delta = daysDiff(parseDate(row.startAD), adDate);

  let month = 1;
  for (let i = 0; i < row.months.length; i++) {
    if (delta >= row.months[i]) {
      delta -= row.months[i];
      month++;
    } else {
      break;
    }
  }

  const day = delta + 1;
  return { year: row.year, month, day };
}

/**
 * Convert BS { year, month, day } → AD date string (YYYY-MM-DD)
 */
export function bsToAD(bsYear, bsMonth, bsDay) {
  const row = BS_CALENDAR_MAP.find(r => r.year === bsYear);
  if (!row) return null;

  let dayCounter = 0;
  for (let i = 0; i < bsMonth - 1; i++) {
    dayCounter += row.months[i];
  }
  dayCounter += bsDay - 1;

  const startDate = parseDate(row.startAD);
  const adDate = new Date(startDate.getTime() + dayCounter * 86400000);

  const y = adDate.getUTCFullYear();
  const m = String(adDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(adDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get today's date in BS
 */
export function getTodayBS() {
  const today = new Date();
  const adStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  return adToBS(adStr);
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
/**
 * Validate a BS date
 */
export function isValidBSDate(bsYear, bsMonth, bsDay) {
  const row = BS_CALENDAR_MAP.find(r => r.year === bsYear);
  if (!row) return false;
  if (bsMonth < 1 || bsMonth > 12) return false;
  if (bsDay < 1 || bsDay > row.months[bsMonth - 1]) return false;
  return true;
}

/**
 * Format an AD date string (YYYY-MM-DD) as 'DD Mon YYYY'
 */
export function formatAD(adDateStr) {
  if (!adDateStr) return '';
  const date = parseDate(adDateStr);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatBSISO(bsDate) {
  if (!bsDate) return '';
  return `${bsDate.year}-${String(bsDate.month).padStart(2,'0')}-${String(bsDate.day).padStart(2,'0')}`;
}