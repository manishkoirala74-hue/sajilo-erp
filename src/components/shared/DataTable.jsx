import { Search } from 'lucide-react';
import { useState } from 'react';
import { useDateFormat } from '@/lib/DateFormatContext';

export default function DataTable({ columns, data, searchKey, loading }) {
  const { formatDate } = useDateFormat();
  const [search, setSearch] = useState('');

  const filtered = searchKey
    ? data.filter(row =>
        String(row[searchKey] || '').toLowerCase().includes(search.toLowerCase())
      )
    : data;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      {searchKey && (
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 max-w-xs">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground w-full"
            />
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {columns.map(col => (
                <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              Array(5).fill(0).map((_, i) => (
                <tr key={i}>
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-4 bg-muted rounded animate-pulse w-24" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground text-sm">
                  No records found
                </td>
              </tr>
            ) : (
              filtered.map((row, idx) => (
                <tr key={row.id || idx} className="hover:bg-muted/30 transition-colors">
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3 text-sm text-foreground">
                      {col.render
                        ? col.render(row[col.key], row)
                        : col.isDate
                          ? (row[col.key] ? formatDate(row[col.key]) : '—')
                          : row[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!loading && (
        <div className="px-4 py-3 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
        </div>
      )}
    </div>
  );
}