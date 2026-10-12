import React, { useState, useEffect, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { BarChart2 } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { toast } from 'sonner';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { ReportPageTemplate, StandardReportTable } from '@/components/reports';

export default function GrossProfitMarginReport() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [categories, setCategories] = useState([]);
  
  const [filters, setFilters] = useState({
    fromDate: format(subMonths(new Date(), 1), 'yyyy-MM-dd'),
    toDate: format(new Date(), 'yyyy-MM-dd'),
  });
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    fetchCategories();
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
      const items = await sajilo.entities.Item.list();
      
      const targetItems = selectedCategory === 'all' 
        ? items 
        : items.filter(i => i.category_id === selectedCategory);

      const itemsMap = new Map();
      targetItems.forEach(i => {
        itemsMap.set(i.id, {
          ...i,
          qtySold: 0,
          revenue: 0,
          cogs: 0
        });
      });

      const ledgers = await sajilo.entities.InventoryLedger.list('-transaction_date', 10000);

      const toDateStr = toDate.substring(0, 10);
      const fromDateStr = fromDate.substring(0, 10);

      ledgers.forEach(l => {
        const txnDate = (l.transaction_date || '').substring(0, 10);
        if (txnDate >= fromDateStr && txnDate <= toDateStr) {
          if (l.transaction_type === 'SalesInvoice' || l.transaction_type === 'POSSale') {
            const itemObj = itemsMap.get(l.item_id);
            if (itemObj) {
              const qtyOut = Math.abs(l.quantity_out || 0);
              const qtyIn = Math.abs(l.quantity_in || 0);
              if (qtyOut === 0 && qtyIn === 0) return;

              const rev = Number(l.net_amount || l.total_amount || 0);
              const wac = Number(l.wac_at_post || itemObj.weighted_average_cost || itemObj.purchase_price || 0);
              
              if (qtyOut > 0) {
                itemObj.qtySold += qtyOut;
                itemObj.revenue += rev;
                itemObj.cogs += qtyOut * wac;
              }
              if (qtyIn > 0) {
                itemObj.qtySold -= qtyIn;
                itemObj.revenue -= rev;
                itemObj.cogs -= qtyIn * wac;
              }
            }
          } else if (l.transaction_type === 'SalesReturn') {
            const itemObj = itemsMap.get(l.item_id);
            if (itemObj) {
              const qtyIn = Math.abs(l.quantity_in || 0);
              const qtyOut = Math.abs(l.quantity_out || 0);
              if (qtyIn === 0 && qtyOut === 0) return;

              const rev = Number(l.net_amount || l.total_amount || 0);
              const wac = Number(l.wac_at_post || itemObj.weighted_average_cost || itemObj.purchase_price || 0);
              
              if (qtyIn > 0) {
                itemObj.qtySold -= qtyIn;
                itemObj.revenue -= rev;
                itemObj.cogs -= qtyIn * wac;
              }
              if (qtyOut > 0) {
                itemObj.qtySold += qtyOut;
                itemObj.revenue += rev;
                itemObj.cogs += qtyOut * wac;
              }
            }
          }
        }
      });

      const reportData = Array.from(itemsMap.values())
        .filter(item => item.qtySold > 0)
        .map((item, index) => {
          const grossProfit = item.revenue - item.cogs;
          const grossMargin = item.revenue > 0 ? (grossProfit / item.revenue) * 100 : 0;

          return {
            sn: index + 1,
            id: item.id,
            sku: item.item_code || item.sku || '-',
            name: item.item_name,
            category: item.category_name || 'Uncategorized',
            qtySold: item.qtySold,
            revenue: item.revenue,
            cogs: item.cogs,
            grossProfit: grossProfit,
            grossMargin: grossMargin
          };
        });

      setData(reportData);
      toast.success('Report generated successfully');
    } catch (e) {
      console.error("Report Generation Error:", e);
      toast.error('Failed to generate report: ' + (e.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Calculations for Totals
  const totalQtySold = useMemo(() => (data || []).reduce((acc, row) => acc + (row.qtySold || 0), 0), [data]);
  const totalRevenue = useMemo(() => (data || []).reduce((acc, row) => acc + (row.revenue || 0), 0), [data]);
  const totalCogs = useMemo(() => (data || []).reduce((acc, row) => acc + (row.cogs || 0), 0), [data]);
  const totalGrossProfit = useMemo(() => (data || []).reduce((acc, row) => acc + (row.grossProfit || 0), 0), [data]);
  const totalGrossMargin = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

  const columns = useMemo(() => [
    { key: 'sn', label: 'S.N.', width: '60px', align: 'center', headerAlign: 'text-center' },
    { key: 'sku', label: 'Item Code', preset: 'code', stickyFirst: true },
    { key: 'name', label: 'Item Name', preset: 'description' },
    { key: 'category', label: 'Category', preset: 'category' },
    { key: 'qtySold', label: 'Qty Sold', preset: 'quantity' },
    { key: 'revenue', label: 'Revenue (NPR)', preset: 'amount' },
    { key: 'cogs', label: 'COGS (NPR)', preset: 'amount' },
    { 
      key: 'grossProfit', 
      label: 'Gross Profit (NPR)', 
      preset: 'amount',
      render: (val) => (
        <span className={`font-mono text-xs tabular-nums font-semibold ${val >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      )
    },
    { 
      key: 'grossMargin', 
      label: 'Margin (%)', 
      preset: 'percentage',
      render: (val) => (
        <span className="font-mono text-xs tabular-nums font-bold text-primary">
          {(val || 0).toFixed(2)}%
        </span>
      ),
      exportValue: (row) => `${(row.grossMargin || 0).toFixed(2)}%`
    }
  ], []);

  const footer = useMemo(() => {
    if (!data || data.length === 0) return null;
    return {
      sn: '',
      sku: 'TOTAL',
      name: '',
      category: '',
      qtySold: totalQtySold,
      revenue: totalRevenue,
      cogs: totalCogs,
      grossProfit: totalGrossProfit,
      grossMargin: `${totalGrossMargin.toFixed(2)}%`
    };
  }, [data, totalQtySold, totalRevenue, totalCogs, totalGrossProfit, totalGrossMargin]);

  return (
    <ReportPageTemplate
      title="Gross Profit Margin"
      subtitle="Analyze item sales revenue, cost of goods sold (COGS), and gross profit margins"
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
        filename: `Gross_Profit_Margin_${filters.fromDate}_${filters.toDate}`,
      }}
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
            <Label className="text-xs mb-1.5 block text-muted-foreground font-medium">Filter by Category</Label>
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
        emptyMessage="No sales data found for the selected date range. Click 'Generate' to fetch."
      />
    </ReportPageTemplate>
  );
}
