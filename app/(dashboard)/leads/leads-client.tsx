'use client';

import { useState, useEffect, useCallback } from 'react';
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
import { Users, Plus, Upload, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { StatusBadge, ReplyTagBadge } from '@/components/status-badge';
import { SkeletonTable } from '@/components/skeletons';
import { ConfirmDialog } from '@/components/confirm-dialog';

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

interface OutreachTypeOption {
  id: string;
  name: string;
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

import { useDashboard } from '@/app/(dashboard)/DashboardContext';

export function LeadsClient() {
  const { outreachTypes } = useDashboard();
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  if (loading && leads.length === 0) {
    return <SkeletonTable rows={8} />;
  }

  if (total === 0 && !loading) {
    return (
      <div className="rounded-lg border border-gray-200 border-dashed bg-white shadow-sm">
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <Users className="h-7 w-7 text-blue-600" />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-gray-900">No leads yet</h3>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            Add leads manually or import from a CSV/Excel file to start your outreach campaigns.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/leads/new">
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" />
                Add lead manually
              </Button>
            </Link>
            <Link href="/leads/import">
              <Button variant="outline" className="border-gray-200">
                <Upload className="mr-2 h-4 w-4" />
                Import from file
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap mt-2 gap-3">
        <Select value={filters.status} onValueChange={(v) => handleFilterChange('status', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[160px] border-gray-200">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.outreachTypeId} onValueChange={(v) => handleFilterChange('outreachTypeId', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[180px] border-gray-200">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outreach types</SelectItem>
            {outreachTypes.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.source} onValueChange={(v) => handleFilterChange('source', v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[140px] border-gray-200">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Filter by country..."
          value={filters.country}
          onChange={(e) => handleFilterChange('country', e.target.value)}
          className="w-[160px] border-gray-200"
        />
        <div className=" flex flex-col gap-3 sm:flex-row">
            <Link href="/leads/new">
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" />
                Add lead manually
              </Button>
            </Link>
            <Link href="/leads/import">
              <Button variant="outline" className="border-gray-200">
                <Upload className="mr-2 h-4 w-4" />
                Import from file
              </Button>
            </Link>
          </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>
                <button onClick={() => handleSort('companyName')} className="flex items-center gap-1 hover:text-gray-900">
                  Company <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Outreach Type</TableHead>
              <TableHead>
                <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-gray-900">
                  Status <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>Step</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Preferred time</TableHead>
              <TableHead>
                <button onClick={() => handleSort('createdAt')} className="flex items-center gap-1 hover:text-gray-900">
                  Created <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow key={lead.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/leads/${lead.id}`)}>
                <TableCell className="font-medium text-gray-900">{lead.companyName}</TableCell>
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
                <TableCell className="text-gray-600">{lead.currentStep}</TableCell>
                <TableCell className="text-gray-600">{SOURCE_LABELS[lead.source] || lead.source}</TableCell>
                <TableCell className="text-gray-500">
                  {format(new Date(lead.preferredTime), 'MMM d, yyyy HH:mm')}
                </TableCell>
                <TableCell className="text-gray-500">
                  {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card List */}
      <div className="space-y-3 md:hidden">
        {leads.map((lead) => (
          <div
            key={lead.id}
            onClick={() => router.push(`/leads/${lead.id}`)}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm cursor-pointer hover:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <p className="font-medium text-gray-900">{lead.companyName}</p>
              <StatusBadge status={lead.status} />
            </div>
            <p className="mt-1 text-sm text-gray-500">{lead.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
              {lead.outreachType && <span>{lead.outreachType.name}</span>}
              <span>· Step {lead.currentStep}</span>
              <span>· {SOURCE_LABELS[lead.source] || lead.source}</span>
              <ReplyTagBadge tag={lead.replyTag} />
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {total} lead{total !== 1 ? 's' : ''} total
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="border-gray-200"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="border-gray-200"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

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
