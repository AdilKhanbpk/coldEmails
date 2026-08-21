'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, ListChecks, Loader2, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { SkeletonTable } from '@/components/skeletons';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { cn } from '@/lib/utils';

interface OutreachType {
  id: string;
  name: string;
  systemPrompt: string;
  exampleEmails: string[];
  sequenceSteps: { stepNumber: number; delayDays: number }[];
  active: boolean;
  createdAt: string;
  _count?: { leads: number };
}

// ─── Small presentational helpers ──────────────────────────────────────────

function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <Badge className="border-transparent bg-emerald-50 text-emerald-700">Active</Badge>
  ) : (
    <Badge variant="outline" className="border-gray-200 text-gray-500">
      Inactive
    </Badge>
  );
}

function PageHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-gray-500">
          The AI prompt, example emails, and sequence steps behind each campaign.
        </p>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function OutreachTypesClient() {
  const router = useRouter();
  const [types, setTypes] = useState<OutreachType[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<OutreachType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach-types');
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTypes(data);
    } catch {
      toast.error('Failed to load outreach types.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  const goToCreate = () => router.push('/outreach-types/new');
  const goToEdit = (id: string) => router.push(`/outreach-types/${id}/edit`);

  const handleToggle = async (id: string, currentActive: boolean) => {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/outreach-types/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to toggle.');
        return;
      }
      setTypes((prev) =>
        prev.map((t) => (t.id === id ? { ...t, active: !currentActive } : t)),
      );
      toast.success(!currentActive ? 'Outreach type activated.' : 'Outreach type deactivated.');
    } catch {
      toast.error('Failed to toggle.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/outreach-types/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete.');
        return;
      }
      setTypes((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      toast.success('Outreach type deleted.');
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader onCreate={goToCreate} />
        <SkeletonTable rows={5} />
      </div>
    );
  }

  if (types.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader onCreate={goToCreate} />
        <Card className="border-dashed border-gray-200 bg-white shadow-sm">
          <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
              <ListChecks className="h-7 w-7 text-blue-600" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-gray-900">No outreach types yet</h3>
            <p className="mt-2 max-w-md text-sm text-gray-500">
              Outreach types define the AI prompt, example emails, and sequence steps for your
              campaigns. Create your first one to get started.
            </p>
            <Button className="mt-6 bg-blue-600 hover:bg-blue-700" onClick={goToCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first outreach type
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader onCreate={goToCreate} />

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 hover:bg-gray-50">
                <TableHead className="w-[280px]">Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Leads assigned</TableHead>
                <TableHead>Sequence steps</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium text-gray-900">{t.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Switch
                        checked={t.active}
                        disabled={togglingId === t.id}
                        onCheckedChange={() => handleToggle(t.id, t.active)}
                        aria-label={`${t.active ? 'Deactivate' : 'Activate'} ${t.name}`}
                      />
                      {togglingId === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                      ) : (
                        <StatusPill active={t.active} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-gray-600">{t._count?.leads ?? 0}</TableCell>
                  <TableCell className="text-gray-600">
                    {t.sequenceSteps.length} step{t.sequenceSteps.length !== 1 ? 's' : ''}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-gray-500">
                    {format(new Date(t.createdAt), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => goToEdit(t.id)}
                        className="h-8 w-8 text-gray-500 hover:text-gray-900"
                        aria-label={`Edit ${t.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(t)}
                        className="h-8 w-8 text-gray-500 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${t.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="space-y-2.5 md:hidden">
        {types.map((t) => (
          <Card key={t.id} className="border-gray-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                      t.active ? 'bg-blue-50' : 'bg-gray-100',
                    )}
                  >
                    <Layers
                      className={cn('h-5 w-5', t.active ? 'text-blue-600' : 'text-gray-400')}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">{t.name}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      {togglingId === t.id ? (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Updating…
                        </span>
                      ) : (
                        <StatusPill active={t.active} />
                      )}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={t.active}
                  disabled={togglingId === t.id}
                  onCheckedChange={() => handleToggle(t.id, t.active)}
                  aria-label={`${t.active ? 'Deactivate' : 'Activate'} ${t.name}`}
                  className="shrink-0"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>
                  <span className="font-medium text-gray-700">{t._count?.leads ?? 0}</span> leads
                  assigned
                </span>
                <span>
                  <span className="font-medium text-gray-700">{t.sequenceSteps.length}</span>{' '}
                  step{t.sequenceSteps.length !== 1 ? 's' : ''}
                </span>
                <span>Created {format(new Date(t.createdAt), 'MMM d, yyyy')}</span>
              </div>

              <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 border-gray-200"
                  onClick={() => goToEdit(t.id)}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 border-gray-200 text-red-600 hover:bg-red-50 hover:text-red-600"
                  onClick={() => setDeleteTarget(t)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete outreach type?"
        description={
          deleteTarget && (deleteTarget._count?.leads ?? 0) > 0
            ? `${deleteTarget._count?.leads} ${deleteTarget._count?.leads === 1 ? 'lead is' : 'leads are'} currently assigned to this type. You must deactivate instead of deleting.`
            : `This will permanently delete "${deleteTarget?.name}" and its configuration. This cannot be undone.`
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}