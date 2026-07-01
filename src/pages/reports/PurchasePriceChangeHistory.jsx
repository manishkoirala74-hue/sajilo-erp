import { useState, useEffect } from 'react';
import { supabase, sajilo } from '@/api/sajiloClient';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import { useDateFormat } from '@/lib/DateFormatContext';
import { History, Search, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SearchableSelect from '@/components/shared/SearchableSelect';

export default function PurchasePriceChangeHistory() {
  const { formatDate } = useDateFormat();
  const [data, setData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  // Detail Modal State
  const [selectedItem, setSelectedItem] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const companyId = sajilo.getCompanyId();
      
      // Fetch master list from the latest purchase price view
      const { data: latestPrices, error } = await supabase
        .from('vw_latest_purchase_price')
        .select('*')
        .eq('company_id', companyId);

      if (error) throw error;
      
      setData(latestPrices || []);
      
      // Extract unique categories for filter
      const uniqueCats = Array.from(new Set((latestPrices || []).map(item => item.category_id).filter(Boolean)))
        .map(catId => {
          const item = latestPrices.find(i => i.category_id === catId);
          return { value: catId, label: item?.category_name || 'Unknown Category' };
        });
      setCategories(uniqueCats);

    } catch (error) {
      console.error(error);
      toast.error('Failed to load purchase price history data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openHistoryModal = async (item) => {
    setSelectedItem(item);
    setHistoryLoading(true);
    try {
      const companyId = sajilo.getCompanyId();
      
      // Fetch full history for the specific item, chronologically ordered
      const { data: history, error } = await supabase
        .from('vw_purchase_price_history')
        .select('*')
        .eq('company_id', companyId)
        .eq('item_id', item.item_id)
        .order('invoice_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Calculate price change %
      let processedHistory = [];
      for (let i = 0; i < (history || []).length; i++) {
        const current = history[i];
        let percentChange = 0;
        let diff = 0;
        
        if (i > 0) {
          const previous = history[i - 1];
          const oldPrice = Number(previous.unit_price) || 0;
          const newPrice = Number(current.unit_price) || 0;
          
          diff = newPrice - oldPrice;
          if (oldPrice > 0) {
            percentChange = (diff / oldPrice) * 100;
          }
        }
        
        processedHistory.push({
          ...current,
          diff,
          percentChange
        });
      }

      // Reverse to show latest first in modal
      setHistoryData(processedHistory.reverse());

    } catch (error) {
      console.error(error);
      toast.error('Failed to load item history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const masterColumns = [
    {
      label: 'Item',
      key: 'item_name',
      render: (_, row) => (
        <div>
          <p className="font-medium text-primary cursor-pointer hover:underline" onClick={() => openHistoryModal(row)}>
            {row.item_name || 'Unknown'}
          </p>
          <p className="text-xs text-muted-foreground">{row.item_code}</p>
        </div>
      )
    },
    {
      label: 'Category',
      key: 'category_id',
      render: (_, row) => <span className="text-muted-foreground">{row.category_name || '-'}</span>
    },
    {
      label: 'Latest Supplier',
      key: 'vendor_name',
      render: (v) => <span className="text-muted-foreground">{v || '-'}</span>
    },
    {
      label: 'Latest Purchase Date',
      key: 'invoice_date',
      render: (v) => <span className="whitespace-nowrap">{formatDate(v, true)}</span>
    },
    {
      label: 'Latest Price',
      key: 'unit_price',
      render: (v) => <span className="font-medium text-primary">NPR {Number(v).toLocaleString()}</span>
    }
  ];

  const filteredData = data.filter(d => {
    const matchesSearch = (d.item_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (d.item_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (d.vendor_name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || d.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Purchase Price Change History" 
        description="Track how the purchase prices of items have changed over time across different suppliers."
        icon={History}
      />

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="relative w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Search items, codes, suppliers..." 
                className="pl-9 bg-background"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-64">
              <SearchableSelect
                options={[{value: 'all', label: 'All Categories'}, ...categories]}
                value={selectedCategory}
                onChange={setSelectedCategory}
                placeholder="Filter by Category"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              Refresh
            </Button>
            <Button variant="outline" size="sm" className="hidden sm:flex">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
        
        <DataTable 
          data={filteredData}
          columns={masterColumns}
          loading={loading}
          emptyMessage="No purchase price history found."
        />
      </div>

      {/* Detail Modal */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Purchase History: <span className="text-primary">{selectedItem?.item_name}</span>
              <span className="text-sm font-normal text-muted-foreground ml-2">({selectedItem?.item_code})</span>
            </DialogTitle>
          </DialogHeader>
          
          <div className="mt-4">
            {historyLoading ? (
              <div className="flex justify-center p-8 text-muted-foreground">Loading history...</div>
            ) : historyData.length === 0 ? (
              <div className="flex justify-center p-8 text-muted-foreground">No purchase history found for this item.</div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="table-fluid-grid w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="cell-density text-left font-semibold">Date</th>
                      <th className="cell-density text-left font-semibold">Supplier</th>
                      <th className="cell-density text-left font-semibold">Invoice #</th>
                      <th className="cell-density text-right font-semibold">Quantity</th>
                      <th className="cell-density text-right font-semibold">Unit Price</th>
                      <th className="cell-density text-right font-semibold">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {historyData.map((row, i) => {
                      const isFirstEntry = i === historyData.length - 1; // Since we reversed the array
                      
                      return (
                        <tr key={row.invoice_id || i} className="hover:bg-muted/30 transition-colors">
                          <td className="cell-density whitespace-nowrap">{formatDate(row.invoice_date, true)}</td>
                          <td className="cell-density">{row.vendor_name || '-'}</td>
                          <td className="cell-density text-muted-foreground">{row.invoice_number}</td>
                          <td className="cell-density text-right">{Number(row.quantity).toLocaleString()}</td>
                          <td className="cell-density text-right font-medium">
                            NPR {Number(row.unit_price).toLocaleString()}
                          </td>
                          <td className="cell-density text-right">
                            {isFirstEntry ? (
                              <span className="text-muted-foreground text-xs">Initial</span>
                            ) : (
                              <span className={row.diff > 0 ? 'text-red-600' : row.diff < 0 ? 'text-green-600' : 'text-muted-foreground'}>
                                {row.diff > 0 ? '+' : ''}{row.diff.toLocaleString()} 
                                <span className="ml-1 text-xs opacity-80">
                                  ({row.diff > 0 ? '+' : ''}{row.percentChange.toFixed(1)}%)
                                </span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
