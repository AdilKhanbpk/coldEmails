'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, X, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  display?: (value: string) => string;
  type?: 'text' | 'textarea' | 'date' | 'datetime-local';
  className?: string;
  inputClassName?: string;
}

export function InlineEdit({
  value,
  onSave,
  display,
  type = 'text',
  className = '',
  inputClassName = '',
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleSave = async () => {
    if (draft === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      toast.success('Updated');
      setEditing(false);
    } catch {
      toast.error('Failed to update');
      setDraft(value);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={`flex items-start gap-2 ${className}`}>
        {type === 'textarea' ? (
          <Textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={`flex-1 ${inputClassName}`}
            rows={3}
            disabled={saving}
          />
        ) : (
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={`flex-1 ${inputClassName}`}
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') handleCancel();
            }}
          />
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-1 flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          onClick={handleCancel}
          disabled={saving}
          className="mt-1 flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={`group flex items-center gap-1.5 ${className}`}>
      <span className={type === 'textarea' ? 'whitespace-pre-wrap' : ''}>
        {display ? display(value) : value || '—'}
      </span>
      <button
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-gray-500"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}
