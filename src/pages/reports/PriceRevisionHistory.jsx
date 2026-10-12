import React, { useState, useEffect, useMemo } from 'react';
import { supabase, sajilo } from '@/api/sajiloClient';
import { useDateFormat } from '@/lib/DateFormatContext';
import { formatToDmyAD, formatToDmyBS } from '@/lib/nepaliDate';
import { History, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { format } from 'date-fns';
import { ReportPageTemplate, StandardReportTable } from '@/components/reports';

export default function PriceRevisionHistory() {
  const { displayBsDate } = useDateFormat();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    fromDate: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
    toDate: format(new Date(), 'yyyy-MM-dd'),
  });

  const fetchHistory = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('ItemPriceRevisionLog')
        .select(`
          *,
          Item ( item_code, item_name ),
          ItemCategory ( category_name ),
          User:created_by ( full_name, first_name, last_name, email )
        `)
        .eq('company_id', sajilo.getCompanyId());

      if (filters?.fromDate) query = query.gte('created_at', filters.fromDate);
      if (filters?.toDate) query = query.lt('created_at', new Date(new Date(filters.toDate).getTime() + 86400000).toISOString());

      const { data: logs, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setData(logs || []);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load price revision history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filteredData = useMemo(() => {
    return data.filter(d => 
      d.Item?.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.Item?.item_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.remarks?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [data, searchTerm]);

  const columns = useMemo(() => [
    { 
      label: 'Date (AD)', 
      key: 'created_at',
      preset: 'date',
      render: (v) => formatToDmyAD(v),
      exportValue: (r) => formatToDmyAD(r.created_at)
    },
    ...(displayBsDate ? [{
      label: 'Date (BS)', 
      key: 'created_at_bs',
      preset: 'date',
      render: (_, row) => formatToDmyBS(row.created_at),
      exportValue: (r) => formatToDmyBS(r.created_at)
    }] : []),
    {
      label: 'Item Code',
      key: 'item_code',
      preset: 'code',
      render: (_, row) => row.Item?.item_code || '—',
      exportValue: (row) => row.Item?.item_code || '—'
    },
    {
      label: 'Item Name',
      key: 'item_name',
      preset: 'description',
      render: (_, row) => row.Item?.item_name || 'Unknown',
      exportValue: (row) => row.Item?.item_name || 'Unknown'
    },
    {
      label: 'Category',
      key: 'category_name',
      preset: 'category',
      render: (_, row) => row.ItemCategory?.category_name || '—',
      exportValue: (row) => row.ItemCategory?.category_name || '—'
    },
    {
      label: 'Revision Type',
      key: 'revision_type',
      preset: 'status',
      render: (v) => (
        <Badge variant="outline" className="text-[10px] uppercase font-semibold">
          {v ? v.replace(/_/g, ' ') : '—'}
        </Badge>
      ),
      exportValue: (row) => row.revision_type ? row.revision_type.replace(/_/g, ' ') : '—'
    },
    {
      label: 'Old Price (NPR)',
      key: 'old_selling_price',
      preset: 'amount',
      render: (v) => Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2 }),
      exportValue: (row) => Number(row.old_selling_price || 0)
    },
    {
      label: 'New Price (NPR)',
      key: 'new_selling_price',
      preset: 'amount',
      render: (v) => (
        <span className="font-bold text-primary font-mono">
          {Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
      exportValue: (row) => Number(row.new_selling_price || 0)
    },
    {
      label: 'Difference',
      key: 'adjustment_value',
      preset: 'amount',
      render: (_, row) => {
        const diff = Number(row.new_selling_price || 0) - Number(row.old_selling_price || 0);
        const percent = Number(row.old_selling_price || 0) > 0 ? (diff / Number(row.old_selling_price)) * 100 : 0;
        return (
          <span className={`font-mono text-xs tabular-nums font-semibold ${diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : diff < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
            {diff > 0 ? '+' : ''}{diff.toLocaleString(undefined, { minimumFractionDigits: 2 })} ({diff > 0 ? '+' : ''}{percent.toFixed(1)}%)
          </span>
        );
      },
      exportValue: (row) => {
        const diff = Number(row.new_selling_price || 0) - Number(row.old_selling_price || 0);
        return diff;
      }
    },
    {
      label: 'Remarks (Reason)',
      key: 'remarks',
      preset: 'description',
      render: (v) => <span className="text-xs text-muted-foreground">{v || '—'}</span>
    },
    {
      label: 'Revised By',
      key: 'created_by',
      width: '130px',
      render: (_, row) => (
        <span className="text-xs text-foreground font-medium">
          {row.User?.full_name || (row.User?.first_name ? `${row.User.first_name} ${row.User.last_name || ''}` : 'System')}
        </span>
      ),
      exportValue: (row) => row.User?.full_name || row.User?.email || 'System'
    }
  ], [displayBsDate]);

  return (
    <ReportPageTemplate
      title="Sales Price Revision History"
      subtitle="Immutable audit trail of all historical adjustments to item sales prices"
      category="Inventory"
      icon={History}
      fromDate={filters.fromDate}
      toDate={filters.toDate}
      isLoading={loading}
      onRefresh={fetchHistory}
      exportConfig={{
        columns,
        data: filteredData,
        filename: `Price_Revision_History_${filters.fromDate}_${filters.toDate}`,
      }}
      filterSlot={
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-end justify-between gap-4">
          <div className="flex-1">
            <ReportFilterBar filters={filters} onChange={setFilters} onApply={fetchHistory} showApplyButton />
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Search items, codes, remarks..." 
              className="pl-9 bg-muted/40 text-xs rounded-lg"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      }
    >
      <StandardReportTable
        columns={columns}
        data={filteredData}
        loading={loading}
        emptyMessage="No price revision records found for the selected filter."
      />
    </ReportPageTemplate>
  );
}
