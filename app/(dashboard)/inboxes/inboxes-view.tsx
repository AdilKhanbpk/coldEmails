'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Mail, Send, Loader2, Bot, User, ChevronRight, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InboxItem {
  id: string;
  provider: string;
  emailAddress: string;
  status: string;
  sentToday: number;
  sentDate: string | null;
  dailySendingCap: number;
  warmupThrottle: boolean;
}

interface Lead {
  id: string;
  companyName: string;
  email: string;
  status: string;
  currentStep: number;
  lastMessageDate: string | null;
  aiEnabled: boolean;
}

interface Message {
  id: string;
  leadId: string;
  lead: { companyName: string; email: string; status: string } | null;
  role: string;
  content: string;
  subject: string | null;
  aiGenerated: boolean;
  senderEmail: string | null;
  createdAt: string;
  status: string;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  CONNECTED: 'bg-green-100 text-green-700 border-green-200',
  EXPIRED: 'bg-amber-100 text-amber-700 border-amber-200',
  ERROR: 'bg-red-100 text-red-700 border-red-200',
  DISCONNECTED: 'bg-gray-100 text-gray-500 border-gray-200',
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-500',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  REPLIED: 'bg-green-100 text-green-700',
  MEETING_BOOKED: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-gray-100 text-gray-500',
  BOUNCED: 'bg-red-100 text-red-700',
  NOT_INTERESTED: 'bg-orange-100 text-orange-700',
};

// ─── Main component ───────────────────────────────────────────────────────────

