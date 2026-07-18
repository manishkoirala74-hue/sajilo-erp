import React, { useState, useEffect } from 'react';
import { supabase } from '@/api/sajiloClient';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';
import { toast } from 'sonner';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { format } from 'date-fns';

export default function NegativeStockExceptionReport() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    fromDate: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
    toDate: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: stockData, error } = await supabase
        .from('CurrentStock')
        .select(`
          id,
          current_qty,
          godown_id,
          item_id,
          Item ( item_code, item_name, category_name ),
          Godown ( name, location )
        `)
        .lt('current_qty', 0);
      
      if (error) throw error;

      const formatted = (stockData || []).map(row => ({
        id: row.id,
        item_code: row.Item?.item_code || 'N/A',
        item_name: row.Item?.item_name || 'Unknown',
        category: row.Item?.category_name || 'Unknown',
        godown_name: row.Godown?.name || 'Unknown',
        current_qty: row.current_qty
      }));

      setData(formatted);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load negative stock report');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { key: 'item_code', label: 'Item Code' },
    { key: 'item_name', label: 'Item Name' },
    { key: 'category', label: 'Category' },
    { key: 'godown_name', label: 'Godown / Location' },
    { 
      key: 'current_qty', 
      label: 'Negative Qty',
      render: (v) => <span className="font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded">{v}</span>
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Negative Stock Exception Report"
        subtitle="Items with quantity on hand below zero"
      />
      <ReportFilterBar filters={filters} onChange={setFilters} onApply={fetchData} showApplyButton />
      <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
        <DataTable columns={columns} data={data} loading={loading} searchKey="item_name" />
      </div>
    </div>
  );
}
