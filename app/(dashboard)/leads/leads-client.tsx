'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Users,
  Plus,
  Upload,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  X,
  SearchX,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { StatusBadge, ReplyTagBadge } from '@/components/status-badge';
import { SkeletonTable } from '@/components/skeletons';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { cn } from '@/lib/utils';

interface Lead {
  id: string;
  companyName: string;
  email: string;
  country: string;
  status: string;
  replyTag: string | null;
  currentStep: number;
  source: string;
  preferredTime: string;
  createdAt: string;
  outreachType: { id: string; name: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  REPLIED: 'Replied',
  MEETING_BOOKED: 'Meeting booked',
  COMPLETED: 'Completed',
  BOUNCED: 'Bounced',
  UNSUBSCRIBED: 'Unsubscribed',
  NOT_INTERESTED: 'Not interested',
};

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  CSV: 'CSV',
  API: 'API',
  ZOOMINFO: 'ZoomInfo',
  APOLLO: 'Apollo',
};

type SortField = 'companyName' | 'status' | 'createdAt';

import { useDashboard } from '@/app/(dashboard)/DashboardContext';

// ─── Small presentational helpers ──────────────────────────────────────────

function SortIcon({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="h-3.5 w-3.5 text-gray-300" />;
  return order === 'asc' ? (
    <ArrowUp className="h-3.5 w-3.5 text-blue-600" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
  );
}

function SortableHead({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
}: {
  label: string;
  field: SortField;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
}) {
  const active = sortBy === field;
  return (
    <TableHead aria-sort={active ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        onClick={() => onSort(field)}
        className={cn(
          'flex items-center gap-1.5 rounded transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1',
          active ? 'font-medium text-gray-900' : 'text-gray-500 hover:text-gray-900',
        )}
      >
        {label}
        <SortIcon active={active} order={sortOrder} />
      </button>
    </TableHead>
  );
}

const ADD_LEAD_ACTIONS = (
  <div className="flex flex-col gap-2 sm:flex-row">
    <Link href="/leads/import" className="sm:order-1">
      <Button variant="outline" className="w-full border-gray-200 sm:w-auto">
        <Upload className="mr-2 h-4 w-4" />
        Import from file
      </Button>
    </Link>
    <Link href="/leads/new" className="sm:order-2">
      <Button className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto">
        <Plus className="mr-2 h-4 w-4" />
        Add lead
      </Button>
    </Link>
  </div>
);

// ─── Main component ─────────────────────────────────────────────────────────

export function LeadsClient() {
  const { outreachTypes } = useDashboard();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [filters, setFilters] = useState({
    status: '',
    outreachTypeId: '',
    country: '',
    source: '',
  });

  // Country is a free-text field — debounce it so we don't fire a request
  // on every keystroke.
  const [countryInput, setCountryInput] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => {
        if (prev.country === countryInput) return prev;
        return { ...prev, country: countryInput };
      });
      setPage(1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryInput]);

  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);

  const hasActiveFilters = Boolean(
    filters.status || filters.outreachTypeId || filters.country || filters.source,
  );

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        sortBy,
        sortOrder,
      });
      if (filters.status) params.set('status', filters.status);
      if (filters.outreachTypeId) params.set('outreachTypeId', filters.outreachTypeId);
      if (filters.country) params.set('country', filters.country);
      if (filters.source) params.set('source', filters.source);

      const res = await fetch(`/api/leads?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLeads(data.leads);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch {
      toast.error('Failed to load leads.');
    } finally {
      setLoading(false);
      setInitialLoadDone(true);
    }
  }, [page, sortBy, sortOrder, filters]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ status: '', outreachTypeId: '', country: '', source: '' });
    setCountryInput('');
    setPage(1);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/leads/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Lead deleted.');
      setDeleteTarget(null);
      fetchLeads();
    } catch {
      toast.error('Failed to delete lead.');
    } finally {
      setDeleting(false);
    }
  };

  const rowNavProps = (lead: Lead) => ({
    onClick: () => router.push(`/leads/${lead.id}`),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        router.push(`/leads/${lead.id}`);
      }
    },
    tabIndex: 0,
    role: 'button' as const,
    'aria-label': `View ${lead.companyName}`,
  });

  // True empty state: no leads exist at all, and no filters are applied.
  const isTrulyEmpty = initialLoadDone && !loading && total === 0 && !hasActiveFilters;
  // Filters produced zero matches — different from having no leads at all.
  const isFilteredEmpty = initialLoadDone && !loading && total === 0 && hasActiveFilters;

  if (loading && !initialLoadDone) {
    return (
      <div className="space-y-5">
        <PageHeader total={null} showActions />
        <SkeletonTable rows={8} />
      </div>
    );
  }

  if (isTrulyEmpty) {
    return (
      <div className="space-y-5">
        <PageHeader total={0} />
        <div className="rounded-lg border border-dashed border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
              <Users className="h-7 w-7 text-blue-600" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-gray-900">No leads yet</h3>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              Add leads manually or import from a CSV/Excel file to start your outreach
              campaigns.
            </p>
            <div className="mt-6">{ADD_LEAD_ACTIONS}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader total={total} showActions />

      {/* Filters */}
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <Select
            value={filters.status || 'all'}
            onValueChange={(v) => handleFilterChange('status', v === 'all' ? '' : v)}
          >
            <SelectTrigger className="w-full border-gray-200 sm:w-[160px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.outreachTypeId || 'all'}
            onValueChange={(v) => handleFilterChange('outreachTypeId', v === 'all' ? '' : v)}
          >
            <SelectTrigger className="w-full border-gray-200 sm:w-[180px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outreach types</SelectItem>
              {outreachTypes.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.source || 'all'}
            onValueChange={(v) => handleFilterChange('source', v === 'all' ? '' : v)}
          >
            <SelectTrigger className="w-full border-gray-200 sm:w-[140px]">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative col-span-2 sm:w-[180px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Filter by country..."
              value={countryInput}
              onChange={(e) => setCountryInput(e.target.value)}
              className="border-gray-200 pl-8 focus-visible:ring-blue-500"
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="col-span-2 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:col-span-1 sm:ml-auto sm:justify-start sm:px-2"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {isFilteredEmpty ? (
        <div className="rounded-lg border border-dashed border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <SearchX className="h-7 w-7 text-gray-400" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-gray-900">No leads match your filters</h3>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              Try adjusting or clearing your filters to see more results.
            </p>
            <Button variant="outline" className="mt-6 border-gray-200" onClick={clearFilters}>
              <X className="mr-2 h-4 w-4" />
              Clear filters
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div
            className={cn(
              'hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-opacity duration-150 md:block',
              loading && 'opacity-60',
            )}
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 hover:bg-gray-50">
                    <SortableHead
                      label="Company"
                      field="companyName"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <TableHead>Email</TableHead>
                    <TableHead>Outreach type</TableHead>
                    <SortableHead
                      label="Status"
                      field="status"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                    <TableHead className="text-center">Step</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Preferred time</TableHead>
                    <SortableHead
                      label="Created"
                      field="createdAt"
                      sortBy={sortBy}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                    />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className="cursor-pointer transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                      {...rowNavProps(lead)}
                    >
                      <TableCell className="font-medium text-gray-900">
                        {lead.companyName}
                      </TableCell>
                      <TableCell className="text-gray-600">{lead.email}</TableCell>
                      <TableCell className="text-gray-600">
                        {lead.outreachType?.name || <span className="text-gray-400">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <StatusBadge status={lead.status} />
                          <ReplyTagBadge tag={lead.replyTag} />
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-gray-600">
                        {lead.currentStep}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {SOURCE_LABELS[lead.source] || lead.source}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-gray-500">
                        {format(new Date(lead.preferredTime), 'MMM d, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-gray-500">
                        {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Mobile card list */}
          <div
            className={cn(
              'space-y-2.5 transition-opacity duration-150 md:hidden',
              loading && 'opacity-60',
            )}
          >
            {leads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                {...rowNavProps(lead)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-medium text-gray-900">{lead.companyName}</p>
                    <StatusBadge status={lead.status} />
                  </div>
                  <p className="mt-0.5 truncate text-sm text-gray-500">{lead.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400">
                    {lead.outreachType && <span>{lead.outreachType.name}</span>}
                    <span>Step {lead.currentStep}</span>
                    <span>{SOURCE_LABELS[lead.source] || lead.source}</span>
                    <ReplyTagBadge tag={lead.replyTag} />
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <p className="flex items-center gap-2 text-sm text-gray-500">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
              {total} lead{total !== 1 ? 's' : ''} total
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="border-gray-200"
              >
                <ChevronLeft className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
                className="border-gray-200"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4 sm:ml-1" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete lead?"
        description={`This will permanently delete ${deleteTarget?.companyName || 'this lead'} and its conversation history. This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ─── Page header ────────────────────────────────────────────────────────────

function PageHeader({ total, showActions }: { total: number | null; showActions?: boolean }) {
  return (
    <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Leads</h1>
        <p className="text-sm text-gray-500">
          {total === null ? 'Loading your leads…' : `${total} lead${total !== 1 ? 's' : ''} total`}
        </p>
      </div>
      {showActions && ADD_LEAD_ACTIONS}
    </div>
  );
}