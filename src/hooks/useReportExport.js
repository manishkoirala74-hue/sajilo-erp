import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { exportFlatXLSX } from '@/lib/reports/reportExcelExport';
import { generateReportVectorPDF } from '@/utils/reportPdfEngine';
import { format } from 'date-fns';

/**
 * useReportExport — Enterprise hook for standardized multi-channel report exports.
 * 
 * Automatically synchronizes data serialization for:
 * 1. Formatted Excel (.xlsx) with corporate header
 * 2. High-fidelity Vector PDF with company branding
 * 3. Browser Print dialogue
 * 
 * @param {Object} options
 * @param {string} options.title - Report title (e.g. 'Day Book', 'Gross Profit Margin')
 * @param {string} [options.subtitle] - Subtitle / period description
 * @param {string} [options.fromDate] - Filter period start (YYYY-MM-DD)
 * @param {string} [options.toDate] - Filter period end (YYYY-MM-DD)
 * @param {Array<Object>} options.columns - Column specifications [{ key, label, preset, format, exportValue }]
 * @param {Array<Object|Array>} options.data - Data rows (array of objects or 2D array)
 * @param {Array<any>|Object} [options.footer] - Footer totals row or totals object
 * @param {string} [options.filename] - Base filename without extension
 * @param {string} [options.orientation] - 'landscape' | 'portrait' (auto-selected if omitted)
 */
export function useReportExport({
  title = 'Report',
  subtitle,
  fromDate,
  toDate,
  columns = [],
  data = [],
  footer,
  filename,
  orientation,
}) {
  const [isExcelLoading, setIsExcelLoading] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  // Normalize base filename
  const getCleanFilename = useCallback((ext) => {
    const raw = filename || title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const period = fromDate && toDate ? `_${fromDate}_${toDate}` : '';
    return `${raw}${period}.${ext}`;
  }, [filename, title, fromDate, toDate]);

  // Extract tabular 2D array from data
  const serializeRows = useCallback(() => {
    if (!Array.isArray(data) || data.length === 0) return [];

    return data.map((row) => {
      // If row is already an array, return as is
      if (Array.isArray(row)) return row;

      // Map through columns definition
      return columns.map((col) => {
        if (typeof col.exportValue === 'function') {
          return col.exportValue(row);
        }
        const val = row[col.key];
        if (val === null || val === undefined) return '';
        if (typeof val === 'number') return val;
        if (typeof val === 'boolean') return val ? 'Yes' : 'No';
        if (typeof val === 'object') {
          // If object has label/name/title, use that
          return val.name || val.label || val.title || JSON.stringify(val);
        }
        return String(val);
      });
    });
  }, [data, columns]);

  // Extract footer row
  const serializeFooter = useCallback(() => {
    if (!footer) return undefined;
    if (Array.isArray(footer)) return footer;

    // If footer is an object mapping col.key -> total value
    return columns.map((col, idx) => {
      if (idx === 0 && !footer[col.key]) return 'TOTAL';
      const val = footer[col.key];
      return val !== undefined && val !== null ? val : '';
    });
  }, [footer, columns]);

  // 1. Excel Export Handler
  const handleExportExcel = useCallback(async () => {
    if (!data || data.length === 0) {
      toast.info('No data available to export.');
      return;
    }

    setIsExcelLoading(true);
    try {
      const headers = columns.map((c) => c.label || c.key);
      const rows = serializeRows();
      const foot = serializeFooter();

      await exportFlatXLSX({
        filename: getCleanFilename('xlsx'),
        reportTitle: title,
        fromDate,
        toDate,
        headers,
        rows,
        footer: foot,
      });

      toast.success('Spreadsheet (.xlsx) generated successfully');
    } catch (err) {
      console.error('[Excel Export Error]', err);
      toast.error(`Excel export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsExcelLoading(false);
    }
  }, [data, columns, serializeRows, serializeFooter, getCleanFilename, title, fromDate, toDate]);

  // 2. Vector PDF Export Handler
  const handleExportPdf = useCallback(async () => {
    if (!data || data.length === 0) {
      toast.info('No data available to export.');
      return;
    }

    setIsPdfLoading(true);
    try {
      const headers = columns.map((c) => c.label || c.key);
      const rows = serializeRows();
      const foot = serializeFooter();
      const autoOrientation = orientation || (columns.length > 6 ? 'landscape' : 'portrait');

      await generateReportVectorPDF({
        title,
        subtitle,
        fromDate,
        toDate,
        columns: headers,
        data: rows,
        footer: foot,
        orientation: autoOrientation,
        filename: getCleanFilename('pdf'),
      });

      toast.success('Vector PDF generated successfully');
    } catch (err) {
      console.error('[PDF Export Error]', err);
      toast.error(`PDF export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsPdfLoading(false);
    }
  }, [data, columns, serializeRows, serializeFooter, orientation, title, subtitle, fromDate, toDate, getCleanFilename]);

  // 3. Print Module Handler
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return {
    handleExportExcel,
    handleExportPdf,
    handlePrint,
    isExcelLoading,
    isPdfLoading,
  };
}
