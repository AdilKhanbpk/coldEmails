'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Mail,
  Send,
  Loader2,
  Bot,
  User,
  ChevronRight,
  ChevronLeft,
  Inbox,
  Pencil,
  X,
} from 'lucide-react';
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

type MobilePane = 'inboxes' | 'leads' | 'conversation';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  CONNECTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXPIRED: 'bg-amber-50 text-amber-700 border-amber-200',
  ERROR: 'bg-red-50 text-red-700 border-red-200',
  DISCONNECTED: 'bg-stone-100 text-stone-500 border-stone-200',
};

const LEAD_STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'bg-stone-100 text-stone-500 border-stone-200',
  IN_PROGRESS: 'bg-[#F3E7DE] text-[#A94F31] border-[#E8C4AE]',
  REPLIED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  MEETING_BOOKED: 'bg-violet-50 text-violet-700 border-violet-200',
  COMPLETED: 'bg-stone-100 text-stone-500 border-stone-200',
  BOUNCED: 'bg-red-50 text-red-700 border-red-200',
  NOT_INTERESTED: 'bg-orange-50 text-orange-700 border-orange-200',
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InboxesView({ inboxes }: { inboxes: InboxItem[] }) {
  const [selectedInbox, setSelectedInbox] = useState<InboxItem | null>(
    inboxes.length > 0 ? inboxes[0] : null,
  );
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  
  // Cache leads by inboxId to prevent redundant API calls
  const [leadsCache, setLeadsCache] = useState<Record<string, Lead[]>>({});
  const [leadsLoading, setLeadsLoading] = useState(false);
  const fetchingRef = useRef<Set<string>>(new Set()); // Track which inboxes are currently being fetched
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Which pane is active. On mobile this drives a 3-level drill-down
  // (inboxes → leads → conversation). On desktop, inboxes + leads always
  // show together as a "list" view; only 'conversation' changes anything,
  // swapping the list out for a full-width thread view.
  const [pane, setPane] = useState<MobilePane>(inboxes.length > 0 ? 'leads' : 'inboxes');
  const showingConversation = pane === 'conversation';

  // Compose state — the reply form is collapsed until the user opens it
  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get leads from cache for selected inbox
  const leads = selectedInbox ? (leadsCache[selectedInbox.id] || []) : [];

  // ── Load leads when inbox is selected ────────────────────────────────────
  const fetchLeads = useCallback(async (inboxId: string) => {
    // Check cache first
    if (leadsCache[inboxId]) {
      // Cache hit - no API call needed
      return;
    }

    // Check if already fetching this inbox
    if (fetchingRef.current.has(inboxId)) {
      return; // Already fetching, skip
    }

    // Mark as fetching
    fetchingRef.current.add(inboxId);
    
    setLeadsLoading(true);
    setSelectedLead(null);
    setMessages([]);
    
    try {
      const res = await fetch(`/api/inboxes/${inboxId}/leads`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      
      // Update cache for this inbox
      setLeadsCache((prev) => ({
        ...prev,
        [inboxId]: data.leads ?? [],
      }));
    } catch {
      toast.error('Failed to load leads for this inbox.');
    } finally {
      setLeadsLoading(false);
      // Remove from fetching set
      fetchingRef.current.delete(inboxId);
    }
  }, [leadsCache]);

  useEffect(() => {
    if (selectedInbox) {
      fetchLeads(selectedInbox.id);
    }
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

  const handleSelectInbox = (inbox: InboxItem) => {
    setSelectedInbox(inbox);
    setPane('leads');
  };

  const handleSelectLead = (lead: Lead) => {
    setSelectedLead(lead);
    setSubject('');
    setContent('');
    setComposeOpen(false);
    fetchMessages(lead.id);
    setPane('conversation');
  };

  const handleBackToList = () => setPane('leads');

  const openCompose = () => setComposeOpen(true);
  const closeCompose = () => {
    setComposeOpen(false);
    setSubject('');
    setContent('');
  };

  // Auto-grow the compose textarea, capped so it never swallows the screen
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [content]);

  // Focus the message field the moment the compose panel opens
  useEffect(() => {
    if (composeOpen) textareaRef.current?.focus();
  }, [composeOpen]);

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
      setComposeOpen(false);
      fetchMessages(selectedLead.id);
      
      // Update lead's lastMessageDate in cache
      setLeadsCache((prev) => {
        const inboxLeads = prev[selectedInbox.id];
        if (!inboxLeads) return prev;
        
        return {
          ...prev,
          [selectedInbox.id]: inboxLeads.map((lead) =>
            lead.id === selectedLead.id
              ? { ...lead, lastMessageDate: new Date().toISOString() }
              : lead
          ),
        };
      });
    } catch {
      toast.error('Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  const capForDisplay = (inbox: InboxItem) =>
    inbox.warmupThrottle ? Math.min(inbox.dailySendingCap, 20) : inbox.dailySendingCap;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-[#FAF8F4]">
      {/* ── List view: Inboxes + Leads. Always both-visible on desktop;
             a single drill-down step on mobile. Hidden entirely once a
             conversation is open. ── */}
      <div
        className={cn(
          'w-full min-w-0 transition-opacity duration-150',
          showingConversation ? 'hidden' : 'flex',
        )}
      >
        {/* ── Inboxes ── */}
        <div
          className={cn(
            'w-full shrink-0 flex-col border-stone-200 bg-white md:flex md:w-64 md:border-r lg:w-80',
            pane === 'inboxes' ? 'flex' : 'hidden',
          )}
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-stone-200 px-4">
            <Inbox className="h-4 w-4 text-stone-500" strokeWidth={1.75} />
            <span className="text-sm font-semibold text-stone-900">Inboxes</span>
            {inboxes.length > 0 && (
              <span className="ml-auto text-xs text-stone-400">{inboxes.length}</span>
            )}
          </div>
          <ScrollArea className="flex-1">
            {inboxes.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 p-8 text-center">
                <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-stone-100">
                  <Mail className="h-5 w-5 text-stone-300" strokeWidth={1.75} />
                </div>
                <p className="text-xs font-medium text-stone-500">No inboxes connected</p>
                <p className="text-xs text-stone-400">Go to Settings → Inboxes to connect one.</p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {inboxes.map((inbox) => {
                  const isActive = selectedInbox?.id === inbox.id;
                  return (
                    <button
                      key={inbox.id}
                      onClick={() => handleSelectInbox(inbox)}
                      className={cn(
                        'group w-full rounded-xl px-3 py-2.5 text-left transition-all duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1613F] focus-visible:ring-offset-1',
                        isActive ? 'bg-[#F3E7DE]' : 'hover:bg-stone-50',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2 flex-row md:flex-col lg:flex-row">
                        <div className="flex min-w-0 items-center gap-2 ">
                          <span
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors duration-150',
                              isActive ? 'bg-[#C1613F] text-white' : 'bg-[#F3E7DE] text-[#C1613F]',
                            )}
                          >
                            <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
                          </span>
                          <span
                            className={cn(
                              'truncate text-sm font-medium',
                              isActive ? 'text-[#A94F31]' : 'text-stone-700',
                            )}
                          >
                            {inbox.emailAddress}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            'shrink-0 px-1.5 py-0 text-[10px] font-medium',
                            STATUS_COLORS[inbox.status] ?? STATUS_COLORS.DISCONNECTED,
                          )}
                        >
                          {inbox.status}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate pl-9 text-xs text-stone-400">
                        {inbox.provider} · {inbox.sentToday}/{capForDisplay(inbox)} sent today
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* ── Leads ── */}
        <div
          className={cn(
            'w-full min-w-0 shrink-0 flex-col border-stone-200 bg-white md:flex md:flex-1 md:border-r',
            pane === 'leads' ? 'flex' : 'hidden',
          )}
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-stone-200 px-3 md:px-4">
            <button
              onClick={() => setPane('inboxes')}
              className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1613F] md:hidden"
              aria-label="Back to inboxes"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
            </button>
            <div className="min-w-0">
              <span className="text-sm font-semibold text-stone-900">
                {selectedInbox ? 'Leads' : 'Select an inbox'}
              </span>
              {selectedInbox && (
                <span className="ml-1.5 truncate text-xs text-stone-400">
                  · {selectedInbox.emailAddress}
                </span>
              )}
            </div>
          </div>
          <ScrollArea className="flex-1">
            {!selectedInbox ? (
              <div className="flex items-center justify-center p-8">
                <p className="text-xs text-stone-400">Select an inbox to see leads.</p>
              </div>
            ) : leadsLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
              </div>
            ) : leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1 p-8 text-center">
                <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-stone-100">
                  <User className="h-5 w-5 text-stone-300" strokeWidth={1.75} />
                </div>
                <p className="text-xs font-medium text-stone-500">No leads yet</p>
                <p className="text-xs text-stone-400">
                  Leads contacted from this inbox will show up here.
                </p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {leads.map((lead) => {
                  const isActive = selectedLead?.id === lead.id;
                  return (
                    <button
                      key={lead.id}
                      onClick={() => handleSelectLead(lead)}
                      className={cn(
                        'w-full rounded-xl px-3 py-2.5 text-left transition-all duration-150',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1613F] focus-visible:ring-offset-1',
                        isActive ? 'bg-[#F3E7DE]' : 'hover:bg-stone-50',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[11px] font-semibold text-stone-500">
                            {initials(lead.companyName) || '—'}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-stone-900">
                              {lead.companyName}
                            </p>
                            <p className="truncate text-xs text-stone-400">{lead.email}</p>
                          </div>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-stone-300" />
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 pl-[42px]">
                        <Badge
                          variant="outline"
                          className={cn(
                            'px-1.5 py-0 text-[10px] font-medium',
                            LEAD_STATUS_COLORS[lead.status] ?? 'border-stone-200 bg-stone-100 text-stone-500',
                          )}
                        >
                          {lead.status.replace(/_/g, ' ')}
                        </Badge>
                        {lead.lastMessageDate && (
                          <span className="text-[11px] text-stone-400">
                            {format(new Date(lead.lastMessageDate), 'MMM d, HH:mm')}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* ── Conversation: opens full-width as its own screen, only once a
             lead is selected. Remounts (via key) on every lead change so
             the entrance animation replays each time it's opened. ── */}
      <div
        className={cn(
          'relative min-w-0 flex-1 flex-col bg-[#FAF8F4]',
          showingConversation ? 'flex' : 'hidden',
        )}
      >
        {!selectedLead ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
              <Mail className="h-6 w-6 text-stone-300" strokeWidth={1.75} />
            </div>
            <p className="text-sm text-stone-400">Select a lead to view the conversation.</p>
          </div>
        ) : (
          <div
            key={selectedLead.id}
            className="flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-right-6 duration-250 ease-out"
          >
            {/* Header */}
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-3 md:px-6">
              <button
                onClick={handleBackToList}
                className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-500 transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1613F]"
                aria-label="Back to leads"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-stone-900">
                  {selectedLead.companyName}
                </p>
                <p className="truncate text-xs text-stone-400">{selectedLead.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    'hidden text-xs sm:inline-flex',
                    LEAD_STATUS_COLORS[selectedLead.status] ?? 'border-stone-200 bg-stone-100 text-stone-500',
                  )}
                >
                  {selectedLead.status.replace(/_/g, ' ')}
                </Badge>
                {selectedLead.aiEnabled && (
                  <Badge variant="outline" className="border-[#E8C4AE] bg-[#F3E7DE] text-xs text-[#A94F31]">
                    AI Active
                  </Badge>
                )}
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="min-h-0 flex-1 px-3 py-4 md:px-6">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm">
                    <Mail className="h-5 w-5 text-stone-300" strokeWidth={1.75} />
                  </div>
                  <p className="text-sm text-stone-400">No messages yet.</p>
                  <p className="mt-0.5 text-xs text-stone-400">Send the first one with the button below.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((msg) => {
                    const isOutgoing = msg.role === 'ASSISTANT' || msg.role === 'OWNER';
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'flex animate-in gap-2.5 fade-in slide-in-from-bottom-1 duration-200 sm:gap-3',
                          isOutgoing ? 'flex-row-reverse' : '',
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                            msg.role === 'ASSISTANT'
                              ? 'bg-[#F3E7DE]'
                              : msg.role === 'OWNER'
                                ? 'bg-stone-200'
                                : 'bg-stone-100',
                          )}
                        >
                          {msg.role === 'ASSISTANT' ? (
                            <Bot className="h-4 w-4 text-[#C1613F]" strokeWidth={1.75} />
                          ) : msg.role === 'OWNER' ? (
                            <User className="h-4 w-4 text-stone-600" strokeWidth={1.75} />
                          ) : (
                            <Mail className="h-4 w-4 text-stone-500" strokeWidth={1.75} />
                          )}
                        </div>
                        <div
                          className={cn(
                            'max-w-[85%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[70%]',
                            msg.role === 'ASSISTANT'
                              ? 'bg-[#F3E7DE] text-stone-800'
                              : 'border border-stone-200 bg-white text-stone-800',
                          )}
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-stone-500">
                              {msg.role === 'ASSISTANT'
                                ? 'AI'
                                : msg.role === 'OWNER'
                                  ? 'You'
                                  : 'Customer'}
                            </span>
                            {msg.aiGenerated && (
                              <Badge
                                variant="outline"
                                className="border-[#E8C4AE] px-1 py-0 text-[10px] text-[#A94F31]"
                              >
                                AI
                              </Badge>
                            )}
                            <span className="text-[11px] text-stone-400">
                              {format(new Date(msg.createdAt), 'MMM d, HH:mm')}
                            </span>
                          </div>
                          {msg.subject && (
                            <p className="mb-1 text-xs font-semibold text-stone-600">
                              Subject: {msg.subject}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">
                            {msg.content}
                          </p>
                          {msg.senderEmail && msg.role === 'CUSTOMER' && (
                            <p className="mt-1.5 text-[11px] text-stone-400">
                              From: {msg.senderEmail}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Compose — collapsed trigger by default, opens on demand */}
            <div className="shrink-0 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]">
              {!composeOpen ? (
                <div className="p-3 md:px-6 md:py-4">
                  <button
                    onClick={openCompose}
                    className="flex w-full items-center gap-2.5 rounded-full border border-stone-200 bg-stone-50 px-4 py-2.5 text-left text-sm text-stone-400 transition-colors duration-150 hover:border-stone-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1613F]"
                  >
                    <Pencil className="h-3.5 w-3.5 shrink-0 text-stone-400" strokeWidth={1.75} />
                    Write a reply…
                  </button>
                </div>
              ) : (
                <div className="animate-in fade-in slide-in-from-bottom-2 p-3 duration-200 md:px-6 md:py-4">
                  <form onSubmit={handleSend} className="space-y-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5 text-xs text-stone-400">
                        <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
                        <span className="truncate">
                          Sending from{' '}
                          <span className="font-medium text-stone-600">
                            {selectedInbox?.emailAddress}
                          </span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={closeCompose}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1613F]"
                        aria-label="Discard reply"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                    </div>
                    <Input
                      placeholder="Subject (optional)"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="rounded-xl border-stone-200 text-sm focus-visible:ring-[#C1613F]"
                    />
                    <textarea
                      ref={textareaRef}
                      className="w-full resize-none rounded-xl border border-stone-200 px-3 py-2.5 text-sm leading-relaxed placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#C1613F]"
                      rows={3}
                      placeholder="Type your message..."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          if (content.trim()) handleSend(e as unknown as React.FormEvent);
                        }
                      }}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <p className="hidden text-xs text-stone-400 sm:block">Ctrl+Enter to send</p>
                      <Button
                        type="submit"
                        disabled={sending || !content.trim()}
                        className="w-full rounded-full bg-[#C1613F] hover:bg-[#A94F31] sm:ml-auto sm:w-auto"
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}