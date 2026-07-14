import { Search } from 'lucide-react';
import { useState, useMemo, forwardRef } from 'react';
import { useDateFormat } from '@/lib/DateFormatContext';
import { TableVirtuoso } from 'react-virtuoso';

const getAlignClass = (key = '', label = '') => {
  const k = String(key + label).toLowerCase();
  if (k.includes('amount') || k.includes('balance') || k.includes('qty') || k.includes('quantity') || k.includes('total') || k.includes('debit') || k.includes('credit') || k.includes('price') || k.includes('rate')) {
    return 'amount-cell';
  }
  if (k.includes('date') || k.includes('status') || k.includes('voucher') || k.includes('pan') || k.includes('tax') || k.includes('ref')) {
    return 'text-align-center';
  }
  return 'text-align-left';
};

export default function DataTable({ columns, data, searchKey, loading, onEndReached }) {
  const { formatDate } = useDateFormat();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return searchKey && search
      ? (data || []).filter(row =>
          String(row[searchKey] || '').toLowerCase().includes(search.toLowerCase())
        )
      : (data || []);
  }, [data, searchKey, search]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col h-full" style={{ minHeight: '400px' }}>
      {searchKey && (
        <div className="p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 max-w-xs">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={handleSearchChange}
              className="bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground w-full"
            />
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-hidden">
        {loading && (!data || data.length === 0) ? (
          <table className="table-fluid-grid w-full">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                {columns.map(col => (
                  <th key={col.key} className={`cell-density text-xs font-semibold text-muted-foreground uppercase tracking-wider ${getAlignClass(col.key, col.label)}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Array(15).fill(0).map((_, i) => (
                <tr key={i}>
                  {columns.map(col => (
                    <td key={col.key} className="cell-density">
                      <div className="h-4 bg-muted rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No records found
          </div>
        ) : (
          <TableVirtuoso
            style={{ height: '100%' }}
            data={filtered}
            endReached={onEndReached}
            components={{
              Table: forwardRef((props, ref) => <table className="table-fluid-grid w-full" {...props} ref={ref} />),
              TableHead: forwardRef((props, ref) => <thead {...props} ref={ref} />),
              TableRow: forwardRef((props, ref) => <tr className="hover:bg-muted/30 transition-colors border-b border-border" {...props} ref={ref} />),
              TableBody: forwardRef((props, ref) => <tbody className="divide-y divide-border" {...props} ref={ref} />),
            }}
            fixedHeaderContent={() => (
              <tr className="bg-muted border-b border-border shadow-sm">
                {columns.map(col => {
                  const alignClass = getAlignClass(col.key, col.label);
                  return (
                    <th key={col.key} className={`cell-density text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted ${alignClass}`}>
                      {col.label}
                    </th>
                  );
                })}
              </tr>
            )}
            itemContent={(index, row) => (
              <>
                {columns.map(col => {
                  const alignClass = getAlignClass(col.key, col.label);
                  return (
                    <td key={col.key} className={`cell-density text-sm text-foreground bg-card ${alignClass}`}>
                      {col.render
                        ? col.render(row[col.key], row)
                        : col.isDate
                          ? (row[col.key] ? formatDate(row[col.key]) : '—')
                          : row[col.key] ?? '—'}
                    </td>
                  );
                })}
              </>
            )}
          />
        )}
      </div>
      
      {loading && data && data.length > 0 && (
        <div className="p-2 text-center text-xs text-muted-foreground bg-muted/20 shrink-0">
          Loading more...
        </div>
      )}
    </div>
  );
}