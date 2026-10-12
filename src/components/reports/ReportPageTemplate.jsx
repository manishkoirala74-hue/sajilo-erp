import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BusinessHeader from '@/components/reports/BusinessHeader';
import ReportExportActions from '@/components/reports/ReportExportActions';
import { REPORT_TYPOGRAPHY, REPORT_COLORS, REPORT_PRINT_STYLES } from '@/config/reportTheme';
import { useReportExport } from '@/hooks/useReportExport';

/**
 * ReportPageTemplate — The Central Layout Template for all Sajilo ERP Reports.
 * 
 * Enforces standardized:
 * - Headings, typography, and category badge
 * - Business branding header (Company Name, Logo, PAN, dual BS/AD period)
 * - Export toolbar (Excel, Vector PDF, Print, Email)
 * - Standard filter placement and error banners
 * - Print module with automatic page breaks and stylesheet injection
 * 
 * In the future, any updates here instantly reflect in all reports across the ERP.
 */
export default function ReportPageTemplate({
  title,
  subtitle,
  icon: Icon,
  category,
  backPath = '/reports',
  fromDate,
  toDate,
  showBusinessHeader = true,
  isLoading = false,
  error = null,
  onRefresh,
  
  // Export handlers (either pass explicit callbacks OR pass exportConfig)
  onExportExcel,
  onExportPdf,
  onPrint,
  onEmail,
  exportConfig, // { columns, data, footer, filename, orientation }
  
  // Custom slots
  filterSlot,
  metricsSlot,
  extraActions,
  children,
  className = '',
}) {
  const navigate = useNavigate();

  // If exportConfig is provided, auto-wire useReportExport
  const autoExport = useReportExport({
    title,
    subtitle,
    fromDate,
    toDate,
    columns: exportConfig?.columns || [],
    data: exportConfig?.data || [],
    footer: exportConfig?.footer,
    filename: exportConfig?.filename,
    orientation: exportConfig?.orientation,
  });

  const effectiveExportExcel = onExportExcel || (exportConfig ? autoExport.handleExportExcel : undefined);
  const effectiveExportPdf   = onExportPdf   || (exportConfig ? autoExport.handleExportPdf   : undefined);
  const effectivePrint       = onPrint       || (exportConfig ? autoExport.handlePrint       : () => window.print());

  // Inject unified print styles on mount
  useEffect(() => {
    const styleId = 'sajilo-report-print-style';
    if (!document.getElementById(styleId)) {
      const styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.innerHTML = REPORT_PRINT_STYLES;
      document.head.appendChild(styleEl);
    }
  }, []);

  return (
    <div className={`report-page-container flex flex-col gap-5 p-4 sm:p-6 pb-24 max-w-[1440px] mx-auto print:p-0 print:pb-0 ${className}`}>
      
      {/* ── Screen Page Header ────────────────────────────────────────────── */}
      <header className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {backPath && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(backPath)}
              className="rounded-xl shrink-0 hover:bg-muted"
              title="Back to Reports directory"
            >
              <ArrowLeft className="w-5 h-5 text-muted-foreground" />
            </Button>
          )}

          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {Icon && <Icon className="w-6 h-6 text-primary shrink-0" />}
              <h1 className={REPORT_TYPOGRAPHY.pageTitle}>{title}</h1>
              {category && (
                <span className={`${REPORT_TYPOGRAPHY.categoryBadge} bg-primary/10 text-primary border border-primary/20`}>
                  {category}
                </span>
              )}
            </div>
            {subtitle && <p className={REPORT_TYPOGRAPHY.pageSubtitle}>{subtitle}</p>}
          </div>
        </div>

        {/* Global Toolbar: Actions + Exports */}
        <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              className="rounded-lg text-xs font-semibold gap-1.5 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          )}

          {extraActions}

          <ReportExportActions
            onExportExcel={effectiveExportExcel}
            onExportPdf={effectiveExportPdf}
            onEmail={onEmail}
            disabled={isLoading}
          />
        </div>
      </header>

      {/* ── Optional Filter Bar Slot ──────────────────────────────────────── */}
      {filterSlot && (
        <section className="print:hidden">
          {filterSlot}
        </section>
      )}

      {/* ── Optional KPI / Summary Metrics Strip ───────────────────────────── */}
      {metricsSlot && (
        <section className="print:hidden">
          {metricsSlot}
        </section>
      )}

      {/* ── Error Banner ──────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Unable to load report</p>
            <p className="text-xs text-destructive/90 mt-0.5">{error.message || String(error)}</p>
          </div>
        </div>
      )}

      {/* ── Branded Header (Company info, Logo, PAN, B.S./A.D. Period) ─────── */}
      {showBusinessHeader && (
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm print:border-0 print:shadow-none print:p-0">
          <BusinessHeader
            reportTitle={title}
            subtitle={subtitle}
            fromDate={fromDate}
            toDate={toDate}
          />
          
          {/* Main Content Area */}
          <main className="w-full">
            {children}
          </main>
        </div>
      )}

      {!showBusinessHeader && (
        <main className="w-full">
          {children}
        </main>
      )}

    </div>
  );
}
