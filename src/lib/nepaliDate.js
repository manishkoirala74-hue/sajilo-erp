// Nepali (BS) Calendar Utility
import NepaliDate from 'nepali-date-converter';

export const BS_MONTHS = [
  'Baisakh', 'Jestha', 'Ashad', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

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