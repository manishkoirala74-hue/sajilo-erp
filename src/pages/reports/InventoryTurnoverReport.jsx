import React, { useState, useEffect, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Settings2, BarChart2 } from 'lucide-react';
import { format, subMonths, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { ReportPageTemplate, StandardReportTable } from '@/components/reports';

export default function InventoryTurnoverReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [categories, setCategories] = useState([]);
  
  const [filters, setFilters] = useState({
    fromDate: format(subMonths(new Date(), 1), 'yyyy-MM-dd'),
    toDate: format(new Date(), 'yyyy-MM-dd'),
  });
  const [selectedCategory, setSelectedCategory] = useState('all');

  const [thresholds, setThresholds] = useState({
    slowMovingMax: 2,
    healthyMin: 2
  });

  useEffect(() => {
    fetchCategories();
    generateReport();
  }, []);

  const fetchCategories = async () => {
    try {
      const cats = await sajilo.entities.ItemCategory.list('category_name');
      setCategories(cats || []);
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
      const items = await sajilo.entities.Item.list('-created_date', 1000);
      const targetItems = selectedCategory === 'all' 
        ? items 
        : items.filter(i => i.category_id === selectedCategory);

      const [purchaseInvoices, salesInvoices, stockAdj] = await Promise.all([
        sajilo.entities.PurchaseInvoice.list('-created_date', 5000),
        sajilo.entities.SalesInvoice.list('-created_date', 5000),
        sajilo.entities.StockAdjustment?.list ? sajilo.entities.StockAdjustment.list('-created_date', 5000) : []
      ]);

      const daysInPeriod = Math.max(1, differenceInDays(new Date(toDate), new Date(fromDate)) + 1);

      const reportRows = targetItems.map((item, idx) => {
        let totalCOGS = 0;
        let totalQtySold = 0;

        (salesInvoices || []).forEach(inv => {
          const invDate = inv.invoice_date || inv.created_date;
          if (invDate >= fromDate && invDate <= toDate && inv.status !== 'Draft' && inv.status !== 'Cancelled') {
            (inv.items || []).forEach(line => {
              if (line.item_id === item.id) {
                totalQtySold += (line.quantity || 0);
                const cost = line.unit_cost || item.purchase_price || item.cost_price || 0;
                totalCOGS += (line.quantity || 0) * cost;
              }
            });
          }
        });

        const currentStock = item.current_stock || item.stock_quantity || 0;
        const endingInventoryValue = currentStock * (item.purchase_price || item.cost_price || 1);
        const beginningInventoryValue = Math.max(0, endingInventoryValue + totalCOGS * 0.8);
        const avgInventory = (beginningInventoryValue + endingInventoryValue) / 2 || 1;

        const turnoverRatio = avgInventory > 0 ? (totalCOGS / avgInventory) : 0;
        const daysSalesOfInventory = turnoverRatio > 0 ? (daysInPeriod / turnoverRatio) : 999;

        let statusObj = { label: 'Healthy', color: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200' };
        if (turnoverRatio < thresholds.slowMovingMax || totalQtySold === 0) {
          statusObj = { label: 'Slow Moving / Dead', color: 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200' };
        } else if (turnoverRatio >= 6) {
          statusObj = { label: 'High Velocity', color: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200' };
        }

        return {
          sn: idx + 1,
          id: item.id,
          sku: item.item_code || item.sku || '-',
          name: item.name || item.item_name || 'Unnamed',
          category: item.category_name || 'General',
          cogs: totalCOGS,
          begInv: beginningInventoryValue,
          endInv: endingInventoryValue,
          avgInv: avgInventory,
          turnoverRatio: turnoverRatio,
          dsi: Math.min(daysSalesOfInventory, 999),
          status: statusObj,
          velocityStatus: statusObj.label,
        };
      });

      setData(reportRows);
      toast.success('Inventory turnover calculated');
    } catch (e) {
      console.error(e);
      toast.error('Failed to calculate turnover: ' + (e.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const columns = useMemo(() => [
    { key: 'sn', label: 'S.N.', width: '60px', align: 'center', headerAlign: 'text-center' },
    { key: 'sku', label: 'Item Code', preset: 'code', stickyFirst: true },
    { key: 'name', label: 'Item Name', preset: 'description' },
    { key: 'category', label: 'Category', preset: 'category' },
    { key: 'cogs', label: 'COGS (NPR)', preset: 'amount' },
    { key: 'begInv', label: 'Beg. Inventory', preset: 'amount' },
    { key: 'endInv', label: 'End. Inventory', preset: 'amount' },
    { key: 'avgInv', label: 'Avg. Inventory', preset: 'amount' },
    { 
      key: 'turnoverRatio', 
      label: 'Turnover (X)', 
      preset: 'percentage',
      render: (val) => (
        <span className="font-mono text-xs tabular-nums font-bold text-primary">
          {(val || 0).toFixed(2)}x
        </span>
      ),
      exportValue: (row) => `${(row.turnoverRatio || 0).toFixed(2)}x`
    },
    { 
      key: 'dsi', 
      label: 'Days on Shelf', 
      preset: 'quantity',
      render: (val) => (
        <span className="font-mono text-xs tabular-nums font-medium">
          {(val || 0).toFixed(0)} d
        </span>
      ),
      exportValue: (row) => `${(row.dsi || 0).toFixed(0)} days`
    },
    { 
      key: 'status', 
      label: 'Velocity Status', 
      preset: 'status',
      render: (_, row) => (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${row.status.color}`}>
          {row.status.label}
        </span>
      ),
      exportValue: (row) => row.velocityStatus
    }
  ], []);

  const totalCOGS = useMemo(() => (data || []).reduce((acc, r) => acc + (r.cogs || 0), 0), [data]);
  const totalAvgInv = useMemo(() => (data || []).reduce((acc, r) => acc + (r.avgInv || 0), 0), [data]);

  const footer = useMemo(() => {
    if (!data || data.length === 0) return null;
    return {
      sn: '',
      sku: 'TOTAL',
      name: '',
      category: '',
      cogs: totalCOGS,
      begInv: '',
      endInv: '',
      avgInv: totalAvgInv,
      turnoverRatio: totalAvgInv > 0 ? `${(totalCOGS / totalAvgInv).toFixed(2)}x` : '',
      dsi: '',
      status: ''
    };
  }, [data, totalCOGS, totalAvgInv]);

  return (
    <ReportPageTemplate
      title="Inventory Turnover Ratio"
      subtitle="Analyze stock velocity, average inventory holding, and days sales of inventory (DSI)"
      category="Inventory"
      icon={BarChart2}
      fromDate={filters.fromDate}
      toDate={filters.toDate}
      isLoading={loading}
      onRefresh={generateReport}
      exportConfig={{
        columns,
        data,
        footer,
        filename: `Inventory_Turnover_${filters.fromDate}_${filters.toDate}`,
      }}
      extraActions={
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-lg text-xs font-semibold gap-1.5 shadow-sm">
              <Settings2 className="w-3.5 h-3.5" />
              Thresholds
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-4 rounded-xl shadow-xl border-border" align="end">
            <h4 className="font-semibold text-sm text-foreground mb-3">Velocity Thresholds</h4>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground font-medium">Slow Moving Max Ratio (x)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input 
                    type="number" 
                    step="0.5"
                    className="h-8 text-xs bg-muted/30"
                    value={thresholds.slowMovingMax}
                    onChange={e => setThresholds(prev => ({ ...prev, slowMovingMax: Number(e.target.value) }))}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">&lt; {thresholds.slowMovingMax}x</span>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground font-medium">Healthy Min Ratio (x)</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input 
                    type="number" 
                    step="0.5"
                    className="h-8 text-xs bg-muted/30"
                    value={thresholds.healthyMin}
                    onChange={e => setThresholds(prev => ({ ...prev, healthyMin: Number(e.target.value) }))}
                  />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">&gt;= {thresholds.healthyMin}x</span>
                </div>
              </div>
              <Button 
                size="sm"
                className="w-full rounded-lg mt-2 text-xs" 
                onClick={() => generateReport()}
              >
                Apply & Recalculate
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      }
      filterSlot={
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[280px]">
            <ReportFilterBar
              filters={filters}
              onChange={setFilters}
              onApply={generateReport}
              showApplyButton
            />
          </div>
          <div className="w-full sm:w-64">
            <Label className="text-xs mb-1.5 block text-muted-foreground font-medium">Category Filter</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="bg-muted/40 border-border rounded-lg text-xs">
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
      }
    >
      <StandardReportTable
        columns={columns}
        data={data}
        loading={loading}
        footer={footer}
        emptyMessage="No inventory turnover records calculated for the selected period."
      />
    </ReportPageTemplate>
  );
}
