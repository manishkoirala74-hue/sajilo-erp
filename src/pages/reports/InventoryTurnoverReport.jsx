import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sajilo } from '@/api/sajiloClient';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, Settings2, BarChart2, RefreshCcw, Printer } from 'lucide-react';
import DateInput from '@/components/shared/DateInput';
import { format, subMonths, differenceInDays } from 'date-fns';
import { toast } from 'react-hot-toast';
import ReportFilterBar from '@/components/reports/ReportFilterBar';

export default function InventoryTurnoverReport() {
  const navigate = useNavigate();

  // State
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // Filters
  const [filters, setFilters] = useState({
    fromDate: format(subMonths(new Date(), 1), 'yyyy-MM-dd'),
    toDate: format(new Date(), 'yyyy-MM-dd'),
  });
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Velocity Thresholds (Configurable via UI)
  const [thresholds, setThresholds] = useState({
    slowMovingMax: 2,
    healthyMin: 2
  });

  useEffect(() => {
    fetchCategories();
    // Pre-fetch report on load
    generateReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCategories = async () => {
    try {
      const cats = await sajilo.entities.ItemCategory.list('category_name');
      setCategories(cats);
    } catch (e) {
      console.error(e);
    }
  };

  const generateReport = async () => {
    const { fromDate, toDate } = filters;
    if (!fromDate || !toDate) {
      toast.error('Please select both From and To dates');
      return;
    }
    
    setLoading(true);
    try {
      // 1. Fetch Items
      const items = await sajilo.entities.Item.list('-created_date', 1000);
      
      // Filter items by category if selected
      const targetItems = selectedCategory === 'all' 
        ? items 
        : items.filter(i => i.category_id === selectedCategory);

      // 2. Fetch data from source tables instead of InventoryHistory to bypass RLS policy issues
      const [purchaseInvoices, salesInvoices, stockAdj] = await Promise.all([
        sajilo.entities.PurchaseInvoice.list('-created_date', 5000),
        sajilo.entities.SalesInvoice.list('-created_date', 5000),
        sajilo.entities.StockAdjustment.list('-created_date', 5000),
      ]);

      const toDateStr = toDate.substring(0, 10);
      const fromDateStr = fromDate.substring(0, 10);

      // Reconstruct a ledger history array
      let history = [];

      purchaseInvoices.filter(inv => inv.status === 'Posted').forEach(inv => {
        (inv.line_items || []).forEach(line => {
          history.push({
            item_id: line.item_id,
            transaction_date: inv.invoice_date,
            transaction_type: 'Purchase',
            quantity_change: Math.abs(line.quantity || 0),
            unit_cost: Number(line.unit_price || 0)
          });
        });
      });

      salesInvoices.filter(inv => inv.status === 'Posted').forEach(inv => {
        (inv.line_items || []).forEach(line => {
          history.push({
            item_id: line.item_id,
            transaction_date: inv.invoice_date,
            transaction_type: 'Sale',
            quantity_change: -Math.abs(line.quantity || 0),
            unit_cost: Number(line.unit_price || 0)
          });
        });
      });

      stockAdj.filter(adj => adj.status === 'Posted').forEach(adj => {
        (adj.line_items || []).forEach(line => {
          const diff = Math.abs(line.difference_qty || line.adjusted_qty || 0);
          history.push({
            item_id: line.item_id,
            transaction_date: adj.adjustment_date,
            transaction_type: 'Adjustment',
            quantity_change: adj.adjustment_type === 'Increase' ? diff : -diff,
            unit_cost: Number(line.cost_per_unit || 0)
          });
        });
      });

      // Filter history up to the toDate
      const relevantHistory = history.filter(h => (h.transaction_date || '').substring(0, 10) <= toDateStr);

      // 3. Process each item
      const reportData = targetItems.map((item, index) => {
        const itemHistory = relevantHistory.filter(h => h.item_id === item.id);
        
        let begInvValue = 0;
        let endInvValue = 0;
        let cogsValue = 0;
        
        itemHistory.forEach(txn => {
          const qtyChange = Number(txn.quantity_change || txn.quantity || 0);
          const isOutward = qtyChange < 0 || txn.transaction_type === 'Sale';
          
          const rate = Number(txn.unit_cost || txn.rate || txn.valuation_rate || item.valuation_rate || 0);
          const value = qtyChange * rate;

          const txnDate = (txn.transaction_date || '').substring(0, 10);

          // Before From Date (Beginning Inventory)
          if (txnDate < fromDateStr) {
            begInvValue += value;
          }
          
          // Up to To Date (Ending Inventory)
          endInvValue += value;

          // COGS (Only Outward transactions between fromDate and toDate)
          if (txnDate >= fromDateStr && txnDate <= toDateStr && isOutward) {
            cogsValue += Math.abs(value);
          }
        });

        const begInv = Math.max(0, begInvValue);
        const endInv = Math.max(0, endInvValue);
        const avgInv = (begInv + endInv) / 2;
        
        const turnoverRatio = avgInv > 0 ? (cogsValue / avgInv) : 0;
        
        const daysInPeriod = Math.max(1, differenceInDays(new Date(toDate), new Date(fromDate)));
        const dsi = turnoverRatio > 0 ? (daysInPeriod / turnoverRatio) : 0;

        // Determine Status based on Thresholds
        let statusObj = { label: "Dead Stock", color: "text-red-600 bg-red-100 border-red-200" };
        if (cogsValue === 0) {
          statusObj = { label: "Dead Stock", color: "text-red-600 bg-red-100 border-red-200" };
        } else if (turnoverRatio < thresholds.slowMovingMax) {
          statusObj = { label: "Slow Moving", color: "text-orange-600 bg-orange-100 border-orange-200" };
        } else if (turnoverRatio >= thresholds.healthyMin) {
          statusObj = { label: "Healthy", color: "text-emerald-600 bg-emerald-100 border-emerald-200" };
        }

        return {
          sn: index + 1,
          id: item.id,
          sku: item.item_code || item.sku || '-',
          name: item.item_name,
          category: item.category_name || 'Uncategorized',
          cogs: cogsValue,
          begInv,
          endInv,
          avgInv,
          turnoverRatio,
          dsi,
          status: statusObj
        };
      });

      let activeReportData = reportData.filter(row => row.begInv > 0 || row.endInv > 0 || row.cogs > 0 || row.turnoverRatio > 0);
      if (activeReportData.length === 0 && reportData.length > 0) {
        activeReportData = reportData;
      }

      setData(activeReportData);
      toast.success('Report generated successfully');
    } catch (e) {
      console.error("Report Generation Error:", e);
      toast.error('Failed to generate report: ' + (e.message || 'Unknown error'));
    }
    setLoading(false);
  };

  const columns = [
    { key: 'sn', label: 'S.N.', render: (val) => <span className="text-muted-foreground">{val}</span> },
    { key: 'item', label: 'Item', render: (_, row) => (
      <div>
        <p className="font-medium text-foreground">{row.name}</p>
        <p className="text-xs text-muted-foreground">{row.sku}</p>
      </div>
    )},
    { key: 'category', label: 'Category', render: (val) => <span className="text-muted-foreground">{val}</span> },
    { key: 'cogs', label: 'COGS (NPR)', render: (val) => <span className="font-semibold text-foreground">{(val || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span> },
    { key: 'begInv', label: 'Beg. Inventory', render: (val) => <span className="text-muted-foreground">{(val || 0).toLocaleString()}</span> },
    { key: 'endInv', label: 'End. Inventory', render: (val) => <span className="text-muted-foreground">{(val || 0).toLocaleString()}</span> },
    { key: 'avgInv', label: 'Avg. Inventory', render: (val) => <span className="text-muted-foreground">{(val || 0).toLocaleString()}</span> },
    { key: 'turnoverRatio', label: 'Turnover (X)', render: (val) => <span className="font-bold text-primary">{(val || 0).toFixed(2)}x</span> },
    { key: 'dsi', label: 'Days on Shelf', render: (val) => <span className="font-medium">{(val || 0).toFixed(0)} days</span> },
    { key: 'status', label: 'Status / Action', render: (_, row) => (
      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${row.status.color}`}>
        {row.status.label}
      </span>
    )}
  ];

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-6 p-6 pb-24 max-w-7xl mx-auto print:p-0 print:pb-0">
      <div className="print:hidden">
        <PageHeader 
          title="Inventory Turnover Ratio" 
          subtitle="Analyze stock movement velocities and identify dead stock"
          actions={
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 bg-secondary text-secondary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-secondary/80 transition shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Print Report
            </button>
          }
        />
      </div>
      
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inventory Turnover Ratio Report</h1>
        <p className="text-gray-500">Period: {filters.fromDate} to {filters.toDate}</p>
      </div>

      <div className="print:hidden flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/reports')} className="rounded-xl">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-primary" />
              Inventory Turnover Ratio
            </h2>
            <p className="text-sm text-muted-foreground">Analyze inventory velocity and cost of goods sold</p>
          </div>
        </div>

        {/* Velocity Thresholds Popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="rounded-xl bg-stone-100 hover:bg-stone-200 border-transparent transition-colors">
              <Settings2 className="w-4 h-4 mr-2 text-stone-600" />
              <span className="text-stone-700">Velocity Settings</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-5 rounded-2xl shadow-xl border-stone-200" align="end">
            <h4 className="font-semibold text-foreground mb-4">Threshold Settings</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Slow Moving Max Ratio (x)</Label>
                <div className="flex items-center gap-3">
                  <Input 
                    type="number" 
                    step="0.5"
                    className="bg-stone-100 border-transparent rounded-xl flex-1"
                    value={thresholds.slowMovingMax}
                    onChange={e => setThresholds(prev => ({ ...prev, slowMovingMax: Number(e.target.value) }))}
                  />
                  <span className="text-xs text-stone-500 w-16">&lt; {thresholds.slowMovingMax}x</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Healthy Min Ratio (x)</Label>
                <div className="flex items-center gap-3">
                  <Input 
                    type="number" 
                    step="0.5"
                    className="bg-stone-100 border-transparent rounded-xl flex-1"
                    value={thresholds.healthyMin}
                    onChange={e => setThresholds(prev => ({ ...prev, healthyMin: Number(e.target.value) }))}
                  />
                  <span className="text-xs text-stone-500 w-16">&gt;= {thresholds.healthyMin}x</span>
                </div>
              </div>
              <Button 
                className="w-full rounded-xl mt-2" 
                onClick={() => generateReport()}
              >
                Apply & Recalculate
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="bg-card rounded-2xl border border-stone-200 p-5 shadow-sm print:hidden">
        <div className="flex flex-wrap items-end gap-4 mb-6">
          <div className="flex-1 w-full lg:w-auto">
             <ReportFilterBar filters={filters} onChange={setFilters} onApply={generateReport} showApplyButton />
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs mb-1.5 block text-muted-foreground">Category Filter</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="bg-stone-100 border-transparent rounded-xl">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.category_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DataTable 
          columns={columns} 
          data={data} 
          loading={loading}
          searchKey="name"
          searchPlaceholder="Search items..."
        />
      </div>
    </div>
  );
}
