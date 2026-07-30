'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Trash2, ArrowLeft, Loader2, AlertTriangle, Eye, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { InfoTooltip } from '@/components/info-tooltip';
import { Breadcrumbs } from '@/components/breadcrumbs';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SequenceStep {
  stepNumber: number;
  delayDays: number;
}

interface OutreachTypeFormProps {
  mode: 'create' | 'edit';
  typeId?: string;
  initialData?: {
    name: string;
    systemPrompt: string;
    exampleEmails: string[];
    sequenceSteps: SequenceStep[];
    active: boolean;
  };
}

export function OutreachTypeForm({ mode, typeId, initialData }: OutreachTypeFormProps) {
  const router = useRouter();
  const isEdit = mode === 'edit';

  const [name, setName] = useState(initialData?.name || '');
  const [systemPrompt, setSystemPrompt] = useState(initialData?.systemPrompt || '');
  const [exampleEmails, setExampleEmails] = useState<string[]>(
    initialData?.exampleEmails || ['', '', '', ''],
  );
  const [sequenceSteps, setSequenceSteps] = useState<SequenceStep[]>(
    initialData?.sequenceSteps || [{ stepNumber: 1, delayDays: 0 }],
  );
  const [active, setActive] = useState(initialData?.active ?? true);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showEditWarning, setShowEditWarning] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);

  const updateExampleEmail = (index: number, value: string) => {
    setExampleEmails((prev) => prev.map((e, i) => (i === index ? value : e)));
  };

  const addStep = () => {
    setSequenceSteps((prev) => [
      ...prev,
      { stepNumber: prev.length + 1, delayDays: 3 },
    ]);
  };

  const removeStep = (index: number) => {
    setSequenceSteps((prev) => {
      if (prev.length <= 1) return prev;
      return prev
        .filter((_, i) => i !== index)
        .map((s, i) => ({ ...s, stepNumber: i + 1 }));
    });
  };

  const updateStepDelay = (index: number, delayDays: number) => {
    setSequenceSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, delayDays } : s)),
    );
  };

  const validate = (): boolean => {
    if (!name.trim()) {
      toast.error('Name is required.');
      return false;
    }
    if (!systemPrompt.trim()) {
      toast.error('AI instructions are required.');
      return false;
    }
    const allEmailsFilled = exampleEmails.every((e) => e.trim());
    if (!allEmailsFilled) {
      toast.error('All four example emails are required to save as active.');
      return false;
    }
    if (sequenceSteps.length === 0) {
      toast.error('At least one sequence step is required.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    // On edit, show a warning before saving changes to systemPrompt or example emails.
    if (isEdit && !showEditWarning) {
      setShowEditWarning(true);
      return;
    }

    setLoading(true);

    const payload = {
      name: name.trim(),
      systemPrompt: systemPrompt.trim(),
      exampleEmails: exampleEmails.map((e) => e.trim()),
      sequenceSteps: sequenceSteps.map((s, i) => ({
        stepNumber: i + 1,
        delayDays: s.delayDays,
      })),
      active,
    };

    try {
      const url = isEdit ? `/api/outreach-types/${typeId}` : '/api/outreach-types';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to save.');
        setLoading(false);
        return;
      }

      toast.success(isEdit ? 'Outreach type updated.' : 'Outreach type created.');
      router.push('/outreach-types');
      router.refresh();
    } catch {
      toast.error('Something went wrong.');
      setLoading(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSequenceSteps((prev) => {
      const oldIndex = parseInt(String(active.id).replace('step-', ''));
      const newIndex = parseInt(String(over.id).replace('step-', ''));
      return arrayMove(prev, oldIndex, newIndex).map((s, i) => ({
        ...s,
        stepNumber: i + 1,
      }));
    });
  };

  // Handle the edit warning confirmation
  useEffect(() => {
    if (showEditWarning && pendingSubmit) {
      setPendingSubmit(false);
      handleSubmit(new Event('submit') as unknown as React.FormEvent);
    }
  }, [showEditWarning, pendingSubmit]);

  return (
    <>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6">
          <Breadcrumbs items={[
            { label: 'Outreach Types', href: '/outreach-types' },
            { label: isEdit ? 'Edit' : 'Create' },
          ]} />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-gray-900">
            {isEdit ? 'Edit Outreach Type' : 'Create Outreach Type'}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Name</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="e.g. SaaS Founders Outreach"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* System Prompt */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">AI Instructions</CardTitle>
              <p className="text-sm text-gray-500">
                Tell the AI how to write emails for this outreach type. Include your goals,
                tone preferences, and any constraints.
              </p>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="e.g. You are writing cold outreach emails to SaaS founders. Keep emails concise, friendly, and focused on one value proposition. Always include a clear call-to-action..."
                rows={5}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* Example Emails */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-1.5">
                Example Emails
                <InfoTooltip content="Four examples give the AI enough variety to learn your tone, structure, and length without copying any single email verbatim." />
              </CardTitle>
              <p className="text-sm text-gray-500">
                The AI studies these four real emails to match your tone, structure, and
                length — it will not copy them, only learn the style.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {exampleEmails.map((email, i) => (
                <div key={i} className="space-y-1.5">
                  <Label htmlFor={`example-${i}`}>Example Email {i + 1}</Label>
                  <Textarea
                    id={`example-${i}`}
                    placeholder={`Paste a real email that represents the style you want — Example ${i + 1}`}
                    rows={5}
                    value={email}
                    onChange={(e) => updateExampleEmail(i, e.target.value)}
                  />
                </div>
              ))}
              <div className="flex items-center gap-2 rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                All four example emails are required before this outreach type can be saved as active.
              </div>
            </CardContent>
          </Card>

          {/* Sequence Steps */}
          <Card className="border-gray-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-1.5">
                Sequence Steps
                <InfoTooltip content="Each step sends after the specified delay in days from the previous step. Drag steps to reorder — step numbers update automatically." />
              </CardTitle>
              <p className="text-sm text-gray-500">
                Define the follow-up cadence. Each step sends after the specified delay in days.
                The first step (Day 0) is the initial email.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sequenceSteps.map((_, i) => `step-${i}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {sequenceSteps.map((step, i) => (
                    <SortableStep
                      key={`step-${i}`}
                      id={`step-${i}`}
                      stepNumber={i + 1}
                      delayDays={step.delayDays}
                      onDelayChange={(d) => updateStepDelay(i, d)}
                      onRemove={() => removeStep(i)}
                      canRemove={sequenceSteps.length > 1}
                    />
                  ))}
                </SortableContext>
              </DndContext>
              <Button
                type="button"
                variant="outline"
                onClick={addStep}
                className="border-gray-200"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add step
              </Button>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPreview(true)}
              className="border-gray-200"
            >
              <Eye className="mr-2 h-4 w-4" />
              Preview example emails
            </Button>
            <div className="flex gap-3">
              <Link href="/outreach-types">
                <Button type="button" variant="outline" className="border-gray-200">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {isEdit ? 'Save changes' : 'Create outreach type'}
              </Button>
            </div>
          </div>
        </form>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Example Email Preview</DialogTitle>
            <DialogDescription>
              This is how your four example emails look. Real AI-generated previews come in a later stage.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {exampleEmails.map((email, i) => (
              <div key={i} className="rounded-lg border border-gray-200 p-4">
                <p className="mb-2 text-sm font-medium text-gray-900">Example Email {i + 1}</p>
                <div className="whitespace-pre-wrap text-sm text-gray-600 min-h-[100px]">
                  {email.trim() || (
                    <span className="text-gray-400 italic">Not yet filled in</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {/* TODO: In a later stage, this preview button will call the AI to generate
              a sample email based on the systemPrompt + exampleEmails + the user's
              business profile, showing a side-by-side comparison of the AI output
              alongside the real examples. For now, this is a static UI preview only. */}
          <DialogFooter>
            <Button onClick={() => setShowPreview(false)} className="bg-blue-600 hover:bg-blue-700">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Warning Dialog */}
      <Dialog open={showEditWarning} onOpenChange={setShowEditWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm changes
            </DialogTitle>
            <DialogDescription>
              This will only affect emails sent from now on. Already-sent emails are not changed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditWarning(false)}
              className="border-gray-200"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowEditWarning(false);
                setPendingSubmit(true);
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SortableStep({
  id,
  stepNumber,
  delayDays,
  onDelayChange,
  onRemove,
  canRemove,
}: {
  id: string;
  stepNumber: number;
  delayDays: number;
  onDelayChange: (days: number) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-md border border-gray-100 px-3 py-2">
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-gray-300 hover:text-gray-500 touch-none"
        type="button"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-sm font-medium text-blue-700">
        {stepNumber}
      </div>
      <div className="flex-1">
        <span className="text-sm text-gray-700">
          {stepNumber === 1 ? 'First email' : `Follow-up ${stepNumber - 1}`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-gray-500">Delay (days)</Label>
        <Input
          type="number"
          min={0}
          value={delayDays}
          onChange={(e) => onDelayChange(parseInt(e.target.value) || 0)}
          className="w-24"
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={!canRemove}
        className="h-8 w-8 text-gray-400 hover:text-red-600 disabled:opacity-30"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
