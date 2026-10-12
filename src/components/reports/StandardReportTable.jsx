import React, { useMemo } from 'react';
import { COLUMN_PRESETS, REPORT_TYPOGRAPHY, REPORT_COLORS } from '@/config/reportTheme';
import { useAmountFormatter } from '@/hooks/useAmountFormatter';

/**
 * StandardReportTable — Universal Table Component for all Sajilo ERP Reports.
 * 
 * Enforces standardized:
 * - Column widths, minimum widths, and text alignments via presets
 * - Monospace, tabular numerals for currency, percentages, and quantities
 * - Sticky table header with dark mode support
 * - Anchored grand totals footer row
 * - Proper print pagination (break-inside-avoid, repeating thead)
 * - Animated skeleton loader and empty state
 */
export default function StandardReportTable({
  columns = [],
  data = [],
  loading = false,
  loadingRows = 8,
  emptyMessage = 'No records found for the selected period or criteria.',
  footer,
  footerLabel = 'TOTAL',
  rowKey = 'id',
  onRowClick,
  className = '',
}) {
  const { formatNumber } = useAmountFormatter();

  // Helper to format currency / amounts consistently
  const formatAmount = (val) => {
    const num = Number(val || 0);
    if (num === 0) return '—';
    const formatted = formatNumber ? formatNumber(Math.abs(num)) : Math.abs(num).toLocaleString(undefined, { minimumFractionDigits: 2 });
    return num < 0 ? `(${formatted})` : formatted;
  };

  // Resolve column definitions merged with presets
  const resolvedColumns = useMemo(() => {
    return columns.map((col) => {
      // Auto-infer preset if not explicitly specified
      let inferredPreset = col.preset;
      if (!inferredPreset) {
        const k = String(col.key || '').toLowerCase();
        if (k.includes('amount') || k.includes('balance') || k.includes('cogs') || k.includes('revenue') || k.includes('profit') || k.includes('debit') || k.includes('credit') || k.includes('price')) {
          inferredPreset = 'amount';
        } else if (k.includes('date')) {
          inferredPreset = 'date';
        } else if (k.includes('voucher')) {
          inferredPreset = 'voucher';
        } else if (k.includes('code') || k.includes('sku')) {
          inferredPreset = 'code';
        } else if (k.includes('qty') || k.includes('quantity')) {
          inferredPreset = 'quantity';
        } else if (k.includes('margin') || k.includes('percent') || k.includes('ratio')) {
          inferredPreset = 'percentage';
        } else if (k.includes('status')) {
          inferredPreset = 'status';
        } else {
          inferredPreset = 'description';
        }
      }

      const preset = COLUMN_PRESETS[inferredPreset] || COLUMN_PRESETS.description;

      return {
        ...preset,
        ...col,
        width: col.width || preset.width,
        minWidth: col.minWidth || preset.minWidth,
        align: col.align || preset.align,
        className: col.className || preset.className,
        headerAlign: col.headerAlign || preset.headerAlign,
        isNumeric: col.isNumeric !== undefined ? col.isNumeric : preset.isNumeric,
      };
    });
  }, [columns]);

  // Resolve footer cells
  const footerCells = useMemo(() => {
    if (!footer) return null;
    if (Array.isArray(footer)) return footer;

    return resolvedColumns.map((col, idx) => {
      if (idx === 0 && footer[col.key] === undefined) return footerLabel;
      const val = footer[col.key];
      if (val === undefined || val === null) return '';
      if (col.isNumeric && typeof val === 'number') {
        return formatAmount(val);
      }
      return String(val);
    });
  }, [footer, resolvedColumns, footerLabel]);

  return (
    <div className={`w-full overflow-hidden border border-border rounded-xl shadow-sm bg-card print:border-0 print:shadow-none print:rounded-none ${className}`}>
      <div className="table-scroll-container overflow-x-auto" role="region" aria-label="Report table" tabIndex={0}>
        <table className="w-full text-left border-collapse table-fluid-grid print:text-[8.5pt]">
          {/* Column widths */}
          <colgroup>
            {resolvedColumns.map((col, i) => (
              <col
                key={col.key || i}
                style={{
                  width: col.width !== 'auto' ? col.width : undefined,
                  minWidth: col.minWidth,
                }}
              />
            ))}
          </colgroup>

          {/* Sticky Table Header */}
          <thead className={`sticky top-0 z-10 ${REPORT_COLORS.headerBg} ${REPORT_COLORS.headerBorder} backdrop-blur-sm print:static print:bg-slate-100`}>
            <tr>
              {resolvedColumns.map((col, i) => {
                const isStickyLeft = col.sticky || (i === 0 && col.stickyFirst);
                return (
                  <th
                    key={col.key || i}
                    scope="col"
                    className={`px-3 py-2.5 ${REPORT_TYPOGRAPHY.tableHead} ${col.headerAlign} ${
                      isStickyLeft ? 'sticky left-0 bg-muted/90 z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]' : ''
                    }`}
                  >
                    {col.label}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-border/60">
            {loading ? (
              // Loading Skeleton
              Array.from({ length: loadingRows }).map((_, rIdx) => (
                <tr key={`skel-${rIdx}`} className="animate-pulse">
                  {resolvedColumns.map((col, cIdx) => (
                    <td key={`skel-${rIdx}-${cIdx}`} className="px-3 py-3">
                      <div
                        className={`h-4 bg-muted rounded ${
                          col.isNumeric ? 'ml-auto w-16' : col.align === 'center' ? 'mx-auto w-16' : 'w-28'
                        }`}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              // Empty State
              <tr>
                <td
                  colSpan={resolvedColumns.length}
                  className="px-6 py-12 text-center text-muted-foreground text-sm"
                >
                  <p className="font-medium">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              // Rows
              data.map((row, rIdx) => {
                const rowId = typeof rowKey === 'function' ? rowKey(row, rIdx) : (row[rowKey] || rIdx);
                return (
                  <tr
                    key={rowId}
                    onClick={() => onRowClick && onRowClick(row, rIdx)}
                    className={`${REPORT_COLORS.rowHover} ${REPORT_COLORS.rowZebra} print:break-inside-avoid print:hover:bg-transparent ${
                      onRowClick ? 'cursor-pointer' : ''
                    }`}
                  >
                    {resolvedColumns.map((col, cIdx) => {
                      const rawVal = row[col.key];
                      const isStickyLeft = col.sticky || (cIdx === 0 && col.stickyFirst);

                      // Render logic
                      let renderedContent;
                      if (typeof col.render === 'function') {
                        renderedContent = col.render(rawVal, row, rIdx);
                      } else if (col.isNumeric && typeof rawVal === 'number') {
                        const isNegative = rawVal < 0;
                        const numCls = isNegative
                          ? REPORT_TYPOGRAPHY.amountNegative
                          : rawVal === 0
                          ? REPORT_TYPOGRAPHY.amountZero
                          : REPORT_TYPOGRAPHY.amount;
                        renderedContent = <span className={numCls}>{formatAmount(rawVal)}</span>;
                      } else {
                        renderedContent = rawVal ?? '—';
                      }

                      return (
                        <td
                          key={col.key || cIdx}
                          className={`px-3 py-2.5 text-xs ${col.className} ${
                            col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                          } ${isStickyLeft ? 'sticky left-0 bg-card z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]' : ''}`}
                        >
                          {renderedContent}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Grand Totals Footer */}
          {footerCells && (
            <tfoot className={`${REPORT_TYPOGRAPHY.tableFooter} print:bg-slate-200 print:text-black`}>
              <tr>
                {footerCells.map((cellContent, idx) => {
                  const col = resolvedColumns[idx];
                  const isStickyLeft = col?.sticky || (idx === 0 && col?.stickyFirst);
                  return (
                    <td
                      key={idx}
                      className={`px-3 py-2.5 ${REPORT_TYPOGRAPHY.tableFooterCell} ${
                        col?.align === 'right' ? 'text-right' : col?.align === 'center' ? 'text-center' : 'text-left'
                      } ${isStickyLeft ? 'sticky left-0 bg-muted z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]' : ''}`}
                    >
                      {cellContent}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Record Counter Footer */}
      {!loading && data.length > 0 && (
        <div className="px-4 py-2 border-t border-border/80 text-[11px] text-muted-foreground flex items-center justify-between print:hidden">
          <span>Showing {data.length} record(s)</span>
          <span className="font-mono text-[10px] opacity-70">Sajilo Enterprise Engine</span>
        </div>
      )}
    </div>
  );
}
