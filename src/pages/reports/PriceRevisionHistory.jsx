import { useState, useEffect } from 'react';
import { supabase, sajilo } from '@/api/sajiloClient';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import { useDateFormat } from '@/lib/DateFormatContext';
import { formatToDmyAD, formatToDmyBS } from '@/lib/nepaliDate';
import { History, Calendar as CalendarIcon, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { format } from 'date-fns';

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
          User:created_by ( full_name )
        `)
        .eq('company_id', sajilo.getCompanyId());

      if (filters?.fromDate) query = query.gte('created_at', filters.fromDate);
      // To ensure we get entries up to the end of the toDate
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

  const columns = [
    { 
      label: 'Date', 
      key: 'created_at',
      render: (v) => <span className="whitespace-nowrap">{formatToDmyAD(v)}</span>
    },
    ...(displayBsDate ? [{
      label: 'Date (BS)', 
      key: 'created_at_bs',
      render: (_, row) => <span className="whitespace-nowrap">{formatToDmyBS(row.created_at)}</span>
    }] : []),
    {
      label: 'Item',
      key: 'item_id',
      render: (_, row) => (
        <div>
          <p className="font-medium">{row.Item?.item_name || 'Unknown'}</p>
          <p className="text-xs text-muted-foreground">{row.Item?.item_code}</p>
        </div>
      )
    },
    {
      label: 'Category',
      key: 'category_id',
      render: (_, row) => <span className="text-muted-foreground">{row.ItemCategory?.category_name || '-'}</span>
    },
    {
      label: 'Revision Type',
      key: 'revision_type',
      render: (v) => <Badge variant="outline" className="text-[10px]">{v ? v.replace(/_/g, ' ') : '-'}</Badge>
    },
    {
      label: 'Old Price',
      key: 'old_selling_price',
      render: (v) => <span className="text-muted-foreground">NPR {Number(v).toLocaleString()}</span>
    },
    {
      label: 'New Price',
      key: 'new_selling_price',
      render: (v) => <span className="font-medium text-primary">NPR {Number(v).toLocaleString()}</span>
    },
    {
      label: 'Change',
      key: 'adjustment_value',
      render: (_, row) => {
        const diff = Number(row.new_selling_price) - Number(row.old_selling_price);
        const percent = Number(row.old_selling_price) > 0 ? (diff / Number(row.old_selling_price)) * 100 : 0;
        return (
          <span className={diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-muted-foreground'}>
            {diff > 0 ? '+' : ''}{diff.toLocaleString()} ({diff > 0 ? '+' : ''}{percent.toFixed(1)}%)
          </span>
        );
      }
    },
    {
      label: 'Remarks (Reason)',
      key: 'remarks',
      render: (v) => <span className="text-xs text-muted-foreground">{v}</span>
    },
    {
      label: 'Revised By',
      key: 'created_by',
      render: (_, row) => (
        <div className="text-xs">
          <p>{row.User ? `${row.User.first_name} ${row.User.last_name}` : 'System'}</p>
          <p className="text-muted-foreground">{row.User?.email}</p>
        </div>
      )
    }
  ];

  const filteredData = data.filter(d => 
    d.Item?.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.Item?.item_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.remarks?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Sales Price Revision History" 
        description="Immutable audit trail of all historical changes to item selling prices."
        icon={History}
      />
      <ReportFilterBar filters={filters} onChange={setFilters} onApply={fetchHistory} showApplyButton />

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between gap-4">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Search items, codes, remarks..." 
              className="pl-9 bg-background"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchHistory} disabled={loading}>
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
          columns={columns}
          loading={loading}
          emptyMessage="No price revision history found."
        />
      </div>
    </div>
  );
}
