/**
 * DateInput — dual AD/BS date input
 * Props:
 *   value: string (always AD "YYYY-MM-DD")
 *   onChange: (adValue: string) => void
 *   label: string (optional)
 *   className: string (optional)
 *   disabled: boolean (optional)
 */
import { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adToBS, bsToAD, isValidBSDate, formatBS, formatAD, formatBSISO } from '@/lib/nepaliDate';
import { useDateFormat } from '@/lib/DateFormatContext';
import { cn } from '@/lib/utils';

export default function DateInput({ value, onChange, label, className, disabled }) {
  const { dateFormat } = useDateFormat();
  const [mode, setMode] = useState(dateFormat);

  // Sync mode when global format changes
  useEffect(() => { setMode(dateFormat); }, [dateFormat]);

  // Local BS text — tracks what the user is typing, independent of value
  const [bsText, setBsText] = useState(() => value ? formatBSISO(adToBS(value)) : '');

  // When the outer AD value changes (e.g. form reset), sync BS text
  useEffect(() => {
    setBsText(value ? formatBSISO(adToBS(value)) : '');
  }, [value]);

  const handleADChange = (e) => {
    const ad = e.target.value; // browser always gives valid "YYYY-MM-DD" or ''
    onChange(ad);
    setBsText(ad ? formatBSISO(adToBS(ad)) : '');
  };

  const handleBSChange = (e) => {
    const raw = e.target.value;
    setBsText(raw); // always update local display immediately

    // Only attempt conversion when the user has typed a complete, valid BS date (YYYY-MM-DD)
    const parts = raw.split('-').map(Number);
    if (raw.length === 10 && parts.length === 3 && isValidBSDate(parts[0], parts[1], parts[2])) {
      const ad = bsToAD(parts[0], parts[1], parts[2]);
      if (ad) onChange(ad);
    }
    // If incomplete / invalid, do NOT call onChange — leave the stored AD value untouched
  };

  const toggleMode = () => {
    setMode(m => {
      const next = m === 'AD' ? 'BS' : 'AD';
      // Re-sync BS text when switching to BS mode
      if (next === 'BS') setBsText(value ? formatBSISO(adToBS(value)) : '');
      return next;
    });
  };

  const bsDisplay = value ? adToBS(value) : null;

  return (
    <div className={cn('space-y-1', className)}>
      {label && <Label>{label}</Label>}
      <div className="flex items-center gap-1">
        {mode === 'AD' ? (
          <Input
            type="date"
            value={value || ''}
            onChange={handleADChange}
            disabled={disabled}
            className="flex-1"
          />
        ) : (
          <Input
            type="text"
            value={bsText}
            onChange={handleBSChange}
            disabled={disabled}
            placeholder="YYYY-MM-DD (BS)"
            maxLength={10}
            className={cn(
              'flex-1 font-mono',
              bsText.length === 10 && (() => { const p = bsText.split('-').map(Number); return !isValidBSDate(p[0],p[1],p[2]); })() && 'border-destructive focus-visible:ring-destructive'
            )}
          />
        )}
        <button
          type="button"
          onClick={toggleMode}
          title={mode === 'AD' ? 'Switch to Nepali (BS)' : 'Switch to English (AD)'}
          className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-input bg-muted/50 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <Calendar className="w-3 h-3" />
          {mode}
        </button>
      </div>
      {/* Helper text — shows the opposite calendar */}
      <p className="text-xs text-muted-foreground min-h-[1rem]">
        {mode === 'AD'
          ? (bsDisplay ? `BS: ${formatBS(bsDisplay)}` : '')
          : (value ? `AD: ${formatAD(value)}` : (bsText.length === 10 && (() => { const p = bsText.split('-').map(Number); return !isValidBSDate(p[0],p[1],p[2]); })() ? '⚠ Invalid BS date' : ''))
        }
      </p>
    </div>
  );
}