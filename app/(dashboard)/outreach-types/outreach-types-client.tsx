'use client';

import { useState, useEffect } from 'react';
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
import { useOutreachTypes } from '@/app/(dashboard)/contexts/OutreachTypesContext';
import type { OutreachType } from '@/app/(dashboard)/contexts/OutreachTypesContext';

// ─── Small presentational helpers ──────────────────────────────────────────

function StatusPill({ active }: { active: boolean }) {
  return active ? (
    <Badge className="border-transparent bg-emerald-50 text-emerald-700">Active</Badge>
  ) : (
    <Badge variant="outline" className="border-stone-200 text-stone-500">
      Inactive
    </Badge>
  );
}

function PageHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-stone-500">
          The AI prompt, example emails, and sequence steps behind each campaign.
        </p>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function OutreachTypesClient() {
  const router = useRouter();
  const { 
    outreachTypes: contextTypes, 
    loading, 
    fetchOutreachTypes, 
    updateOutreachType,
    deleteOutreachType: contextDeleteOutreachType
  } = useOutreachTypes();
  
  const [deleteTarget, setDeleteTarget] = useState<OutreachType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Fetch types on mount (will use cache if available)
  useEffect(() => {
    fetchOutreachTypes();
  }, [fetchOutreachTypes]);

  const types = contextTypes || [];

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
      // Update context cache
      updateOutreachType(id, { active: !currentActive });
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
      // Update context cache
      contextDeleteOutreachType(deleteTarget.id);
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
        <Card className="rounded-2xl border-dashed border-stone-200 bg-white shadow-none">
          <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F3E7DE]">
              <ListChecks className="h-6 w-6 text-[#C1613F]" strokeWidth={1.75} />
            </div>
            <h3 className="mt-5 font-serif text-lg font-medium text-stone-900">No outreach types yet</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-500">
              Outreach types define the AI prompt, example emails, and sequence steps for your
              campaigns. Create your first one to get started.
            </p>
            <Button className="mt-6 rounded-full bg-[#C1613F] text-white hover:bg-[#A94F31]" onClick={goToCreate}>
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
      <div className="hidden overflow-hidden rounded-2xl border border-stone-200 bg-white md:block">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-stone-200 bg-stone-50 hover:bg-stone-50">
                <TableHead className="w-[280px] text-stone-500">Name</TableHead>
                <TableHead className="text-stone-500">Status</TableHead>
                <TableHead className="text-stone-500">Leads assigned</TableHead>
                <TableHead className="text-stone-500">Sequence steps</TableHead>
                <TableHead className="text-stone-500">Created</TableHead>
                <TableHead className="text-right text-stone-500">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id} className="border-stone-200 hover:bg-stone-50">
                  <TableCell className="font-medium text-stone-900">{t.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Switch
                        checked={t.active}
                        disabled={togglingId === t.id}
                        onCheckedChange={() => handleToggle(t.id, t.active ?? false)}
                        aria-label={`${t.active ? 'Deactivate' : 'Activate'} ${t.name}`}
                        className="data-[state=checked]:bg-[#C1613F]"
                      />
                      {togglingId === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-400" />
                      ) : (
                        <StatusPill active={t.active ?? false} />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-stone-600">{t._count?.leads ?? 0}</TableCell>
                  <TableCell className="text-stone-600">
                    {t.sequenceSteps?.length ?? 0} step{(t.sequenceSteps?.length ?? 0) !== 1 ? 's' : ''}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-stone-500">
                    {t.createdAt && format(new Date(t.createdAt), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => goToEdit(t.id)}
                        className="h-8 w-8 rounded-full text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                        aria-label={`Edit ${t.name}`}
                      >
                        <Pencil className="h-4 w-4" strokeWidth={1.75} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(t)}
                        className="h-8 w-8 rounded-full text-stone-500 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Delete ${t.name}`}
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
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
          <Card key={t.id} className="rounded-2xl border-stone-200 bg-white shadow-none">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                      t.active ? 'bg-[#F3E7DE]' : 'bg-stone-100',
                    )}
                  >
                    <Layers
                      className={cn('h-5 w-5', t.active ? 'text-[#C1613F]' : 'text-stone-400')}
                      strokeWidth={1.75}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-stone-900">{t.name}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      {togglingId === t.id ? (
                        <span className="flex items-center gap-1 text-xs text-stone-400">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Updating…
                        </span>
                      ) : (
                        <StatusPill active={t.active ?? false} />
                      )}
                    </div>
                  </div>
                </div>
                <Switch
                  checked={t.active}
                  disabled={togglingId === t.id}
                  onCheckedChange={() => handleToggle(t.id, t.active ?? false)}
                  aria-label={`${t.active ? 'Deactivate' : 'Activate'} ${t.name}`}
                  className="shrink-0 data-[state=checked]:bg-[#C1613F]"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                <span>
                  <span className="font-medium text-stone-700">{t._count?.leads ?? 0}</span> leads
                  assigned
                </span>
                <span>
                  <span className="font-medium text-stone-700">{t.sequenceSteps?.length ?? 0}</span>{' '}
                  step{(t.sequenceSteps?.length ?? 0) !== 1 ? 's' : ''}
                </span>
                {t.createdAt && <span>Created {format(new Date(t.createdAt), 'MMM d, yyyy')}</span>}
              </div>

              <div className="mt-3 flex gap-2 border-t border-stone-100 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 rounded-full border-stone-200 text-stone-700 hover:bg-stone-50"
                  onClick={() => goToEdit(t.id)}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 rounded-full border-stone-200 text-red-600 hover:bg-red-50 hover:text-red-600"
                  onClick={() => setDeleteTarget(t)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" strokeWidth={1.75} />
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