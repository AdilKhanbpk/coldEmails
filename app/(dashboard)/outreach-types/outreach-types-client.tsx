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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, ListChecks, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { SkeletonTable } from '@/components/skeletons';
import { ConfirmDialog } from '@/components/confirm-dialog';

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

export default function OutreachTypesClient() {
  const router = useRouter();
  const [types, setTypes] = useState<OutreachType[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<OutreachType | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleToggle = async (id: string, currentActive: boolean) => {
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
    return <SkeletonTable rows={5} />;
  }

  if (types.length === 0) {
    return (
      <Card className="border-gray-200 border-dashed bg-white shadow-sm">
        <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <ListChecks className="h-7 w-7 text-blue-600" />
          </div>
          <h3 className="mt-5 text-lg font-semibold text-gray-900">No outreach types yet</h3>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            Outreach types define the AI prompt, example emails, and sequence steps
            for your campaigns. Create your first one to get started.
          </p>
          <Button
            className="mt-6 bg-blue-600 hover:bg-blue-700"
            onClick={() => router.push('/outreach-types/new')}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create your first Outreach Type
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="w-[300px]">Name</TableHead>
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
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={t.active}
                      onCheckedChange={() => handleToggle(t.id, t.active)}
                    />
                    {t.active ? (
                      <Badge className="border-transparent bg-blue-50 text-blue-700">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-gray-500 border-gray-200">Inactive</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-gray-600">{t._count?.leads ?? 0}</TableCell>
                <TableCell className="text-gray-600">
                  {t.sequenceSteps.length} step{t.sequenceSteps.length !== 1 ? 's' : ''}
                </TableCell>
                <TableCell className="text-gray-500">
                  {format(new Date(t.createdAt), 'MMM d, yyyy')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => router.push(`/outreach-types/${t.id}/edit`)}
                      className="h-8 w-8 text-gray-500 hover:text-gray-900"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(t)}
                      className="h-8 w-8 text-gray-500 hover:text-red-600"
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
    </>
  );
}
