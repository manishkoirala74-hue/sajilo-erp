/**
 * Report Export Engine
 * Handles CSV, and print/PDF exports with business header injection.
 */

import { downloadCSV } from './reportColumnUtils';
import { adToBS, formatBS, formatAD } from '@/lib/nepaliDate';

/**
 * Build the plain-text business header lines for CSV exports.
 */
function buildTextHeader(company, reportTitle, fromDate, toDate) {
  const lines = [];
  lines.push([company?.company_name || 'Company']);
  if (company?.address) lines.push([company.address]);
  if (company?.phone || company?.email) {
    lines.push([`${company.phone || ''} ${company.email ? '| ' + company.email : ''}`.trim()]);
  }
  lines.push(['']);
  lines.push([reportTitle]);

  if (fromDate && toDate) {
    const fromBS = adToBS(fromDate);
    const toBS   = adToBS(toDate);
    const bsStr  = fromBS && toBS ? `${formatBS(fromBS)} — ${formatBS(toBS)} (B.S)` : '';
    const adStr  = `${formatAD(fromDate)} — ${formatAD(toDate)} (A.D)`;
    lines.push([bsStr || adStr]);
    if (bsStr) lines.push([adStr]);
  }

  lines.push(['']);
  return lines;
}

/**
 * Export any tabular report as CSV with business header prepended.
 */
export function exportReportCSV({ company, reportTitle, filename, headers, rows, fromDate, toDate }) {
  const headerLines = buildTextHeader(company, reportTitle, fromDate, toDate);
  const allRows = [...headerLines, headers, ...rows];
  downloadCSV(filename, [], allRows.map(r => r));
  // Note: downloadCSV expects headers + rows — use a version that just concatenates
  exportRawCSV(filename, allRows);
}

function exportRawCSV(filename, rows) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = rows.map(r => (Array.isArray(r) ? r : [r]).map(escape).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export { exportRawCSV, buildTextHeader };

import { supabase, sajilo } from '@/api/sajiloClient';

/**
 * requestPDFExport - Handles state-driven PDF generation caching and requests
 */
export async function requestPDFExport(reportType, parameters) {
  const companyId = sajilo.getCompanyId();
  // We need userId for logging
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  // Step 1: Ledger State Check - Find MAX(updated_at)
  const { data: ledgerData, error: ledgerError } = await supabase
    .from('GeneralLedgerJournal')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (ledgerError) throw ledgerError;
  const currentLedgerTimestamp = ledgerData?.[0]?.updated_at || new Date().toISOString();

  // Inject engine version to bust older caches
  parameters = { ...parameters, engine_version: 'v12' };

  // Step 2: Cache Validation - Check if exact report was generated with same ledger state
  const { data: cacheData, error: cacheError } = await supabase
    .from('report_archive')
    .select('bucket_url')
    .eq('company_id', companyId)
    .eq('report_type', reportType)
    .eq('ledger_timestamp', currentLedgerTimestamp)
    .contains('parameters', parameters) // Ensure all parameters match
    .limit(1);

  if (!cacheError && cacheData && cacheData.length > 0) {
    // Cache HIT! Get signed URL
    const { data: urlData, error: urlError } = await supabase
      .storage
      .from('erp_documents')
      .createSignedUrl(cacheData[0].bucket_url, 3600);
      
    if (!urlError && urlData?.signedUrl) {
      window.open(urlData.signedUrl, '_blank');
      return;
    }
  }

    const dateStrings = {
      ad: (parameters.fromDate && parameters.toDate) ? `${formatAD(parameters.fromDate)} — ${formatAD(parameters.toDate)} (A.D)` : '',
      bs: (parameters.fromDate && parameters.toDate && adToBS(parameters.fromDate) && adToBS(parameters.toDate)) ? `${formatBS(adToBS(parameters.fromDate))} — ${formatBS(adToBS(parameters.toDate))} (B.S)` : ''
    };

    const isoBoundaries = {
      from: parameters.fromDate ? `${parameters.fromDate}T00:00:00+05:45` : null,
      to: parameters.toDate ? `${parameters.toDate}T23:59:59+05:45` : null,
    };

    const session = await sajilo.auth.supabase.auth.getSession();
    const token = session.data.session?.access_token;

    // Step 3: Cache Miss - Invoke Vercel Serverless Function
    const response = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        reportType,
        parameters,
        companyId,
        userId,
        dateStrings,
        isoBoundaries
      })
    });

  if (!response.ok) {
    if (response.status === 504) {
      throw new Error('504 Gateway Timeout: The report is too large to generate synchronously.');
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Server responded with status ${response.status}`);
  }

  const result = await response.json();
  if (result.success && result.url) {
    window.open(result.url, '_blank');
  } else {
    throw new Error('Failed to generate PDF');
  }
}

/**
 * Trigger browser print (Deprecated)
 */
export function printReport(printAreaId) {
  window.print();
}