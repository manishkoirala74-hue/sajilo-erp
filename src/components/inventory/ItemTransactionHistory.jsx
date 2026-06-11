import { useState, useEffect } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { useDateFormat } from '@/lib/DateFormatContext';
import { ArrowUpCircle, ArrowDownCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const fmt = (n) => `NPR ${Number(n || 0).toLocaleString()}`;

export default function ItemTransactionHistory({ item }) {
  const { formatDate } = useDateFormat();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    if (!item?.id) return;
    fetchHistory();
  }, [item?.id]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      // Fetch purchase invoices, sales invoices, and stock adjustments in parallel
      const [purchaseInvoices, salesInvoices, stockAdj] = await Promise.all([
        sajilo.entities.PurchaseInvoice.list('-created_date', 200),
        sajilo.entities.SalesInvoice.list('-created_date', 200),
        sajilo.entities.StockAdjustment.list('-created_date', 200),
      ]);

      const txns = [];

      // Extract lines from purchase invoices that match this item
      purchaseInvoices.filter(inv => inv.status === 'Posted').forEach(inv => {
        (inv.line_items || []).forEach(line => {
          if (line.item_id === item.id || line.item_name === item.item_name) {
            txns.push({
              id: `pi-${inv.id}-${line.item_id}`,
              date: inv.invoice_date,
              type: 'Purchase',
              direction: 'in',
              document: inv.invoice_number || 'Purchase Invoice',
              partner: inv.vendor_name,
              quantity: line.quantity,
              unit_price: line.unit_price,
              line_total: line.line_total,
              status: inv.status,
            });
          }
        });
      });

      // Extract lines from sales invoices that match this item
      salesInvoices.filter(inv => inv.status === 'Posted').forEach(inv => {
        (inv.line_items || []).forEach(line => {
          if (line.item_id === item.id || line.item_name === item.item_name) {
            txns.push({
              id: `si-${inv.id}-${line.item_id}`,
              date: inv.invoice_date,
              type: 'Sale',
              direction: 'out',
              document: inv.invoice_number || 'Sales Invoice',
              partner: inv.customer_name,
              quantity: line.quantity,
              unit_price: line.unit_price,
              line_total: line.line_total,
              status: inv.status,
            });
          }
        });
      });

      // Extract stock adjustments that match this item
      stockAdj.filter(adj => adj.status === 'Posted').forEach(adj => {
        (adj.line_items || []).forEach(line => {
          if (line.item_id === item.id || line.item_name === item.item_name) {
            txns.push({
              id: `sa-${adj.id}-${line.item_id}`,
              date: adj.adjustment_date,
              type: 'Adjustment',
              direction: adj.adjustment_type === 'Increase' ? 'in' : 'out',
              document: adj.adjustment_number || 'Stock Adjustment',
              partner: adj.reason || '—',
              quantity: Math.abs(line.difference_qty || line.adjusted_qty || 0),
              unit_price: line.cost_per_unit || 0,
              line_total: line.cost_impact || 0,
              status: adj.status,
            });
          }
        });
      });

      // Sort by date desc
      txns.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setTransactions(txns);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const filtered = activeTab === 'all' ? transactions
    : transactions.filter(t => t.type.toLowerCase() === activeTab);

  const totalIn = transactions.filter(t => t.direction === 'in').reduce((s, t) => s + (t.quantity || 0), 0);
  const totalOut = transactions.filter(t => t.direction === 'out').reduce((s, t) => s + (t.quantity || 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-4 py-3">
          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Total Received (In)</p>
          <p className="text-xl font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">{totalIn} <span className="text-sm font-normal">{item.unit_of_measure}</span></p>
        </div>
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-4 py-3">
          <p className="text-xs text-red-700 dark:text-red-400 font-medium">Total Issued (Out)</p>
          <p className="text-xl font-bold text-red-800 dark:text-red-300 mt-0.5">{totalOut} <span className="text-sm font-normal">{item.unit_of_measure}</span></p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl px-4 py-3">
          <p className="text-xs text-blue-700 dark:text-blue-400 font-medium">Current Stock</p>
          <p className="text-xl font-bold text-blue-800 dark:text-blue-300 mt-0.5">{item.quantity_on_hand} <span className="text-sm font-normal">{item.unit_of_measure}</span></p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {['all', 'purchase', 'sale', 'adjustment'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize',
                activeTab === tab ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              {tab === 'all' ? `All (${transactions.length})` : tab === 'purchase' ? `Purchases (${transactions.filter(t => t.type === 'Purchase').length})` : tab === 'sale' ? `Sales (${transactions.filter(t => t.type === 'Sale').length})` : `Adjustments (${transactions.filter(t => t.type === 'Adjustment').length})`}
            </button>
          ))}
        </div>
        <button onClick={fetchHistory} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Transaction Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Date</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Type</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Document</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">Party</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Qty</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Unit Price</th>
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array(4).fill(0).map((_, i) => (
                <tr key={i}>
                  {Array(7).fill(0).map((__, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <div className="h-3.5 bg-muted rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground text-sm">
                  No transactions found for this item
                </td>
              </tr>
            ) : filtered.map(t => (
              <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">{formatDate(t.date)}</td>
                <td className="px-3 py-2.5">
                  <span className={cn(
                    'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full',
                    t.type === 'Purchase' ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' :
                    t.type === 'Sale' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' :
                    'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  )}>
                    {t.direction === 'in'
                      ? <ArrowDownCircle className="w-3 h-3" />
                      : <ArrowUpCircle className="w-3 h-3" />}
                    {t.type}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs font-mono text-primary">{t.document}</td>
                <td className="px-3 py-2.5 text-xs">{t.partner || '—'}</td>
                <td className={cn(
                  'px-3 py-2.5 text-right font-semibold text-sm',
                  t.direction === 'in' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                )}>
                  {t.direction === 'in' ? '+' : '-'}{t.quantity}
                </td>
                <td className="px-3 py-2.5 text-right text-xs text-muted-foreground">{fmt(t.unit_price)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-xs">{fmt(t.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}