import { useMemo } from 'react';
import { CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * Nepalese Fiscal Year Continuity Advisor
 *
 * Analyses the list of fiscal years and surfaces two kinds of timeline issues:
 *   - GAP      : prev.end_date + 1 day ≠ next.start_date
 *   - OVERLAP  : prev.end_date >= next.start_date
 *
 * BS calendar nuance:
 *   Nepal's fiscal year mandated by the Inland Revenue Department (IRD) begins on
 *   Shrawan 1 (typically 16–17 July in AD). Because Bikram Sambat month lengths are
 *   not uniform and don't map cleanly to Gregorian arithmetic, we do NOT rely on
 *   simple +1-day math to judge continuity. Instead, we flag any gap whose size
 *   is more than 1 day (tolerating the single-day rounding artefact that can appear
 *   when an AD-stored boundary date is derived from a BS calendar picker), and
 *   separately flag the start date if it falls outside the statutory Shrawan window
 *   (mid-July, i.e. the 13th–18th of July in AD terms).
 */
export default function FiscalYearContiguityAdvisor({ fiscalYears = [] }) {
  const { gaps, overlaps, nonShrawaStarts } = useMemo(() => {
    if (!fiscalYears || fiscalYears.length < 2) {
      return { gaps: [], overlaps: [], nonShrawaStarts: [] };
    }

    // Sort ascending by start date to compare consecutive pairs
    const sorted = [...fiscalYears].sort(
      (a, b) => new Date(a.start_date) - new Date(b.start_date)
    );

    const gaps = [];
    const overlaps = [];

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next    = sorted[i + 1];

      const currentEnd  = new Date(current.end_date);
      const nextStart   = new Date(next.start_date);

      // Expected start = day after current end
      const expectedStart = new Date(currentEnd);
      expectedStart.setDate(expectedStart.getDate() + 1);

      const diffDays = Math.round(
        (nextStart - expectedStart) / (1000 * 60 * 60 * 24)
      );

      if (diffDays > 1) {
        // Gap of more than 1 day (we tolerate diffDays === 1 as a BS rounding artefact)
        gaps.push({
          from: current,
          to:   next,
          gapDays: diffDays,
          expectedStart: expectedStart.toISOString().slice(0, 10),
        });
      } else if (nextStart <= currentEnd) {
        // Overlap: next year starts before current ends
        overlaps.push({
          a: current,
          b: next,
        });
      }
    }

    // BS Statutory Start Check:
    // IRD mandates Shrawan 1 as the fiscal year start. Shrawan 1 in AD falls
    // roughly between July 13 and July 19, depending on the BS year.
    // We flag any year whose AD start_date falls outside July 13–19.
    const SHRAWAN_START_MIN_MM_DD = '07-13'; // inclusive lower bound
    const SHRAWAN_START_MAX_MM_DD = '07-19'; // inclusive upper bound
    const nonShrawaStarts = sorted.filter((fy) => {
      const mmdd = fy.start_date.slice(5); // extract MM-DD from YYYY-MM-DD
      return mmdd < SHRAWAN_START_MIN_MM_DD || mmdd > SHRAWAN_START_MAX_MM_DD;
    });

    return { gaps, overlaps, nonShrawaStarts };
  }, [fiscalYears]);

  const hasIssues = gaps.length > 0 || overlaps.length > 0 || nonShrawaStarts.length > 0;

  // If all looks clean, render a subtle "all good" badge
  if (!hasIssues) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 mt-4 border border-emerald-200/60
                      bg-emerald-50/60 dark:bg-emerald-500/5 dark:border-emerald-500/20 rounded-lg">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <p className="text-xs text-emerald-800 dark:text-emerald-300 font-medium">
          Fiscal year timeline is continuous and aligns with the IRD Shrawan 1 requirement.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {/* ── Overlap Issues ────────────────────────────────────────────── */}
      {overlaps.map((o, i) => (
        <div
          key={`overlap-${i}`}
          className="flex items-start gap-3 p-4 border border-red-200/60
                     bg-red-50/70 dark:bg-red-500/5 dark:border-red-500/20 rounded-lg"
        >
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-red-900 dark:text-red-200">
              Overlapping Fiscal Years Detected
            </h4>
            <p className="text-xs text-red-700 dark:text-red-300 mt-1">
              <span className="font-medium">{o.a.fiscal_year_name}</span>
              {' '}(ends {o.a.end_date}) overlaps with{' '}
              <span className="font-medium">{o.b.fiscal_year_name}</span>
              {' '}(starts {o.b.start_date}).
              Overlapping periods cause duplicate GL postings and incorrect balance rollovers.
              Delete the erroneous year and recreate it with correct dates.
            </p>
          </div>
        </div>
      ))}

      {/* ── Gap Issues ────────────────────────────────────────────────── */}
      {gaps.map((g, i) => (
        <div
          key={`gap-${i}`}
          className="flex items-start gap-3 p-4 border border-amber-200/50
                     bg-[#FDFBF7] dark:bg-amber-500/5 dark:border-amber-500/20 rounded-lg"
        >
          <CalendarClock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-[#2A241F] dark:text-amber-100">
              Timeline Gap Detected ({g.gapDays} day{g.gapDays !== 1 ? 's' : ''})
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              There is a gap between{' '}
              <span className="font-medium text-foreground">{g.from.fiscal_year_name}</span>
              {' '}(ends {g.from.end_date}) and{' '}
              <span className="font-medium text-foreground">{g.to.fiscal_year_name}</span>
              {' '}(starts {g.to.start_date}).
              The expected contiguous start date would be{' '}
              <span className="font-medium text-foreground">{g.expectedStart}</span>.
              Ensure this gap aligns with statutory reporting requirements or correct the dates.
            </p>
          </div>
        </div>
      ))}

      {/* ── Non-Shrawan Start Warnings ────────────────────────────────── */}
      {nonShrawaStarts.map((fy, i) => (
        <div
          key={`shrawa-${i}`}
          className="flex items-start gap-3 p-4 border border-amber-200/50
                     bg-[#FDFBF7] dark:bg-amber-500/5 dark:border-amber-500/20 rounded-lg"
        >
          <CalendarClock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-[#2A241F] dark:text-amber-100">
              Possible Non-Shrawan Start: {fy.fiscal_year_name}
            </h4>
            <p className="text-xs text-muted-foreground mt-1">
              Start date <span className="font-medium text-foreground">{fy.start_date}</span> falls
              outside the typical AD range for Shrawan 1 (13 July – 19 July). Nepali fiscal years
              mandated by the IRD must begin on 1 Shrawan. Please verify this date against the
              official BS calendar for the relevant year.
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
