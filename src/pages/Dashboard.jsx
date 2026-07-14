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
  useItemsQuery, 
  useCustomersQuery, 
  useVendorsQuery, 
  useDailyMetricsQuery 
} from '@/hooks/useSajiloQuery';



function formatNPR(val) {
  if (val >= 1000000) return `NPR ${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `NPR ${(val / 1000).toFixed(0)}K`;
  return `NPR ${val}`;
}

export default function Dashboard() {
  const { availableCompanies, isLoadingAuth, activeCompany } = useAuth();
  
  // ── SWR Queries ──
  const { data: items = [] } = useItemsQuery();
  const { data: customers = [] } = useCustomersQuery();
  const { data: vendors = [] } = useVendorsQuery();
  const { data: metrics = [], isLoading: isLoadingMetrics } = useDailyMetricsQuery();
  
  const [recentSales, setRecentSales] = useState([]);
  const [unpaidSalesCount, setUnpaidSalesCount] = useState(0);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  
  const [amountsVisible, setAmountsVisible] = useState(true);
  const { theme } = useTheme();
  const activeCompanyId = activeCompany?.id || null;

  useEffect(() => {
    if (!activeCompanyId) return;

    // Fetch optimized subsets of data
    Promise.all([
      sajilo.entities.SalesInvoice.filter({ status: 'Posted' }, '-created_date', 5).catch(e => []),
      sajilo.entities.SalesInvoice.filter({ payment_status: 'Unpaid', status: 'Posted' }, '-created_date').catch(e => []),
      sajilo.entities.PurchaseOrder.filter({ status: 'Pending Approval' }).catch(e => []),
    ]).then(([rs, us, pa]) => {
      setRecentSales(rs || []);
      setUnpaidSalesCount((us || []).length);
      setPendingApprovals(pa || []);
    });
  }, [activeCompanyId]);

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

  const totalSales = metrics.reduce((s, m) => s + (parseFloat(m.total_sales_amount) || 0), 0);
  const totalPurchases = metrics.reduce((s, m) => s + (parseFloat(m.total_purchases_amount) || 0), 0); 
  
  const lowStockItems = items.filter(i => i.quantity_on_hand <= i.reorder_level && i.reorder_level > 0);

  const loading = isLoadingAuth || isLoadingMetrics;

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
      {(pendingApprovals.length > 0 || lowStockItems.length > 0) && (
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
          {lowStockItems.length > 0 && (
            <Link to="/inventory/items" className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-4 hover:bg-red-100 dark:bg-red-500/20 transition-colors">
              <div className="p-2 bg-red-100 dark:bg-red-500/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="font-semibold text-red-800 dark:text-red-300 text-sm">{lowStockItems.length} Item{lowStockItems.length > 1 ? 's' : ''} Below Reorder Level</p>
                <p className="text-xs text-red-600 dark:text-red-400">Stock replenishment needed</p>
              </div>
              <ArrowRight className="w-4 h-4 text-red-500 ml-auto" />
            </Link>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="flex overflow-x-auto snap-x snap-mandatory pb-4 -mx-4 px-4 gap-4 md:grid md:grid-cols-2 lg:grid-cols-4 md:gap-4 md:overflow-visible md:pb-0 md:mx-0 md:px-0 scrollbar-none">
        <div className="snap-center shrink-0 w-[85vw] md:w-auto">
          <StatCard
            title="Total Sales Revenue"
            value={mask(formatNPR(totalSales))}
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
            value={mask(formatNPR(totalPurchases))}
            subtitle="All posted bills"
            icon={ShoppingCart}
            color="amber"
          />
        </div>
        <div className="snap-center shrink-0 w-[85vw] md:w-auto">
          <StatCard
            title="Unpaid Invoices"
            value={mask(unpaidSalesCount)}
            subtitle="Accounts receivable"
            icon={FileText}
            color="red"
          />
        </div>
        <div className="snap-center shrink-0 w-[85vw] md:w-auto">
          <StatCard
            title="Active Customers"
            value={customers.filter(c => c.is_active !== false).length}
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
                formatter={v => formatNPR(v)} 
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
                formatter={v => formatNPR(v)}
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
                    <p className="text-sm font-semibold">{mask(formatNPR(inv.grand_total || 0))}</p>
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
              <span className="font-semibold">{items.length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Active Items</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{items.filter(i => i.is_active !== false).length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Low Stock Items</span>
              <span className="font-semibold text-red-600 dark:text-red-400">{lowStockItems.length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Total Customers</span>
              <span className="font-semibold">{customers.length}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Total Vendors</span>
              <span className="font-semibold">{vendors.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}