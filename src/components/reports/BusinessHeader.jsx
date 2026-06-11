/**
 * BusinessHeader — Professional branded header for all reports.
 * Logo left, company info + report title + parsed BS/AD period right-aligned.
 * Used in both screen view and print layout.
 */
import { useEffect, useState } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { adToBS, formatBS, formatAD } from '@/lib/nepaliDate';

export default function BusinessHeader({ reportTitle, fromDate, toDate, subtitle }) {
  const [company, setCompany] = useState(null);

  useEffect(() => {
    sajilo.entities.CompanySettings.list()
      .then(d => { if (d.length > 0) setCompany(d[0]); })
      .catch(() => {});
  }, []);

  const fromBS = fromDate ? adToBS(fromDate) : null;
  const toBS   = toDate   ? adToBS(toDate)   : null;

  // Format as "16 Jestha 2082" style
  const bsPeriod = fromBS && toBS
    ? `${formatBS(fromBS)} — ${formatBS(toBS)}`
    : null;
  const adPeriod = fromDate && toDate
    ? `${formatAD(fromDate)} — ${formatAD(toDate)}`
    : null;

  return (
    <div className="flex items-start gap-4 pb-4 mb-4 border-b-2 border-border print:pb-3 print:mb-3">
      {/* Logo — left anchor */}
      <div className="shrink-0 w-16 h-16 flex items-center justify-center">
        {company?.company_logo_url
          ? <img src={company.company_logo_url} alt="logo" className="h-16 w-16 object-contain rounded-md" />
          : <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
              {company?.company_name?.[0] || '?'}
            </div>
        }
      </div>

      {/* Company + Report info — centered */}
      <div className="flex-1 text-center">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest print:text-[9px]">
          {company?.tax_id ? `PAN: ${company.tax_id}` : ''}
        </p>
        <h2 className="text-lg font-extrabold text-foreground leading-tight print:text-base">
          {company?.company_name || '—'}
        </h2>
        {company?.address && (
          <p className="text-xs text-muted-foreground print:text-[10px]">{company.address}</p>
        )}
        {(company?.phone || company?.email) && (
          <p className="text-xs text-muted-foreground print:text-[10px]">
            {[company.phone, company.email].filter(Boolean).join(' | ')}
          </p>
        )}
      </div>

      {/* Report title + period — right-aligned */}
      <div className="shrink-0 text-right min-w-[180px]">
        <h3 className="text-sm font-extrabold text-foreground uppercase tracking-wide print:text-[12px]">
          {reportTitle}
        </h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5 print:text-[10px]">{subtitle}</p>
        )}
        {bsPeriod && (
          <p className="text-xs font-semibold text-foreground mt-1 print:text-[10px]">
            {bsPeriod}
            <span className="text-muted-foreground font-normal"> (B.S.)</span>
          </p>
        )}
        {adPeriod && (
          <p className="text-xs text-muted-foreground print:text-[10px]">
            {adPeriod} <span className="text-muted-foreground">(A.D.)</span>
          </p>
        )}
      </div>
    </div>
  );
}