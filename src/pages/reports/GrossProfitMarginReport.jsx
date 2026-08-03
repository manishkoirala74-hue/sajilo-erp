import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sajilo } from '@/api/sajiloClient';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, BarChart2, RefreshCcw, Printer } from 'lucide-react';
import { format, subMonths } from 'date-fns';
import { toast } from 'sonner';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
export default function GrossProfitMarginReport() {
  const navigate = useNavigate();

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
          // Process outgoing stock (Sales & POS) and incoming returns
          if (l.transaction_type === 'SalesInvoice' || l.transaction_type === 'POSSale') {
            const itemObj = itemsMap.get(l.item_id);
            if (itemObj) {
              const qtyOut = Math.abs(l.quantity_out || 0);
              const qtyIn = Math.abs(l.quantity_in || 0);
              
              if (qtyOut === 0 && qtyIn === 0) return;

              // Use new strict columns with fallbacks for legacy data
              const rev = Number(l.net_amount || l.total_amount || 0);
              const wac = Number(l.wac_at_post || itemObj.weighted_average_cost || itemObj.purchase_price || 0);
              
              if (qtyOut > 0) {
                itemObj.qtySold += qtyOut;
                itemObj.revenue += rev;
                itemObj.cogs += qtyOut * wac;
              }
              
              // Handle cancellation reversals
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
              
              // Handle cancellation reversals
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
    { key: 'qtySold', label: 'Qty Sold', render: (val) => <span className="text-muted-foreground">{(val || 0).toLocaleString()}</span> },
    { key: 'revenue', label: 'Revenue (Sales Value)', render: (val) => <span className="font-medium text-foreground">{(val || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span> },
    { key: 'cogs', label: 'Cost of Goods Sold (COGS)', render: (val) => <span className="text-muted-foreground">{(val || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span> },
    { key: 'grossProfit', label: 'Gross Profit (NPR)', render: (val) => <span className={`font-semibold ${val >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{(val || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span> },
    { key: 'grossMargin', label: 'Gross Margin (%)', render: (val) => <span className="font-bold text-primary">{(val || 0).toFixed(2)}%</span> }
  ];

  const handlePrint = () => {
    window.print();
  };

  const totalQtySold = (data || []).reduce((acc, row) => acc + (row.qtySold || 0), 0);
  const totalRevenue = (data || []).reduce((acc, row) => acc + (row.revenue || 0), 0);
  const totalCogs = (data || []).reduce((acc, row) => acc + (row.cogs || 0), 0);
  const totalGrossProfit = (data || []).reduce((acc, row) => acc + (row.grossProfit || 0), 0);
  const totalGrossMargin = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;

  const footerContent = data?.length > 0 ? [
    '',
    'TOTAL',
    '',
    totalQtySold.toLocaleString(),
    totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2}),
    totalCogs.toLocaleString(undefined, {minimumFractionDigits: 2}),
    totalGrossProfit.toLocaleString(undefined, {minimumFractionDigits: 2}),
    `${totalGrossMargin.toFixed(2)}%`
  ] : undefined;

  return (
    <div className="flex flex-col gap-6 p-6 pb-24 max-w-7xl mx-auto print:p-0 print:pb-0">

      
      {/* ── PRINT-ONLY VIEW ── */}
      <div className="hidden print:block w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Gross Profit Margin Report</h1>
          <p className="text-gray-500">Date Between: {filters.fromDate} to {filters.toDate}</p>
        </div>
        <table className="w-full text-sm text-left border-collapse border border-gray-200">
          <thead>
            <tr className="bg-gray-100">
              {columns.map(c => (
                <th key={c.key} className="border border-gray-200 p-2 font-semibold text-gray-700">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data || []).map((row, i) => (
              <tr key={i} className="border-b border-gray-200">
                {columns.map(c => (
                  <td key={c.key} className="border border-gray-200 p-2">
                    {c.render ? c.render(row[c.key], row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footerContent && (
            <tfoot>
              <tr className="bg-gray-100 font-bold">
                {footerContent.map((col, i) => (
                  <td key={i} className="border border-gray-200 p-2">{col}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── SCREEN VIEW ── */}
      <div className="print:hidden flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/reports')} className="rounded-xl">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-primary" />
              Gross Profit Margin
            </h2>
            <p className="text-sm text-muted-foreground">Analyze revenue, COGS, and gross margin per item</p>
          </div>
        </div>
        <Button onClick={handlePrint} className="flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
          <Printer className="w-4 h-4" />
          Print / PDF
        </Button>
      </div>

      <div className="bg-card rounded-2xl border border-stone-200 p-5 shadow-sm print:hidden">
        <div className="flex flex-wrap items-end gap-4 mb-6">
          <div className="flex-1 w-full lg:w-auto">
             <ReportFilterBar filters={filters} onChange={setFilters} onApply={generateReport} showApplyButton />
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs mb-1.5 block text-muted-foreground">Select All Item or Item Category</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="bg-stone-100 border-transparent rounded-xl">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Select All Item</SelectItem>
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
          footerContent={footerContent}
        />
      </div>
    </div>
  );
}
