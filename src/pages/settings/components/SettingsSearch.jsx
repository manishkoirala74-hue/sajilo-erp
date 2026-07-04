import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, X } from 'lucide-react';
import { matchSorter } from 'match-sorter';
import { getFlattenedSettingsIndex } from '../config/settingsNavConfig';

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
  if (!highlight.trim()) return <span>{text}</span>;
  const regex = new RegExp(`(${highlight})`, 'gi');
  const parts = text.split(regex);
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

export default function SettingsSearch() {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  const settingsIndex = useMemo(() => getFlattenedSettingsIndex(), []);

  // Synchronous fuzzy search using match-sorter
  const results = useMemo(() => {
    if (!query.trim()) return [];
    return matchSorter(settingsIndex, query, {
      keys: ['label', 'keywords', 'breadcrumb']
    });
  }, [query, settingsIndex]);

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
    navigate(item.path);
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
    <div className="relative w-full" ref={containerRef}>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search Settings..."
          className="w-full pl-9 pr-8 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground transition-colors"
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
          aria-controls="settings-search-results"
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
            className="absolute right-2 top-2.5 p-0.5 text-muted-foreground hover:text-foreground rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Screen Reader Announcement */}
      <div className="sr-only" aria-live="polite">
        {query && (
          results.length > 0 
            ? `${results.length} settings found for '${query}'. Use up and down arrows to navigate.`
            : `No settings found matching '${query}'.`
        )}
      </div>

      {isOpen && query.trim() && (
        <div 
          id="settings-search-results"
          className="absolute z-50 w-[320px] left-0 top-full mt-2 bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
          role="listbox"
        >
          {results.length > 0 ? (
            <ul ref={listRef} className="max-h-[300px] overflow-y-auto py-2">
              {results.map((result, index) => (
                <li
                  key={result.path}
                  role="option"
                  aria-selected={index === selectedIndex}
                  className={`px-4 py-3 cursor-pointer flex items-center justify-between group transition-colors ${
                    index === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                  }`}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-medium truncate">
                      <HighlightText text={result.label} highlight={query} />
                    </span>
                    <span className={`text-xs mt-0.5 truncate ${
                      index === selectedIndex ? 'text-primary/70' : 'text-muted-foreground'
                    }`}>
                      {result.breadcrumb}
                    </span>
                  </div>
                  <ChevronRight className={`h-4 w-4 shrink-0 transition-opacity ${
                    index === selectedIndex ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'
                  }`} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-center">
              <p className="text-sm font-medium text-foreground">No settings found</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                We couldn't find anything matching "{query}".
              </p>
              <div className="flex flex-col gap-2 text-left">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2">Quick Links</p>
                <button
                  onClick={() => handleSelect({ path: '/settings/company/management' })}
                  className="text-sm text-primary hover:bg-primary/10 px-3 py-2 rounded-md transition-colors text-left"
                >
                  Company Profile
                </button>
                <button
                  onClick={() => handleSelect({ path: '/settings/company/roles' })}
                  className="text-sm text-primary hover:bg-primary/10 px-3 py-2 rounded-md transition-colors text-left"
                >
                  User & Access Roles
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
