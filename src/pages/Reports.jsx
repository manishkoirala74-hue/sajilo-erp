import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  BarChart2, TrendingUp, Users, CreditCard, Receipt,
  FileText, ChevronRight, RefreshCw, History, ShoppingCart, Warehouse, Settings2
} from 'lucide-react';
import UserActivityLog from '@/pages/reports/UserActivityLog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import ReportViewer from '@/components/reports/ReportViewer.jsx';
import ReportSearch from '@/components/reports/ReportSearch';
import { REPORT_CATEGORIES } from '@/config/reportsRegistry';
import { fetchReportData } from '@/lib/reportDataFetcher';
import { format } from 'date-fns';

// ── Report Catalogue ──────────────────────────────────────────────────────────
const CATEGORIES = REPORT_CATEGORIES;

// ── Color Map ─────────────────────────────────────────────────────────────────
const CM = {
  slate:   { bg: 'bg-muted/50',   border: 'border-border',  icon: 'text-muted-foreground',   badge: 'bg-slate-100 dark:bg-slate-500/20 text-muted-foreground',   btn: 'bg-slate-600 hover:bg-slate-700',   dot: 'bg-slate-400'   },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', border: 'border-emerald-200 dark:border-emerald-500/20',icon: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400',btn: 'bg-emerald-600 hover:bg-emerald-700',dot: 'bg-emerald-500' },
  indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-500/10',  border: 'border-indigo-200 dark:border-indigo-500/20', icon: 'text-indigo-600 dark:text-indigo-400',  badge: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400',  btn: 'bg-indigo-600 hover:bg-indigo-700', dot: 'bg-indigo-500'  },
  blue:    { bg: 'bg-blue-50 dark:bg-blue-500/10',    border: 'border-blue-200 dark:border-blue-500/20',   icon: 'text-blue-600 dark:text-blue-400',    badge: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400',      btn: 'bg-blue-600 hover:bg-blue-700',     dot: 'bg-blue-500'    },
  amber:   { bg: 'bg-amber-50 dark:bg-amber-500/10',   border: 'border-amber-200 dark:border-amber-500/20',  icon: 'text-amber-600 dark:text-amber-400',   badge: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400',    btn: 'bg-amber-600 hover:bg-amber-700',   dot: 'bg-amber-500'   },
  purple:  { bg: 'bg-purple-50 dark:bg-purple-500/10',  border: 'border-purple-200 dark:border-purple-500/20', icon: 'text-purple-600 dark:text-purple-400',  badge: 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400',  btn: 'bg-purple-600 hover:bg-purple-700', dot: 'bg-purple-500'  },
  red:     { bg: 'bg-red-50 dark:bg-red-500/10',     border: 'border-red-200 dark:border-red-500/20',    icon: 'text-red-600 dark:text-red-400',     badge: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400',        btn: 'bg-red-600 hover:bg-red-700',       dot: 'bg-red-400'     },
  teal:    { bg: 'bg-teal-50 dark:bg-teal-500/10',    border: 'border-teal-200 dark:border-teal-500/20',   icon: 'text-teal-600 dark:text-teal-400',    badge: 'bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-400',      btn: 'bg-teal-600 hover:bg-teal-700',     dot: 'bg-teal-500'    },
};


// ── Module-level cache for soft-navigation state restoration ──
let cachedActiveCategory = 'accounting';
let cachedViewer = null;

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Reports() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeCategory, setActiveCategory] = useState(cachedActiveCategory);
  const [generating, setGenerating]         = useState(null);
  const [viewer, setViewer]                 = useState(cachedViewer);

  // Auto-open report or switch category from URL query parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const reportId = params.get('report');
    const catParam = params.get('category');
    if (catParam) {
      setActiveCategory(catParam);
      navigate('/reports', { replace: true });
    } else if (reportId) {
      setViewer({ reportId, data: null });
      navigate('/reports', { replace: true });
    }
  }, [location.search, navigate]);

  // Update cache whenever these states change
  useEffect(() => { cachedActiveCategory = activeCategory; }, [activeCategory]);
  useEffect(() => { cachedViewer = viewer; }, [viewer]);
  const fromDate = format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd');
  const toDate   = format(new Date(), 'yyyy-MM-dd');

  const category = CATEGORIES.find(c => c.id === activeCategory);
  const colors   = CM[category?.color || 'slate'];

  const generateReport = async (report) => {
    if (report.isRoute) {
      navigate(report.path);
      return;
    }
    setViewer({ reportId: report.id, data: null });
  };

  return (
    <>
    <div className="space-y-5 print:hidden">
      {/* Page Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Reports</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Generate, filter, and export business reports</p>
        </div>
        <ReportSearch className="w-full sm:w-80 md:w-96" />
      </div>

      <div className="flex flex-col md:flex-row gap-4 md:gap-5">
        {/* Left: Category Nav */}
        <div className="w-full md:w-52 shrink-0 flex flex-row md:flex-col gap-2 md:gap-0 md:space-y-1 overflow-x-auto scrollbar-hide pb-2 md:pb-0 [mask-image:linear-gradient(to_right,black_85%,transparent_100%)] md:[mask-image:none] pr-10 md:pr-0">
          {CATEGORIES.map(cat => {
            const c   = CM[cat.color];
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`shrink-0 whitespace-nowrap w-auto md:w-full flex items-center gap-2 md:gap-3 px-3 py-2 md:py-2.5 rounded-full md:rounded-lg text-sm font-medium transition-all text-left ${
                  isActive
                    ? `${c.bg} ${c.border} border ${c.icon}`
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                <span className="flex-1">{cat.label}</span>
                {cat.placeholder && (
                  <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Soon</span>
                )}
                {isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Right: Report Cards */}
        <div className="flex-1 space-y-3">
          {/* Category Header */}
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${colors.bg} ${colors.border}`}>
            <category.icon className={`w-5 h-5 ${colors.icon}`} />
            <h3 className="font-semibold text-foreground">{category.label}</h3>
            {!category.isCustom && category.reports.length > 0 && (
              <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
                {category.reports.length} reports
              </span>
            )}
          </div>

          {/* Activity Log */}
          {category.isCustom && activeCategory === 'activity_log' && <UserActivityLog />}

          {/* System Report placeholder */}
          {category.isCustom && activeCategory === 'system' && category.reports?.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground text-sm">
              System reports coming soon.
            </div>
          )}

          {/* Report List */}
          {!category.isCustom && category.reports.map(report => (
            <div
              key={report.id}
              className={`bg-card border border-border rounded-xl p-4 flex items-center gap-4 transition-all hover:border-muted-foreground/30 ${category.placeholder ? 'opacity-60' : ''}`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{report.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{report.desc}</p>
              </div>
              <div className="shrink-0">
                {category.placeholder ? (
                  <span className="text-xs bg-muted text-muted-foreground px-3 py-1.5 rounded-lg">Coming Soon</span>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => generateReport(report)}
                    disabled={generating === report.id}
                    className={`text-white text-xs ${colors.btn}`}
                  >
                    {generating === report.id
                      ? <><RefreshCw className="w-3 h-3 animate-spin mr-1" />Generating…</>
                      : <><FileText className="w-3 h-3 mr-1" />Generate</>
                    }
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Report Viewer Modal */}
    {viewer && (
      <ReportViewer
        reportId={viewer.reportId}
        data={viewer.data}
        fromDate={fromDate}
        toDate={toDate}
        onClose={() => setViewer(null)}
      />
    )}
    </>
  );
}