import React, { useState, useEffect, useMemo } from 'react';
import { supabase, sajilo } from '@/api/sajiloClient';
import { useDateFormat } from '@/lib/DateFormatContext';
import { formatToDmyAD, formatToDmyBS } from '@/lib/nepaliDate';
import { History, Search, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SearchableSelect from '@/components/shared/SearchableSelect';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import VoucherLink from '@/components/shared/VoucherLink';
import { format } from 'date-fns';
import { ReportPageTemplate, StandardReportTable } from '@/components/reports';

export default function PurchasePriceChangeHistory() {
  const { displayBsDate } = useDateFormat();
  const [data, setData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filters, setFilters] = useState({
    fromDate: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
    toDate: format(new Date(), 'yyyy-MM-dd'),
  });
  
  // Detail Modal State
  const [selectedItem, setSelectedItem] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const companyId = sajilo.getCompanyId();
      
      const { data: latestPrices, error } = await supabase
        .from('vw_latest_purchase_price')
        .select('*')
        .eq('company_id', companyId);

      if (error) throw error;
      
      setData(latestPrices || []);
      
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
      
      const { data: history, error } = await supabase
        .from('vw_purchase_price_history')
        .select('*')
        .eq('company_id', companyId)
        .eq('item_id', item.item_id)
        .order('invoice_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      let processedHistory = [];
      for (let i = 0; i < (history || []).length; i++) {
        const current = history[i];
        let percentChange = 0;
        let diff = 0;
        
        if (i > 0) {
          const previous = history[i - 1];
          const oldPrice = Number(previous.unit_price) || 0;
          const newPrice = Number(current.unit_price) || 0;
          
          if (oldPrice > 0) {
            diff = newPrice - oldPrice;
            percentChange = (diff / oldPrice) * 100;
          }
        }
        
        processedHistory.push({
          ...current,
          diff,
          percentChange
        });
      }
      
      setHistoryData(processedHistory.reverse());
    } catch (error) {
      console.error(error);
      toast.error('Failed to load item price trend');
    } finally {
      setHistoryLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    return data.filter(d => {
      const matchesSearch = (d.item_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (d.item_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (d.vendor_name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || d.category_id === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [data, searchTerm, selectedCategory]);

  const masterColumns = useMemo(() => [
    {
      label: 'Item Code',
      key: 'item_code',
      preset: 'code',
      stickyFirst: true,
      render: (v) => <span className="font-mono text-xs font-semibold text-foreground/80">{v || '—'}</span>,
    },
    {
      label: 'Item Name',
      key: 'item_name',
      preset: 'description',
    },
    {
      label: 'Category',
      key: 'category_name',
      preset: 'category',
      render: (v) => <span className="text-muted-foreground">{v || '—'}</span>
    },
    {
      label: 'Last Supplier',
      key: 'vendor_name',
      preset: 'description',
      render: (v) => <span className="font-medium text-foreground">{v || '—'}</span>
    },
    {
      label: 'Last Purchase Date',
      key: 'invoice_date',
      preset: 'date',
      render: (v, row) => (
        <span>
          {formatToDmyAD(v)}
          {displayBsDate && <span className="text-[10px] text-muted-foreground block">({formatToDmyBS(row.invoice_date)})</span>}
        </span>
      ),
      exportValue: (row) => formatToDmyAD(row.invoice_date)
    },
    {
      label: 'Latest Price (NPR)',
      key: 'unit_price',
      preset: 'amount',
      render: (v) => (
        <span className="font-mono font-bold text-foreground">
          {Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
      exportValue: (row) => Number(row.unit_price || 0)
    },
    {
      label: 'Action',
      key: 'actions',
      preset: 'actions',
      render: (_, row) => (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => openHistoryModal(row)}
          className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 gap-1 rounded-md"
        >
          <Eye className="w-3.5 h-3.5" />
          Trends
        </Button>
      )
    }
  ], [displayBsDate]);

  return (
    <ReportPageTemplate
      title="Purchase Price Change History"
      subtitle="Track procurement cost variations and supplier price trends over time"
      category="Purchase"
      icon={History}
      fromDate={filters.fromDate}
      toDate={filters.toDate}
      isLoading={loading}
      onRefresh={fetchData}
      exportConfig={{
        columns: masterColumns.filter(c => c.key !== 'actions'),
        data: filteredData,
        filename: `Purchase_Price_Change_History_${filters.fromDate}_${filters.toDate}`,
      }}
      filterSlot={
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-4">
          <div className="flex-1">
            <ReportFilterBar filters={filters} onChange={setFilters} onApply={fetchData} showApplyButton />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Search items, suppliers..." 
                className="pl-9 bg-muted/40 text-xs rounded-lg"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-56">
              <SearchableSelect
                options={[{ value: 'all', label: 'All Categories' }, ...categories]}
                value={selectedCategory}
                onChange={setSelectedCategory}
                placeholder="Filter Category"
              />
            </div>
          </div>
        </div>
      }
    >
      <StandardReportTable
        columns={masterColumns}
        data={filteredData}
        loading={loading}
        emptyMessage="No purchase price history records found."
      />

      {/* Detail Modal */}
      <Dialog open={!!selectedItem} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Purchase History Trend: <span className="text-primary">{selectedItem?.item_name}</span>
              <span className="text-sm font-normal text-muted-foreground ml-2">({selectedItem?.item_code})</span>
            </DialogTitle>
          </DialogHeader>
          
          <div className="mt-4">
            {historyLoading ? (
              <div className="flex justify-center p-8 text-muted-foreground">Loading history trend...</div>
            ) : historyData.length === 0 ? (
              <div className="flex justify-center p-8 text-muted-foreground">No purchase records found for this item.</div>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="table-fluid-grid w-full text-xs">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="cell-density text-left font-semibold">Date</th>
                      {displayBsDate && <th className="cell-density text-left font-semibold">Date (BS)</th>}
                      <th className="cell-density text-left font-semibold">Supplier</th>
                      <th className="cell-density text-left font-semibold">Invoice #</th>
                      <th className="cell-density text-right font-semibold">Quantity</th>
                      <th className="cell-density text-right font-semibold">Unit Price</th>
                      <th className="cell-density text-right font-semibold">Variation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {historyData.map((row, i) => {
                      const isFirstEntry = i === historyData.length - 1;
                      return (
                        <tr key={row.invoice_id || i} className="hover:bg-muted/30 transition-colors">
                          <td className="cell-density whitespace-nowrap">{formatToDmyAD(row.invoice_date)}</td>
                          {displayBsDate && <td className="cell-density whitespace-nowrap">{formatToDmyBS(row.invoice_date)}</td>}
                          <td className="cell-density font-medium">{row.vendor_name || '—'}</td>
                          <td className="cell-density text-muted-foreground font-mono">
                            {row.invoice_number ? <VoucherLink voucherNumber={row.invoice_number}>{row.invoice_number}</VoucherLink> : '—'}
                          </td>
                          <td className="cell-density text-right font-mono">{Number(row.quantity).toLocaleString()}</td>
                          <td className="cell-density text-right font-mono font-bold">
                            NPR {Number(row.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                          <td className="cell-density text-right font-mono">
                            {isFirstEntry ? (
                              <span className="text-muted-foreground text-xs">Base</span>
                            ) : (
                              <span className={row.diff > 0 ? 'text-red-600 font-semibold' : row.diff < 0 ? 'text-emerald-600 font-semibold' : 'text-muted-foreground'}>
                                {row.diff > 0 ? '+' : ''}{row.diff.toLocaleString(undefined, { minimumFractionDigits: 2 })} 
                                <span className="ml-1 text-[11px] opacity-80">
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
    </ReportPageTemplate>
  );
}
