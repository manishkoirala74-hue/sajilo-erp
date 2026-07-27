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

export default function DataTable({ columns, data, searchKey, loading, onEndReached, footerContent }) {
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
    <div className="bg-transparent md:bg-card md:rounded-xl md:border md:border-border flex flex-col h-[600px] w-full">
      {searchKey && (
        <div className="p-0 md:p-4 pb-4 md:border-b md:border-border shrink-0">
          <div className="flex items-center gap-2 bg-card md:bg-muted border border-border md:border-none rounded-lg px-3 py-2 md:max-w-xs shadow-sm md:shadow-none">
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
      
      <div className="flex-1 h-0 w-full">
        {loading && (!data || data.length === 0) ? (
          <table className="block md:table w-full">
            <thead className="hidden md:table-header-group">
              <tr className="bg-muted/50 border-b border-border">
                {columns.map(col => (
                  <th key={col.key} className={`cell-density text-xs font-semibold text-muted-foreground uppercase tracking-wider ${getAlignClass(col.key, col.label)}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="block md:table-row-group space-y-4 md:space-y-0 md:divide-y md:divide-border">
              {Array(15).fill(0).map((_, i) => (
                <tr key={i} className="block md:table-row bg-card border border-border rounded-lg md:border-none md:rounded-none">
                  {columns.map(col => (
                    <td key={col.key} className="block md:table-cell p-4 md:p-2 border-b md:border-none last:border-0 cell-density">
                      <div className="h-4 bg-muted rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm bg-card rounded-xl border border-border">
            No records found
          </div>
        ) : (
          <TableVirtuoso
            style={{ height: '100%' }}
            data={filtered}
            endReached={onEndReached}
            components={{
              Table: forwardRef((props, ref) => <table className="block md:table w-full border-spacing-0" {...props} ref={ref} />),
              TableHead: forwardRef((props, ref) => <thead className="hidden md:table-header-group" {...props} ref={ref} />),
              TableRow: forwardRef((props, ref) => <tr className="block md:table-row bg-card mb-4 md:mb-0 border border-border rounded-xl md:border-none md:rounded-none shadow-sm md:shadow-none hover:bg-muted/30 transition-colors md:border-b md:border-border overflow-hidden" {...props} ref={ref} />),
              TableBody: forwardRef((props, ref) => <tbody className="block md:table-row-group md:divide-y md:divide-border px-1 md:px-0" {...props} ref={ref} />),
              TableFoot: forwardRef((props, ref) => <tfoot className="hidden md:table-footer-group bg-muted border-t border-border font-semibold shadow-sm" {...props} ref={ref} />),
            }}
            fixedHeaderContent={() => (
              <tr className="hidden md:table-row bg-muted border-b border-border shadow-sm">
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
            fixedFooterContent={footerContent ? () => (
              <tr className="hidden md:table-row">
                {footerContent.map((col, i) => {
                  const alignClass = getAlignClass(columns[i]?.key, columns[i]?.label);
                  return (
                    <td key={i} className={`cell-density text-sm text-foreground bg-muted ${alignClass}`}>
                      {col}
                    </td>
                  );
                })}
              </tr>
            ) : undefined}
            itemContent={(index, row) => (
              <>
                {columns.map((col, colIndex) => {
                  const alignClass = getAlignClass(col.key, col.label);
                  // Apply special styling for the first column on mobile to make it look like a card title
                  const isFirstCol = colIndex === 0;
                  
                  return (
                    <td key={col.key} className={`block md:table-cell p-3 md:p-2 border-b border-border md:border-none last:border-0 cell-density text-sm text-foreground bg-card md:bg-transparent ${isFirstCol ? 'bg-muted/20 md:bg-transparent' : ''} md:${alignClass}`}>
                      <div className={`flex md:block items-center justify-between gap-4 md:gap-0 ${isFirstCol ? 'flex-row' : ''}`}>
                        <span className="md:hidden font-medium text-muted-foreground text-xs uppercase tracking-wider shrink-0">
                          {col.label}
                        </span>
                        <div className={`flex-1 md:w-auto ${isFirstCol ? 'text-base font-bold' : ''} md:text-sm md:font-normal text-right md:text-left md:${alignClass}`}>
                          {col.render
                            ? col.render(row[col.key], row)
                            : col.isDate
                              ? (row[col.key] ? formatDate(row[col.key]) : '—')
                              : row[col.key] ?? '—'}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </>
            )}
          />
        )}
      </div>
      
      {loading && data && data.length > 0 && (
        <div className="p-2 text-center text-xs text-muted-foreground bg-muted/20 shrink-0 rounded-b-xl">
          Loading more...
        </div>
      )}
    </div>
  );
}