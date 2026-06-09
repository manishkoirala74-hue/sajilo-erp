import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { sajilo } from '@/api/sajiloClient';
import {
  TrendingUp, ShoppingCart, Package, Users, FileText,
  Receipt, AlertCircle, CheckCircle2, Clock, ArrowRight,
  Eye, EyeOff, Building
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';

const monthlyData = [
  { month: 'Jan', sales: 420000, purchases: 310000 },
  { month: 'Feb', sales: 380000, purchases: 290000 },
  { month: 'Mar', sales: 510000, purchases: 405000 },
  { month: 'Apr', sales: 470000, purchases: 350000 },
  { month: 'May', sales: 620000, purchases: 430000 },
  { month: 'Jun', sales: 580000, purchases: 460000 },
];

function formatNPR(val) {
  if (val >= 1000000) return `NPR ${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `NPR ${(val / 1000).toFixed(0)}K`;
  return `NPR ${val}`;
}

export default function Dashboard() {
  const { availableCompanies, isLoadingAuth } = useAuth();
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState([]);
  const [items, setItems] = useState([]);
  const [partners, setPartners] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [amountsVisible, setAmountsVisible] = useState(true);

  useEffect(() => {
    Promise.all([
      sajilo.entities.SalesInvoice.list('-created_date', 20),
      sajilo.entities.PurchaseInvoice.list('-created_date', 20),
      sajilo.entities.Item.list('-created_date', 50),
      sajilo.entities.BusinessPartner.list('-created_date', 50),
      sajilo.entities.PurchaseOrder.list('-created_date', 20),
    ]).then(([si, pi, it, bp, po]) => {
      setSalesInvoices(si);
      setPurchaseInvoices(pi);
      setItems(it);
      setPartners(bp);
      setPurchaseOrders(po);
      setLoading(false);
    });
  }, []);

  const totalSales = salesInvoices.reduce((s, inv) => s + (inv.grand_total || 0), 0);
  const totalPurchases = purchaseInvoices.reduce((s, inv) => s + (inv.grand_total || 0), 0);
  const unpaidSales = salesInvoices.filter(i => i.payment_status === 'Unpaid').length;
  const lowStockItems = items.filter(i => i.quantity_on_hand <= i.reorder_level && i.reorder_level > 0);
  const pendingApprovals = purchaseOrders.filter(po => po.status === 'Pending Approval');
  const recentSales = salesInvoices.slice(0, 5);

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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-xs font-medium"
        >
          {amountsVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          {amountsVisible ? 'Hide Amounts' : 'Show Amounts'}
        </button>
      </div>
      {/* Alerts */}
      {(pendingApprovals.length > 0 || lowStockItems.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendingApprovals.length > 0 && (
            <Link to="/purchase/orders" className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 hover:bg-amber-100 transition-colors">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="font-semibold text-amber-800 text-sm">{pendingApprovals.length} PO{pendingApprovals.length > 1 ? 's' : ''} Awaiting Approval</p>
                <p className="text-xs text-amber-600">Click to review purchase orders</p>
              </div>
              <ArrowRight className="w-4 h-4 text-amber-500 ml-auto" />
            </Link>
          )}
          {lowStockItems.length > 0 && (
            <Link to="/inventory/items" className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4 hover:bg-red-100 transition-colors">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-red-800 text-sm">{lowStockItems.length} Item{lowStockItems.length > 1 ? 's' : ''} Below Reorder Level</p>
                <p className="text-xs text-red-600">Stock replenishment needed</p>
              </div>
              <ArrowRight className="w-4 h-4 text-red-500 ml-auto" />
            </Link>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Sales Revenue"
          value={mask(formatNPR(totalSales))}
          subtitle="All posted invoices"
          icon={TrendingUp}
          color="indigo"
          trend="up"
          trendValue="+12% this month"
        />
        <StatCard
          title="Total Purchases"
          value={mask(formatNPR(totalPurchases))}
          subtitle="All posted bills"
          icon={ShoppingCart}
          color="amber"
        />
        <StatCard
          title="Unpaid Invoices"
          value={mask(unpaidSales)}
          subtitle="Accounts receivable"
          icon={FileText}
          color="red"
        />
        <StatCard
          title="Active Partners"
          value={partners.filter(p => p.is_active !== false).length}
          subtitle="Customers & vendors"
          icon={Users}
          color="blue"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-4">Revenue vs Purchases</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyData}>
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
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `${v / 1000}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => formatNPR(v)} />
              <Area type="monotone" dataKey="sales" stroke="#4F46E5" fill="url(#salesGrad)" strokeWidth={2} name="Sales" />
              <Area type="monotone" dataKey="purchases" stroke="#F59E0B" fill="url(#purchGrad)" strokeWidth={2} name="Purchases" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-4">Monthly Overview</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `${v / 1000}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => formatNPR(v)} />
              <Legend />
              <Bar dataKey="sales" name="Sales" fill="#4F46E5" radius={[4, 4, 0, 0]} />
              <Bar dataKey="purchases" name="Purchases" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales Invoices */}
        <div className="bg-white rounded-xl border border-border overflow-hidden">
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
                    <p className="text-sm font-medium text-foreground">{inv.invoice_number || '—'}</p>
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
        <div className="bg-white rounded-xl border border-border p-4">
          <h3 className="font-semibold text-foreground mb-4">Inventory Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Total Items</span>
              <span className="font-semibold">{items.length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Active Items</span>
              <span className="font-semibold text-emerald-600">{items.filter(i => i.is_active !== false).length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Low Stock Items</span>
              <span className="font-semibold text-red-600">{lowStockItems.length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Total Customers</span>
              <span className="font-semibold">{partners.filter(p => p.is_customer).length}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Total Vendors</span>
              <span className="font-semibold">{partners.filter(p => p.is_vendor).length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}