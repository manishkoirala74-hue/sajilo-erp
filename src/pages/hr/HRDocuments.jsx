import { useState, useEffect, useMemo } from 'react';
import { sajilo } from '@/api/sajiloClient';
import { useAuth } from '@/lib/AuthContext';
import { toast } from 'sonner';
import { FileText, Download, Eye, Search, Filter, FileStack, Users, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/shared/PageHeader';
import DataTable from '@/components/shared/DataTable';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOC_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'Citizenship Front', label: 'Citizenship Front' },
  { value: 'Citizenship Back', label: 'Citizenship Back' },
  { value: 'Passport', label: 'Passport' },
  { value: 'Certificate', label: 'Certificate' },
  { value: 'Contract', label: 'Contract' },
  { value: 'Other', label: 'Other' },
];

/** Returns Tailwind badge variant classes per document type. */
function docTypeBadgeClass(type) {
  switch (type) {
    case 'Citizenship Front':
    case 'Citizenship Back':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Passport':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'Certificate':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'Contract':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

/** Format bytes into a human-readable KB string. */
function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Format an ISO date string to a readable local date-time. */
function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Returns YYYY-MM-DD for today (used to compare months). */
function thisMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

// ---------------------------------------------------------------------------
// Stat Card sub-component
// ---------------------------------------------------------------------------

function StatCard({ icon: Icon, label, value, colorClass }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-white p-5 shadow-sm">
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${colorClass}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function HRDocuments() {
  const { activeCompany } = useAuth();

  // Raw data
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [search, setSearch] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Per-row action loading state (keyed by doc id)
  const [actionLoading, setActionLoading] = useState({});

  // ---------------------------------------------------------------------------
  // Data fetch
  // ---------------------------------------------------------------------------

  async function fetchDocuments() {
    if (!activeCompany?.id) return;
    setLoading(true);
    try {
      const { data, error } = await sajilo.auth.supabase
        .from('EmployeeDocument')
        .select('*, Employee(full_name, employee_code)')
        .eq('company_id', activeCompany.id)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setDocuments(data ?? []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompany?.id]);

  // ---------------------------------------------------------------------------
  // Derived / filtered data
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    const monthStart = thisMonthStart();
    return documents.filter((doc) => {
      // Search by employee name or code
      const name = doc.Employee?.full_name?.toLowerCase() ?? '';
      const code = doc.Employee?.employee_code?.toLowerCase() ?? '';
      const query = search.toLowerCase();
      if (query && !name.includes(query) && !code.includes(query)) return false;

      // Document type
      if (docTypeFilter !== 'all' && doc.document_type !== docTypeFilter) return false;

      // Date range — from
      if (fromDate && doc.uploaded_at < fromDate) return false;

      // Date range — to (inclusive: compare up to end of day)
      if (toDate) {
        const endOfDay = `${toDate}T23:59:59`;
        if (doc.uploaded_at > endOfDay) return false;
      }

      return true;
    });
  }, [documents, search, docTypeFilter, fromDate, toDate]);

  // Stats (computed from full unfiltered list)
  const stats = useMemo(() => {
    const monthStart = thisMonthStart();
    const distinctEmployees = new Set(documents.map((d) => d.employee_id)).size;
    const thisMonth = documents.filter((d) => d.uploaded_at >= monthStart).length;
    return {
      total: documents.length,
      distinctEmployees,
      thisMonth,
    };
  }, [documents]);

  // ---------------------------------------------------------------------------
  // View / Download helpers
  // ---------------------------------------------------------------------------

  async function handleView(doc) {
    setActionLoading((prev) => ({ ...prev, [doc.id]: 'view' }));
    try {
      const { data, error } = await sajilo.auth.supabase.storage
        .from('employee_kyc')
        .createSignedUrl(doc.file_url, 3600);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      console.error(err);
      toast.error('Could not generate view link');
    } finally {
      setActionLoading((prev) => ({ ...prev, [doc.id]: null }));
    }
  }

  async function handleDownload(doc) {
    setActionLoading((prev) => ({ ...prev, [doc.id]: 'download' }));
    try {
      const { data, error } = await sajilo.auth.supabase.storage
        .from('employee_kyc')
        .createSignedUrl(doc.file_url, 3600);

      if (error) throw error;

      // Trigger browser download via a temporary anchor
      const anchor = document.createElement('a');
      anchor.href = data.signedUrl;
      anchor.download = doc.file_name ?? 'document';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (err) {
      console.error(err);
      toast.error('Could not generate download link');
    } finally {
      setActionLoading((prev) => ({ ...prev, [doc.id]: null }));
    }
  }

  // ---------------------------------------------------------------------------
  // Table column definitions
  // ---------------------------------------------------------------------------

  const columns = [
    {
      key: 'employee',
      label: 'Employee',
      render: (_, doc) => (
        <div className="flex flex-col">
          <span className="font-medium text-sm">{doc.Employee?.full_name ?? '—'}</span>
          <span className="text-xs text-muted-foreground">{doc.Employee?.employee_code ?? ''}</span>
        </div>
      ),
    },
    {
      key: 'document_type',
      label: 'Document Type',
      render: (_, doc) => (
        <Badge
          variant="outline"
          className={`text-xs font-medium ${docTypeBadgeClass(doc.document_type)}`}
        >
          {doc.document_type ?? 'Other'}
        </Badge>
      ),
    },
    {
      key: 'file_name',
      label: 'File Name',
      render: (_, doc) => (
        <div className="flex items-center gap-2 max-w-[220px]">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm" title={doc.file_name}>
            {doc.file_name ?? '—'}
          </span>
        </div>
      ),
    },
    {
      key: 'uploaded_at',
      header: 'Uploaded At',
      render: (_, doc) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatDate(doc.uploaded_at)}
        </span>
      ),
    },
    {
      key: 'file_size',
      header: 'File Size',
      render: (_, doc) => (
        <span className="text-sm text-muted-foreground">
          {formatSize(doc.file_size)}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, doc) => (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={actionLoading[doc.id] === 'view'}
            onClick={() => handleView(doc)}
          >
            <Eye className="h-3.5 w-3.5" />
            {actionLoading[doc.id] === 'view' ? 'Opening…' : 'View'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            disabled={actionLoading[doc.id] === 'download'}
            onClick={() => handleDownload(doc)}
          >
            <Download className="h-3.5 w-3.5" />
            {actionLoading[doc.id] === 'download' ? 'Downloading…' : 'Download'}
          </Button>
        </div>
      ),
    },
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Page Header */}
      <PageHeader
        title="HR Documents"
        subtitle="Centralized vault for all employee KYC and compliance documents"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={FileText}
          label="Total Documents"
          value={stats.total}
          colorClass="bg-blue-50 text-blue-600"
        />
        <StatCard
          icon={Users}
          label="Employees with Documents"
          value={stats.distinctEmployees}
          colorClass="bg-violet-50 text-violet-600"
        />
        <StatCard
          icon={CalendarDays}
          label="Documents This Month"
          value={stats.thisMonth}
          colorClass="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by employee name or code…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Document Type */}
        <div className="flex items-center gap-2 min-w-[190px]">
          <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Range — From */}
        <div className="flex flex-col gap-1 min-w-[145px]">
          <label className="text-xs text-muted-foreground font-medium">From</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        {/* Date Range — To */}
        <div className="flex flex-col gap-1 min-w-[145px]">
          <label className="text-xs text-muted-foreground font-medium">To</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9 text-sm"
          />
        </div>

        {/* Clear filters */}
        {(search || docTypeFilter !== 'all' || fromDate || toDate) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-muted-foreground"
            onClick={() => {
              setSearch('');
              setDocTypeFilter('all');
              setFromDate('');
              setToDate('');
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Result count hint */}
      {!loading && (
        <p className="text-xs text-muted-foreground -mt-2">
          Showing <span className="font-medium text-foreground">{filtered.length}</span> of{' '}
          <span className="font-medium text-foreground">{documents.length}</span> documents
        </p>
      )}

      {/* Data Table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          emptyMessage={
            documents.length === 0
              ? 'No documents have been uploaded yet.'
              : 'No documents match the current filters.'
          }
        />
      </div>
    </div>
  );
}
