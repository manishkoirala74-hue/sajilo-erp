export function parseTimeString(timeStr) {
  if (!timeStr) return null;
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes; // returns minutes since midnight
}

export function formatTimeMinutes(minutes) {
  if (minutes === null || isNaN(minutes)) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function calculateAttendanceStatus(checkIn, checkOut, settings) {
  if (!checkIn || !checkOut) return { status: 'Absent', workedHours: 0 };

  const inMins = parseTimeString(checkIn);
  const outMins = parseTimeString(checkOut);

  if (inMins === null || outMins === null || outMins <= inMins) {
    return { status: 'Absent', workedHours: 0, error: 'Invalid time pair' };
  }

  const workedMinutes = outMins - inMins;
  const workedHours = +(workedMinutes / 60).toFixed(2);

  const shiftStartMins = parseTimeString(settings?.hr_shift_start || '10:00');
  const graceMins = settings?.hr_grace_minutes ?? 15;
  const fullDayHours = settings?.hr_full_day_hours ?? 8;
  const halfDayHours = settings?.hr_half_day_hours ?? 4;

  let status = 'Present';

  // Check late arrival
  if (inMins > shiftStartMins + graceMins) {
    status = 'Late';
  }

  // Overwrite status if hours are less than required
  if (workedHours < halfDayHours) {
    status = 'Absent';
  } else if (workedHours < fullDayHours && status !== 'Late') {
    // If they were late but still did 8 hours? Usually Late is based on checkIn.
    // If they did less than full day, mark Half Day, unless they are already marked Absent.
    status = 'Half Day';
  } else if (workedHours < fullDayHours && status === 'Late') {
    // Both late and didn't complete full hours -> Half Day is more severe for payroll (if it was deducted, but in v3 late is 0 deduction, HD is 0.5)
    status = 'Half Day';
  }

  return { status, workedHours };
}
