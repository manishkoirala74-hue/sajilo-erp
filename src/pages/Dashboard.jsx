import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { sajilo } from '@/api/sajiloClient';
import {
  TrendingUp, ShoppingCart, Users, FileText, AlertCircle, Clock, ArrowRight,
  Eye, EyeOff, Building
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import VoucherLink from '@/components/shared/VoucherLink';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';

import { 
  useDailyMetricsQuery,
  useRecentDocumentsQuery,
  useDashboardSummaryQuery,
  useRecentSalesQuery,
  usePendingApprovalsQuery
} from '@/hooks/useSajiloQuery';
import { triggerHaptic } from '@/utils/haptics';
import { useAmountFormatter } from '@/hooks/useAmountFormatter';

export default function Dashboard() {
  const { availableCompanies, isLoadingAuth, activeCompany } = useAuth();
  const { formatAmountShort } = useAmountFormatter();
  const activeCompanyId = activeCompany?.id || null;
  
  // --- Date Range Calculation ---
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);
  const fd = new Date();
  fd.setMonth(fd.getMonth() - 5);
  fd.setDate(1);
  const startDate = fd.toISOString().slice(0, 10);

  // --- Independent Queries ---
  const { data: metrics = [], isLoading: isLoadingMetrics } = useDailyMetricsQuery(activeCompanyId, startDate, endDate);
  const { data: recentDocs, isLoading: isLoadingRecentDocs } = useRecentDocumentsQuery();
  const { data: summary, isLoading: isLoadingSummary } = useDashboardSummaryQuery(activeCompanyId, startDate, endDate);
  const { data: recentSales = [], isLoading: isLoadingRecentSales } = useRecentSalesQuery();
  const { data: pendingApprovals = [], isLoading: isLoadingApprovals } = usePendingApprovalsQuery();

  const [amountsVisible, setAmountsVisible] = useState(true);
  const { theme } = useTheme();

  // Aggregate daily metrics into monthly chart data
  const chartData = useMemo(() => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyMap = {};
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap[mKey] = { month: monthNames[d.getMonth()], sortKey: mKey, sales: 0, purchases: 0 };
    }

    metrics.forEach(m => {
      if (m.metric_date) {
        const mKey = m.metric_date.substring(0, 7);
        if (monthlyMap[mKey]) {
          monthlyMap[mKey].sales += (parseFloat(m.total_sales_amount) || 0);
          monthlyMap[mKey].purchases += (parseFloat(m.total_purchases_amount) || 0);
        }
      }
    });

    return Object.values(monthlyMap).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [metrics]);

  const loading = isLoadingAuth || isLoadingSummary || isLoadingMetrics;

  const mask = (val) => amountsVisible ? val : '••••••';

  if (!isLoadingAuth && availableCompanies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[75vh] text-center space-y-5">
        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-2">
          <Building className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-3xl font-bold text-foreground tracking-tight">Welcome to Sajilo ERP!</h2>
        <p className="text-muted-foreground max-w-lg text-lg">
          Before you can start managing your business, creating transactions, or adding users, you need to set up your first company.
        </p>
        <Link to="/settings">
          <Button className="mt-4 shadow-lg hover:shadow-xl transition-shadow" size="lg">
            Create Your First Company <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with hide amounts toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">Dashboard</h2>
        <button
          onClick={() => setAmountsVisible(v => !v)}
          title={amountsVisible ? 'Hide amounts' : 'Show amounts'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-xs font-medium"
        >
          {amountsVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {amountsVisible ? 'Hide Amounts' : 'Show Amounts'}
        </button>
      </div>
      {/* Alerts */}
      {(pendingApprovals.length > 0 || (summary?.low_stock_items || 0) > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendingApprovals.length > 0 && (
            <Link to="/purchase/orders" className="flex items-center gap-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4 hover:bg-amber-100 dark:bg-amber-500/20 transition-colors">
              <div className="p-2 bg-amber-100 dark:bg-amber-500/20 rounded-lg">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm">{pendingApprovals.length} PO{pendingApprovals.length > 1 ? 's' : ''} Awaiting Approval</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">Click to review purchase orders</p>
              </div>
              <ArrowRight className="w-4 h-4 text-amber-500 ml-auto" />
            </Link>
          )}
          {(summary?.low_stock_items || 0) > 0 && (
            <Link to="/inventory/items" className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 hover:bg-red-100 dark:bg-red-500/20 transition-colors">
              <div className="p-2 bg-red-100 dark:bg-red-500/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-red-800 dark:text-red-300 text-sm">{summary?.low_stock_items} Item{(summary?.low_stock_items || 0) > 1 ? 's' : ''} Below Reorder Level</p>
                <p className="text-xs text-red-600 dark:text-red-400">Stock replenishment needed</p>
              </div>
              <ArrowRight className="w-4 h-4 text-red-500 ml-auto" />
            </Link>
          )}
        </div>
      )}

      {/* Mobile Recent Documents */}
      <div className="md:hidden">
        <h3 className="text-sm font-semibold text-foreground mb-3 px-1">Recent Documents</h3>
        <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 scrollbar-hide-default">
          {isLoadingRecentDocs ? (
            // Skeleton loaders
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="snap-start shrink-0 w-[200px] bg-card border border-border rounded-xl p-3 animate-pulse">
                <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                <div className="h-3 bg-muted rounded w-1/2 mb-4" />
                <div className="flex justify-between items-center">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-5 bg-muted rounded-full w-12" />
                </div>
              </div>
            ))
          ) : (
            recentDocs?.map(doc => (
              <Link 
                key={doc.id} 
                to={doc.path} 
                onClick={() => triggerHaptic()}
                className="snap-start shrink-0 w-[200px] bg-card border border-border rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow active:scale-[0.98]"
              >
                <div className="flex justify-between items-start mb-1 gap-2">
                  <span className="font-semibold text-sm text-foreground truncate" title={doc.title}>{doc.title}</span>
                  <StatusBadge status={doc.status} />
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">{doc.type} • {doc.date}</p>
                <div className="font-mono text-sm font-semibold">
                  {mask(formatAmountShort(doc.amount))}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 gap-4 md:grid md:grid-cols-2 lg:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 md:mx-0 md:px-0 scrollbar-none">
        <div className="snap-center shrink-0 w-[85vw] md:w-auto">
          <StatCard
            title="Total Sales Revenue"
            value={mask(formatAmountShort(summary?.total_sales || 0))}
            subtitle="All posted invoices"
            icon={TrendingUp}
            color="indigo"
            trend="up"
            trendValue="+12% this month"
          />
        </div>
        <div className="snap-center shrink-0 w-[85vw] md:w-auto">
          <StatCard
            title="Total Purchases"
            value={mask(formatAmountShort(summary?.total_purchases || 0))}
            subtitle="All posted bills"
            icon={ShoppingCart}
            color="amber"
          />
        </div>
        <div className="snap-center shrink-0 w-[85vw] md:w-auto">
          <StatCard
            title="Unpaid Invoices"
            value={mask(summary?.unpaid_sales_count || 0)}
            subtitle="Accounts receivable"
            icon={FileText}
            color="red"
          />
        </div>
        <div className="snap-center shrink-0 w-[85vw] md:w-auto">
          <StatCard
            title="Active Customers"
            value={summary?.active_customers || 0}
            subtitle="Registered Customers"
            icon={Users}
            color="blue"
          />
        </div>
      </div>

      {/* Charts */}
      <div className="hidden md:grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-4">Revenue vs Purchases</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="purchGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#f0f0f0'} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
              <YAxis tickFormatter={v => `${v / 1000}K`} tick={{ fontSize: 11, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
              <Tooltip 
                formatter={v => formatAmountShort(v)} 
                contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f8fafc' : '#0f172a' }}
              />
              <Area type="monotone" dataKey="sales" stroke="#4F46E5" fill="url(#salesGrad)" strokeWidth={2} name="Sales" />
              <Area type="monotone" dataKey="purchases" stroke="#F59E0B" fill="url(#purchGrad)" strokeWidth={2} name="Purchases" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-4">Monthly Overview</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#f0f0f0'} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
              <YAxis tickFormatter={v => `${v / 1000}K`} tick={{ fontSize: 11, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
              <Tooltip 
                formatter={v => formatAmountShort(v)}
                contentStyle={{ backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', borderColor: theme === 'dark' ? '#334155' : '#e2e8f0', color: theme === 'dark' ? '#f8fafc' : '#0f172a' }}
              />
              <Legend wrapperStyle={{ color: theme === 'dark' ? '#cbd5e1' : '#475569' }} />
              <Bar dataKey="sales" name="Sales" fill="#4F46E5" radius={[4, 4, 0, 0]} />
              <Bar dataKey="purchases" name="Purchases" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales Invoices */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Recent Sales Invoices</h3>
            <Link to="/sales/invoices" className="text-xs text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
            </div>
          ) : recentSales.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No invoices yet</div>
          ) : (
            <div className="divide-y divide-border">
              {recentSales.map(inv => (
                <div key={inv.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {inv.invoice_number ? (
                        <VoucherLink voucherNumber={inv.invoice_number}>
                          <span className="cursor-pointer text-primary">{inv.invoice_number}</span>
                        </VoucherLink>
                      ) : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">{inv.customer_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{mask(formatAmountShort(inv.grand_total || 0))}</p>
                    <StatusBadge status={inv.payment_status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="font-semibold text-foreground mb-4">Inventory Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Total Items</span>
              <span className="font-semibold">{summary?.total_items || 0}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Active Items</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{summary?.active_items || 0}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Low Stock Items</span>
              <span className="font-semibold text-red-600 dark:text-red-400">{summary?.low_stock_items || 0}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Total Customers</span>
              <span className="font-semibold">{summary?.total_customers || 0}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Total Vendors</span>
              <span className="font-semibold">{summary?.total_vendors || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}