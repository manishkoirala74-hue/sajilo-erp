/**
 * reportTheme.js
 * Centralized Design System & Style Tokens for all Sajilo ERP Reports.
 * 
 * Defines standard settings for:
 * - Headings & Typography
 * - Font sizes, weights, and colors
 * - Column width presets & alignments
 * - Status & Metric Badges
 * - Print & Media stylesheets
 * 
 * Any update here will automatically propagate across all report pages.
 */

export const REPORT_TYPOGRAPHY = {
  // Page level headers
  pageTitle: 'text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5',
  pageSubtitle: 'text-xs md:text-sm text-muted-foreground mt-0.5 font-normal',
  categoryBadge: 'text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider',
  
  // Table headers & cells
  tableHead: 'text-[11px] font-bold text-foreground/80 uppercase tracking-wider select-none',
  tableSubHead: 'text-[10px] font-semibold text-muted-foreground uppercase tracking-wide',
  tableCell: 'text-xs text-foreground/90 py-2.5 px-3 leading-normal align-middle',
  tableCellMuted: 'text-xs text-muted-foreground py-2.5 px-3 align-middle',
  
  // Monospace amounts & numbers
  amount: 'font-mono text-xs tabular-nums tracking-tight font-medium',
  amountBold: 'font-mono text-xs tabular-nums tracking-tight font-bold',
  amountPositive: 'font-mono text-xs tabular-nums tracking-tight font-semibold text-emerald-600 dark:text-emerald-400',
  amountNegative: 'font-mono text-xs tabular-nums tracking-tight font-semibold text-red-600 dark:text-red-400',
  amountZero: 'font-mono text-xs tabular-nums tracking-tight text-muted-foreground/60',

  // Table summary/footer
  tableFooter: 'bg-muted/70 text-foreground font-bold text-xs border-t-2 border-border shadow-sm',
  tableFooterCell: 'py-2.5 px-3 font-mono tabular-nums text-xs font-bold',
};

export const REPORT_COLORS = {
  headerBg: 'bg-muted/50 dark:bg-muted/20',
  headerBorder: 'border-b-2 border-border',
  rowHover: 'hover:bg-muted/30 transition-colors',
  rowZebra: 'even:bg-muted/10',
  cardBg: 'bg-card',
  cardBorder: 'border border-border rounded-xl shadow-sm',
  divider: 'border-border/60',
};

/**
 * Standard Column Presets
 * Each preset specifies fixed/min width, text alignment, and typography behavior.
 */
export const COLUMN_PRESETS = {
  code: {
    width: '110px',
    minWidth: '100px',
    align: 'left',
    className: 'font-mono text-xs font-semibold text-foreground/80',
    headerAlign: 'text-left',
  },
  date: {
    width: '115px',
    minWidth: '110px',
    align: 'center',
    className: 'text-xs text-center tabular-nums',
    headerAlign: 'text-center',
  },
  voucher: {
    width: '130px',
    minWidth: '120px',
    align: 'center',
    className: 'font-mono text-xs font-medium text-center',
    headerAlign: 'text-center',
  },
  description: {
    width: 'auto',
    minWidth: '220px',
    align: 'left',
    className: 'text-xs font-medium text-foreground',
    headerAlign: 'text-left',
  },
  category: {
    width: '140px',
    minWidth: '120px',
    align: 'left',
    className: 'text-xs text-muted-foreground',
    headerAlign: 'text-left',
  },
  amount: {
    width: '135px',
    minWidth: '120px',
    align: 'right',
    className: REPORT_TYPOGRAPHY.amount,
    headerAlign: 'text-right',
    isNumeric: true,
  },
  quantity: {
    width: '100px',
    minWidth: '90px',
    align: 'right',
    className: 'font-mono text-xs tabular-nums text-right',
    headerAlign: 'text-right',
    isNumeric: true,
  },
  percentage: {
    width: '95px',
    minWidth: '85px',
    align: 'right',
    className: 'font-mono text-xs tabular-nums font-semibold text-right',
    headerAlign: 'text-right',
    isNumeric: true,
  },
  status: {
    width: '110px',
    minWidth: '95px',
    align: 'center',
    className: 'text-xs text-center',
    headerAlign: 'text-center',
  },
  actions: {
    width: '70px',
    minWidth: '60px',
    align: 'right',
    className: 'text-right print:hidden',
    headerAlign: 'text-right print:hidden',
  },
};

/**
 * Global Report Print Stylesheet
 * Injected automatically by ReportPageTemplate.
 */
export const REPORT_PRINT_STYLES = `
@media print {
  @page {
    size: A4 landscape;
    margin: 8mm 10mm;
  }

  body {
    background: #ffffff !important;
    color: #0f172a !important;
    font-size: 8.5pt !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  }

  /* Unconstrain all scrolling wrappers for multi-page paper output */
  .report-page-container,
  .table-scroll-container,
  .overflow-x-auto,
  .overflow-y-auto {
    overflow: visible !important;
    height: auto !important;
    max-height: none !important;
    display: block !important;
  }

  /* Repeat table headers on every physical printed page */
  thead {
    display: table-header-group !important;
  }

  /* Anchor table footer at the bottom */
  tfoot {
    display: table-footer-group !important;
  }

  /* Prevent row slicing */
  tr {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }

  /* Force print color fidelity */
  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .print-hidden,
  .print\\:hidden {
    display: none !important;
  }

  .print-only,
  .print\\:block {
    display: block !important;
  }
}
`;
