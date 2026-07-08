import React, { useMemo } from 'react';
import { formatToDmyAD, formatToDmyBS } from '@/lib/nepaliDate';
import { useDateFormat } from '@/lib/DateFormatContext';

export default function DualDateDisplay({ date }) {
  const { displayBsDate } = useDateFormat();
  
  const bsDateStr = useMemo(() => {
    if (!displayBsDate || !date) return null;
    return formatToDmyBS(date);
  }, [date, displayBsDate]);

  const adDateStr = useMemo(() => {
    if (!date) return '';
    return formatToDmyAD(date);
  }, [date]);

  if (!date) return <span className="text-muted-foreground">—</span>;

  if (displayBsDate) {
    return (
      <div className="flex flex-col">
        <span className="font-medium text-foreground whitespace-nowrap">{bsDateStr} BS</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{adDateStr} AD</span>
      </div>
    );
  }

  return <span className="text-foreground whitespace-nowrap">{adDateStr} AD</span>;
}