export function InboxesView({ inboxes }: { inboxes: InboxItem[] }) {
  const [selectedInbox, setSelectedInbox] = useState<InboxItem | null>(
    inboxes.length > 0 ? inboxes[0] : null,
  );
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Compose state
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  // ── Load leads when inbox is selected ────────────────────────────────────
  const fetchLeads = useCallback(async (inboxId: string) => {
    setLeadsLoading(true);
    setSelectedLead(null);
    setMessages([]);
    try {
      const res = await fetch(`/api/inboxes/${inboxId}/leads`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLeads(data.leads ?? []);
    } catch {
      toast.error('Failed to load leads for this inbox.');
      setLeads([]);
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedInbox) fetchLeads(selectedInbox.id);
  }, [selectedInbox, fetchLeads]);

  // ── Load messages when lead is selected ──────────────────────────────────
  const fetchMessages = useCallback(async (leadId: string) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/messages`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      toast.error('Failed to load messages.');
      setMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const handleSelectLead = (lead: Lead) => {
    setSelectedLead(lead);
    setSubject('');
    setContent('');
    fetchMessages(lead.id);
  };

  // ── Send email ────────────────────────────────────────────────────────────
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !selectedLead || !selectedInbox) return;

    setSending(true);
    try {
      const res = await fetch(`/api/inboxes/${selectedInbox.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: selectedLead.id,
          subject: subject.trim(),
          content: content.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to send email.');
        return;
      }
      toast.success('Email sent.');
      setContent('');
      setSubject('');
      fetchMessages(selectedLead.id);
    } catch {
      toast.error('Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Column 1: Inboxes ── */}
      <div className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-4">
          <Inbox className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-900">Inboxes</span>
        </div>
        <ScrollArea className="flex-1">
          {inboxes.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <Mail className="h-8 w-8 text-gray-300" />
              <p className="mt-2 text-xs text-gray-400">No inboxes connected.</p>
              <p className="mt-1 text-xs text-gray-400">Go to Settings → Inboxes to connect one.</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {inboxes.map((inbox) => (
                <button
                  key={inbox.id}
                  onClick={() => setSelectedInbox(inbox)}
                  className={cn(
                    'w-full rounded-md px-3 py-2.5 text-left transition-colors',
                    selectedInbox?.id === inbox.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'hover:bg-gray-50 text-gray-700',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="h-4 w-4 shrink-0 text-blue-600" />
                      <span className="truncate text-sm font-medium">{inbox.emailAddress}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn('shrink-0 text-[10px] px-1.5 py-0', STATUS_COLORS[inbox.status] ?? STATUS_COLORS.DISCONNECTED)}
                    >
                      {inbox.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400 pl-6">
                    {inbox.provider} · {inbox.sentToday}/{inbox.warmupThrottle ? Math.min(inbox.dailySendingCap, 20) : inbox.dailySendingCap} today
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Column 2: Leads ── */}
      <div className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-4">
          <span className="text-sm font-semibold text-gray-900">
            {selectedInbox ? `Leads` : 'Select an inbox'}
          </span>
          {selectedInbox && (
            <span className="text-xs text-gray-400 truncate">· {selectedInbox.emailAddress}</span>
          )}
        </div>
        <ScrollArea className="flex-1">
          {!selectedInbox ? (
            <div className="flex items-center justify-center p-6">
              <p className="text-xs text-gray-400">Select an inbox to see leads.</p>
            </div>
          ) : leadsLoading ? (
            <div className="flex items-center justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <p className="text-xs text-gray-400">No leads have been contacted from this inbox yet.</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {leads.map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => handleSelectLead(lead)}
                  className={cn(
                    'w-full rounded-md px-3 py-2.5 text-left transition-colors',
                    selectedLead?.id === lead.id
                      ? 'bg-blue-50'
                      : 'hover:bg-gray-50',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{lead.companyName}</p>
                      <p className="truncate text-xs text-gray-400">{lead.email}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] px-1.5 py-0', LEAD_STATUS_COLORS[lead.status] ?? 'bg-gray-100 text-gray-500')}
                      >
                        {lead.status.replace('_', ' ')}
                      </Badge>
                      <ChevronRight className="h-3 w-3 text-gray-300" />
                    </div>
                  </div>
                  {lead.lastMessageDate && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      Last: {format(new Date(lead.lastMessageDate), 'MMM d, HH:mm')}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── Column 3: Conversation + Compose ── */}
      <div className="flex flex-1 flex-col bg-gray-50 min-w-0">
        {!selectedLead ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center p-6">
            <Mail className="h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-400">Select a lead to view the conversation.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
              <div>
                <p className="text-sm font-semibold text-gray-900">{selectedLead.companyName}</p>
                <p className="text-xs text-gray-400">{selectedLead.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn('text-xs', LEAD_STATUS_COLORS[selectedLead.status] ?? 'bg-gray-100 text-gray-500')}
                >
                  {selectedLead.status.replace('_', ' ')}
                </Badge>
                {selectedLead.aiEnabled && (
                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-xs">
                    AI Active
                  </Badge>
                )}
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 px-6 py-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Mail className="h-8 w-8 text-gray-300" />
                  <p className="mt-3 text-sm text-gray-400">No messages yet. Send the first one below.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => {
                    const isOutgoing = msg.role === 'ASSISTANT' || msg.role === 'OWNER';
                    return (
                      <div
                        key={msg.id}
                        className={cn('flex gap-3', isOutgoing ? 'flex-row-reverse' : '')}
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
                          {msg.role === 'ASSISTANT' ? (
                            <Bot className="h-4 w-4 text-blue-600" />
                          ) : msg.role === 'OWNER' ? (
                            <User className="h-4 w-4 text-gray-600" />
                          ) : (
                            <Mail className="h-4 w-4 text-gray-500" />
                          )}
                        </div>
                        <div
                          className={cn(
                            'max-w-[70%] rounded-xl px-4 py-3',
                            msg.role === 'ASSISTANT'
                              ? 'bg-blue-50 text-gray-800'
                              : msg.role === 'OWNER'
                                ? 'bg-white border border-gray-200 text-gray-800'
                                : 'bg-white border border-gray-200 text-gray-800',
                          )}
                        >
                          <div className="mb-1 flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-gray-500">
                              {msg.role === 'ASSISTANT' ? 'AI' : msg.role === 'OWNER' ? 'You' : 'Customer'}
                            </span>
                            {msg.aiGenerated && (
                              <Badge variant="outline" className="border-blue-200 text-blue-600 text-[10px] py-0 px-1">
                                AI
                              </Badge>
                            )}
                            <span className="text-[11px] text-gray-400">
                              {format(new Date(msg.createdAt), 'MMM d, HH:mm')}
                            </span>
                          </div>
                          {msg.subject && (
                            <p className="mb-1 text-xs font-semibold text-gray-600">
                              Subject: {msg.subject}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                          {msg.senderEmail && msg.role === 'CUSTOMER' && (
                            <p className="mt-1 text-[11px] text-gray-400">From: {msg.senderEmail}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Compose */}
            <div className="border-t border-gray-200 bg-white px-6 py-4">
              <form onSubmit={handleSend} className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                  <Mail className="h-3.5 w-3.5" />
                  <span>Sending from <span className="font-medium text-gray-600">{selectedInbox?.emailAddress}</span></span>
                </div>
                <Input
                  placeholder="Subject (optional)"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="border-gray-200 text-sm"
                />
                <div className="relative">
                  <textarea
                    className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    rows={4}
                    placeholder="Type your message..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        if (content.trim()) handleSend(e as any);
                      }
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">Ctrl+Enter to send</p>
                  <Button
                    type="submit"
                    disabled={sending || !content.trim()}
                    className="bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    {sending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send
                  </Button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
