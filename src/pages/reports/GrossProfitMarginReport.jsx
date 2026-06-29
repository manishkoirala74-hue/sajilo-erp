import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sajilo } from '@/api/sajiloClient';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, BarChart2, RefreshCcw, Printer } from 'lucide-react';
import DateInput from '@/components/shared/DateInput';
import { format, subMonths } from 'date-fns';
import { toast } from 'sonner';

export default function GrossProfitMarginReport() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [categories, setCategories] = useState([]);
  
  const [fromDate, setFromDate] = useState(format(subMonths(new Date(), 1), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    fetchCategories();
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

      const salesInvoices = await sajilo.entities.SalesInvoice.list('-created_date', 5000);

      const toDateStr = toDate.substring(0, 10);
      const fromDateStr = fromDate.substring(0, 10);

      salesInvoices.filter(inv => inv.status === 'Posted').forEach(inv => {
        const txnDate = (inv.invoice_date || '').substring(0, 10);
        if (txnDate >= fromDateStr && txnDate <= toDateStr) {
          (inv.line_items || []).forEach(line => {
            const itemObj = itemsMap.get(line.item_id);
            if (itemObj) {
              const qty = Math.abs(line.quantity || 0);
              if (qty === 0) return;

              let rev = 0;
              if (line.credit_amount !== undefined) {
                rev = Number(line.credit_amount);
              } else if (line.line_total !== undefined) {
                rev = Number(line.line_total);
              } else {
                rev = qty * Number(line.unit_price || 0);
              }

              let cogsVal = 0;
              if (line.cost_at_sale !== undefined) {
                // If it's the newer ledger format, cost_at_sale is the total line COGS
                cogsVal = Number(line.cost_at_sale);
              } else {
                const unitCost = Number(itemObj.weighted_average_cost || itemObj.purchase_price || 0);
                cogsVal = qty * unitCost;
              }
              
              itemObj.qtySold += qty;
              itemObj.revenue += rev;
              itemObj.cogs += cogsVal;
            }
          });
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

  return (
    <div className="flex flex-col gap-6 p-6 pb-24 max-w-7xl mx-auto print:p-0 print:pb-0">
      <div className="print:hidden">
        <PageHeader 
          title="Gross Profit Margin" 
          subtitle="Analyze revenue, COGS, and gross margin per item"
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
        <h1 className="text-2xl font-bold text-gray-900">Gross Profit Margin Report</h1>
        <p className="text-gray-500">Date Between: {fromDate} to {toDate}</p>
      </div>

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
      </div>

      <div className="bg-card rounded-2xl border border-stone-200 p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4 mb-6">
          <div className="flex-1 min-w-[200px]">
            <DateInput label="Date Between (Start)" value={fromDate} onChange={setFromDate} />
          </div>
          <div className="flex-1 min-w-[200px]">
            <DateInput label="Date Between (End)" value={toDate} onChange={setToDate} />
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
          <Button onClick={generateReport} disabled={loading} className="rounded-xl px-6">
            {loading ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <BarChart2 className="w-4 h-4 mr-2" />}
            Generate
          </Button>
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
