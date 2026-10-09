import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, X, FileText, ArrowRight } from 'lucide-react';
import { matchSorter } from 'match-sorter';
import { getFlattenedReportIndex } from '@/config/reportsRegistry';

// Custom hook to detect clicks outside of an element
function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (event) => {
      if (!ref.current || ref.current.contains(event.target)) {
        return;
      }
      handler(event);
    };
    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);
    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [ref, handler]);
}

// Utility to highlight matching text
const HighlightText = ({ text, highlight }) => {
  if (!highlight || !highlight.trim()) return <span>{text}</span>;
  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = String(text).split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span key={i} className="font-bold text-primary">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
};

export default function ReportSearch({ className = '' }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  // Dynamically populated from single source of truth
  const reportsIndex = useMemo(() => getFlattenedReportIndex(), []);

  // Synchronous fuzzy search using match-sorter across name, keywords, description, and breadcrumbs
  const results = useMemo(() => {
    if (!query.trim()) return [];
    return matchSorter(reportsIndex, query, {
      keys: ['label', 'keywords', 'desc', 'categoryLabel', 'breadcrumb']
    });
  }, [query, reportsIndex]);

  // Handle click outside
  useOnClickOutside(containerRef, () => setIsOpen(false));

  const handleKeyDown = (e) => {
    if (!isOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < results.length) {
        handleSelect(results[selectedIndex]);
      } else if (results.length > 0) {
        handleSelect(results[0]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleSelect = (item) => {
    setQuery('');
    setIsOpen(false);
    
    // Dispatch navigation cleanly:
    // Standalone routes navigate to their specific path
    // In-modal reports navigate to /reports?report=id so Reports.jsx opens the viewer modal
    if (item.isRoute) {
      navigate(item.path);
    } else if (item.id === 'activity_log') {
      navigate('/reports?category=activity_log');
    } else {
      navigate(`/reports?report=${item.id}`);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const activeElement = listRef.current.children[selectedIndex];
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [results]);

  return (
    <div className={`relative w-full max-w-md ${className}`} ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search all reports (Income Statement, Day Book, Stock...)"
          className="w-full pl-9 pr-8 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder:text-muted-foreground transition-all shadow-sm"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          aria-expanded={isOpen}
          aria-controls="report-search-results"
          aria-autocomplete="list"
          role="combobox"
        />
        {query && (
          <button
            onClick={() => {
              setQuery('');
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-2.5 p-0.5 text-muted-foreground hover:text-foreground rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Screen Reader Announcement */}
      <div className="sr-only" aria-live="polite">
        {query && (
          results.length > 0
            ? `${results.length} reports found for '${query}'. Use up and down arrows to navigate.`
            : `No reports found matching '${query}'.`
        )}
      </div>

      {isOpen && query.trim() && (
        <div
          id="report-search-results"
          className="absolute z-50 w-full left-0 top-full mt-2 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100"
          role="listbox"
        >
          {results.length > 0 ? (
            <ul ref={listRef} className="max-h-[360px] overflow-y-auto py-2 divide-y divide-border/20">
              {results.map((result, index) => {
                const IconComponent = result.categoryIcon || FileText;
                return (
                  <li
                    key={result.id + (result.path || '')}
                    role="option"
                    aria-selected={index === selectedIndex}
                    className={`px-4 py-3 cursor-pointer flex items-center justify-between group transition-colors ${
                      index === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60 text-foreground'
                    }`}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className="flex items-start gap-3 min-w-0 pr-2">
                      <div className="p-1.5 rounded-lg bg-muted/60 mt-0.5 shrink-0 text-muted-foreground group-hover:text-primary">
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate">
                            <HighlightText text={result.label} highlight={query} />
                          </span>
                          {result.isRoute && (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 bg-muted text-muted-foreground rounded">
                              Page
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {result.desc}
                        </span>
                        <span className={`text-[11px] font-medium mt-1 truncate ${
                          index === selectedIndex ? 'text-primary/70' : 'text-slate-400'
                        }`}>
                          {result.breadcrumb}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className={`h-4 w-4 shrink-0 transition-opacity ${
                      index === selectedIndex ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-60 text-muted-foreground'
                    }`} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-6 text-center">
              <p className="text-sm font-semibold text-foreground">No reports found</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                We couldn't find any report matching &ldquo;{query}&rdquo;.
              </p>
              <div className="flex flex-col gap-1.5 text-left pt-2 border-t border-border">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2">Popular Reports</p>
                <button
                  onClick={() => handleSelect({ id: 'profit_loss', isRoute: false })}
                  className="flex items-center justify-between text-xs font-medium text-foreground hover:bg-muted/60 px-3 py-2 rounded-lg transition-colors text-left"
                >
                  <span>Income Statement</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => handleSelect({ id: 'trial_balance', isRoute: false })}
                  className="flex items-center justify-between text-xs font-medium text-foreground hover:bg-muted/60 px-3 py-2 rounded-lg transition-colors text-left"
                >
                  <span>Trial Balance</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => handleSelect({ isRoute: true, path: '/reports/accounting/day-book' })}
                  className="flex items-center justify-between text-xs font-medium text-foreground hover:bg-muted/60 px-3 py-2 rounded-lg transition-colors text-left"
                >
                  <span>Day Book Report</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
