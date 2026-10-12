import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/api/sajiloClient';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import ReportFilterBar from '@/components/reports/ReportFilterBar';
import { format } from 'date-fns';
import { ReportPageTemplate, StandardReportTable } from '@/components/reports';

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

  const totalNegative = useMemo(() => (data || []).reduce((s, r) => s + (r.current_qty || 0), 0), [data]);

  const columns = useMemo(() => [
    { key: 'item_code', label: 'Item Code', preset: 'code', stickyFirst: true },
    { key: 'item_name', label: 'Item Name', preset: 'description' },
    { key: 'category', label: 'Category', preset: 'category' },
    { key: 'godown_name', label: 'Godown / Location', preset: 'description' },
    { 
      key: 'current_qty', 
      label: 'Deficit Quantity', 
      preset: 'quantity',
      render: (v) => (
        <span className="font-mono text-xs tabular-nums font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 px-2.5 py-0.5 rounded-full">
          {Number(v || 0).toLocaleString()}
        </span>
      )
    }
  ], []);

  const footer = useMemo(() => {
    if (!data || data.length === 0) return null;
    return {
      item_code: 'TOTAL DEFICIT',
      item_name: '',
      category: '',
      godown_name: '',
      current_qty: totalNegative
    };
  }, [data, totalNegative]);

  return (
    <ReportPageTemplate
      title="Negative Stock Exception Report"
      subtitle="Critical audit: identifies inventory ledgers where physical or system stock is below zero"
      category="Inventory"
      icon={AlertTriangle}
      fromDate={filters.fromDate}
      toDate={filters.toDate}
      isLoading={loading}
      onRefresh={fetchData}
      exportConfig={{
        columns,
        data,
        footer,
        filename: `Negative_Stock_Exceptions_${format(new Date(), 'yyyyMMdd')}`,
      }}
      filterSlot={
        <ReportFilterBar
          filters={filters}
          onChange={setFilters}
          onApply={fetchData}
          showApplyButton
        />
      }
    >
      <StandardReportTable
        columns={columns}
        data={data}
        loading={loading}
        footer={footer}
        emptyMessage="Great news! No negative stock items detected."
      />
    </ReportPageTemplate>
  );
}
