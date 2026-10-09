import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, FileSpreadsheet, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';

/**
 * ReportExportActions
 * Standardized, asynchronous export toolbar for all Sajilo ERP reports.
 * Manages async promise execution, prevents duplicate clicks, and renders loading spinners.
 *
 * @param {Object} props
 * @param {Function} [props.onExportExcel] - Async function returning Promise that downloads XLSX
 * @param {Function} [props.onExportPdf]   - Async function returning Promise that triggers Vector PDF or Print
 * @param {Function} [props.onEmail]       - Optional async function for emailing report
 * @param {boolean}  [props.disabled]      - Global disable flag (e.g. while report data is loading)
 * @param {string}   [props.className]     - Additional Tailwind classes
 * @param {string}   [props.pdfLabel]      - Label for PDF action (default: "Print / PDF")
 * @param {string}   [props.excelLabel]    - Label for Excel action (default: "Export Excel (.xlsx)")
 */
export default function ReportExportActions({
  onExportExcel,
  onExportPdf,
  onEmail,
  disabled = false,
  className = '',
  pdfLabel = 'Print / PDF',
  excelLabel = 'Export Excel (.xlsx)'
}) {
  const [isExcelLoading, setIsExcelLoading] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  const handleExcel = async () => {
    if (!onExportExcel || isExcelLoading) return;
    setIsExcelLoading(true);
    try {
      await onExportExcel();
      toast.success('Spreadsheet exported successfully');
    } catch (err) {
      console.error('[Export Excel Error]', err);
      toast.error('Excel export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsExcelLoading(false);
    }
  };

  const handlePdf = async () => {
    if (!onExportPdf || isPdfLoading) return;
    setIsPdfLoading(true);
    try {
      await onExportPdf();
      toast.success('Document prepared successfully');
    } catch (err) {
      console.error('[Export PDF Error]', err);
      toast.error('PDF export failed: ' + (err.message || 'Unknown error'));
    } finally {
      setIsPdfLoading(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 print:hidden ${className}`}>
      {onExportPdf && (
        <Button
          variant="outline"
          size="sm"
          onClick={handlePdf}
          disabled={disabled || isPdfLoading || isExcelLoading}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-500/10 hover:bg-slate-100 dark:bg-slate-500/20 text-slate-800 dark:text-slate-300 transition-colors shadow-sm"
        >
          {isPdfLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Printer className="w-3.5 h-3.5" />
          )}
          {isPdfLoading ? 'Generating…' : pdfLabel}
        </Button>
      )}

      {onEmail && (
        <Button
          variant="outline"
          size="sm"
          onClick={onEmail}
          disabled={disabled || isPdfLoading || isExcelLoading}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border-blue-300 dark:border-blue-500/30 rounded-lg bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 transition-colors shadow-sm"
        >
          <Mail className="w-3.5 h-3.5" />
          Email Report
        </Button>
      )}

      {onExportExcel && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleExcel}
          disabled={disabled || isExcelLoading || isPdfLoading}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border-emerald-300 dark:border-emerald-600 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 transition-colors shadow-sm"
        >
          {isExcelLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
          {isExcelLoading ? 'Exporting…' : excelLabel}
        </Button>
      )}
    </div>
  );
}
