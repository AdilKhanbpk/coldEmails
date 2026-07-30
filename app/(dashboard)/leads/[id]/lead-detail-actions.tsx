'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function LeadDetailActions({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Failed to delete lead.');
        setDeleting(false);
        return;
      }
      toast.success('Lead deleted.');
      router.push('/leads');
      router.refresh();
    } catch {
      toast.error('Failed to delete lead.');
      setDeleting(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Link href={`/leads/${leadId}/edit`}>
        <Button variant="outline" size="sm" className="border-gray-200">
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </Button>
      </Link>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowDelete(true)}
        className="border-gray-200 text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete
      </Button>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this lead?</DialogTitle>
            <DialogDescription>
              This will permanently remove the lead and all associated data.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)} className="border-gray-200">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
