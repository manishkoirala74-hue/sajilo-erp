import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart2, TrendingUp, Users, CreditCard, Receipt,
  FileText, ChevronRight, RefreshCw, History, ShoppingCart, Warehouse, Settings2
} from 'lucide-react';
import UserActivityLog from '@/pages/reports/UserActivityLog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import ReportViewer from '@/components/reports/ReportViewer.jsx';
import { fetchReportData } from '@/lib/reportDataFetcher';
import { format } from 'date-fns';

// ── Report Catalogue ──────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    id: 'accounting', label: 'Accounting', icon: BarChart2, color: 'purple',
    reports: [
      { id: 'trial_balance',   label: 'Trial Balance',             desc: 'All ledger accounts with debit and credit balances' },
      { id: 'profit_loss',     label: 'Income Statement',          desc: 'Revenue vs expenses for a given period' },
      { id: 'balance_sheet',   label: 'Balance Sheet',             desc: 'Assets, liabilities, and equity as of a date' },
      { id: 'cash_flow',       label: 'Cash Flow Summary',         desc: 'Cash inflows and outflows (IAS 7 compliant)' },
      { id: 'ledger_detail',   label: 'Detail General Ledger',     desc: 'All transactions for a specific account' },
      { id: 'gl_summary',      label: 'General Ledger Summary',    desc: 'Summarized balances for all GL accounts' },
      { id: 'journal_report',  label: 'Journal Report',            desc: 'All journal entries in the period' },
      { id: 'txn_list',        label: 'Transaction List',          desc: 'All financial transactions by date' },
    ]
  },
  {
    id: 'receivable', label: 'Receivable', icon: Users, color: 'blue',
    reports: [
      { id: 'ar_aging',           label: 'Invoice Age',                    desc: 'Outstanding invoices by overdue period' },
      { id: 'debtor_statement',   label: 'Customer Statement',             desc: 'Full transaction history per customer' },
      { id: 'ar_aging_summary',   label: 'Customer Ageing Summary',        desc: 'AR aging grouped by customer' },
      { id: 'customer_balance',   label: 'Customer Receivable Summary',    desc: 'Total receivables per customer' },
      { id: 'employee_receivable',label: 'Employee Receivable Balance',    desc: 'Outstanding advances and receivables due from employees', isRoute: true, path: '/reports/employee-receivables' },
    ]
  },
  {
    id: 'payable', label: 'Payable', icon: CreditCard, color: 'amber',
    reports: [
      { id: 'ap_aging',           label: 'Purchase Bill Age',              desc: 'Outstanding bills by overdue period' },
      { id: 'vendor_statement',   label: 'Supplier Statement',             desc: 'Full transaction history per supplier' },
      { id: 'ap_aging_summary',   label: 'Supplier Ageing Summary',        desc: 'AP aging grouped by supplier' },
      { id: 'vendor_balance',     label: 'Supplier Payable Summary',       desc: 'Total payables per supplier' },
      { id: 'employee_payable',   label: 'Employee Payable Balance',       desc: 'Unliquidated net wages owed to employees', isRoute: true, path: '/reports/employee-payables' },
    ]
  },
  {
    id: 'sales', label: 'Sales Report', icon: TrendingUp, color: 'indigo',
    reports: [
      { id: 'sales_summary',          label: 'Sales Summary',                  desc: 'Total sales revenue by date range' },
      { id: 'sales_by_customer',       label: 'Sales By Customer',              desc: 'Revenue breakdown per customer' },
      { id: 'sales_by_item',           label: 'Sales By Item',                  desc: 'Which products are selling the most' },
      { id: 'sales_by_customer_monthly', label: 'Sales By Customer Monthly',    desc: 'Monthly breakdown per customer' },
      { id: 'sales_by_item_monthly',   label: 'Sales By Item Monthly',          desc: 'Monthly breakdown per item' },
      { id: 'sales_return_report',     label: 'Sales Master Report',            desc: 'All sales invoices and POS in the period' },
    ]
  },
  {
    id: 'purchase', label: 'Purchase Report', icon: ShoppingCart, color: 'emerald',
    reports: [
      { id: 'purchase_summary',     label: 'Purchase Summary',        desc: 'Total purchases by date range' },
      { id: 'purchase_by_vendor',   label: 'Purchase By Supplier',    desc: 'Spend breakdown per supplier' },
      { id: 'purchase_by_item',     label: 'Purchase By Item',        desc: 'Quantity and cost per item purchased' },
      { id: 'unpaid_bills',         label: 'Unpaid Purchase Invoices',desc: 'All bills with pending payment' },
    ]
  },
  {
    id: 'tax', label: 'Tax Report', icon: Receipt, color: 'red',
    reports: [
      { id: 'vat_summary',    label: 'VAT Summary Report',      desc: 'VAT collected on sales and paid on purchases' },
      { id: 'vat_sales',      label: 'Sales VAT Register',      desc: 'VAT-applicable sales with tax breakdown' },
      { id: 'vat_purchases',  label: 'Purchase VAT Register',   desc: 'VAT-applicable purchases with tax breakdown' },
      { id: 'tds_report',     label: 'TDS Deduction Report',    desc: 'Tax Deducted at Source from payroll' },
    ]
  },
  {
    id: 'inventory', label: 'Inventory Report', icon: Warehouse, color: 'teal',
    reports: [
      { id: 'stock_summary',     label: 'Stock Summary',          desc: 'Current stock levels and total value' },
      { id: 'low_stock',         label: 'Low Stock / Reorder',    desc: 'Items below reorder level' },
      { id: 'stock_movement',    label: 'Stock Movement',         desc: 'All stock changes in the period' },
      { id: 'item_valuation',    label: 'Item Valuation',         desc: 'Inventory value at cost' },
      { id: 'category_summary',  label: 'Category-wise Summary',  desc: 'Stock grouped by category' },
    ]
  },
  {
    id: 'system', label: 'System Report', icon: Settings2, color: 'slate',
    reports: [
      { id: 'communication_logs', label: 'Communication Logs', desc: 'Audit trail of Email and WhatsApp deliveries', isRoute: true, path: '/reports/communication-logs' }
    ]
  },
  {
    id: 'activity_log', label: 'Activity Log', icon: History, color: 'slate',
    reports: [], isCustom: true,
  },
];

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
  const [activeCategory, setActiveCategory] = useState(cachedActiveCategory);
  const [generating, setGenerating]         = useState(null);
  const [viewer, setViewer]                 = useState(cachedViewer);

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
    setGenerating(report.id);
    try {
      const data = await fetchReportData(report.id, fromDate, toDate);
      setViewer({ reportId: report.id, data });
    } catch (e) {
      toast.error('Failed to generate report. Please try again.');
    }
    setGenerating(null);
  };

  return (
    <>
    <div className="space-y-5">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-bold text-foreground">Reports</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Generate, filter, and export business reports</p>
      </div>

      <div className="flex gap-5">
        {/* Left: Category Nav */}
        <div className="w-52 shrink-0 space-y-1">
          {CATEGORIES.map(cat => {
            const c   = CM[cat.color];
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
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