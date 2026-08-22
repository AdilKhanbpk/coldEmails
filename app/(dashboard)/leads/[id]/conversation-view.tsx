import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Loader2, Bot, User, Mail, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useConditionalPolling } from '@/lib/hooks/useConditionalPolling';
import React from 'react';

interface Message {
  id: string;
  role: string;
  content: string;
  subject: string | null;
  aiGenerated: boolean;
  senderEmail: string | null;
  createdAt: string;
}

interface Meeting {
  id: string;
  scheduledTime: string;
  duration: number;
  meetingProvider: string;
  meetingLink: string | null;
  status: string;
  proposedSlots: string[] | null;
}

/**
 * ConversationView - Memoized component for displaying lead conversations
 * 
 * Performance optimizations:
 * - Wrapped with React.memo to prevent unnecessary re-renders
 * - Uses smart polling with useConditionalPolling (30s interval, pauses on tab inactive)
 * - Memoizes role icon and label functions
 * - Implements proper cleanup for polling on unmount
 * - Reduced polling from 10s to 30s for better performance
 */
export const ConversationView = React.memo(function ConversationView({
  leadId,
  aiEnabled,
}: {
  leadId: string;
  aiEnabled: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [localAiEnabled, setLocalAiEnabled] = useState(aiEnabled);
  const [togglingAi, setTogglingAi] = useState(false);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      } else {
        throw new Error('Failed to fetch messages');
      }
    } catch (error) {
      // Silent fail for polling, but throw to trigger exponential backoff
      throw error;
    }
  }, [leadId]);

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch(`/api/leads/${leadId}/meetings`);
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings || []);
      }
    } catch {
      // silent fail
    }
  }, [leadId]);

  // Smart polling with useConditionalPolling:
  // - 30-second interval (increased from 10s)
  // - Automatically pauses when tab is inactive
  // - Resumes when tab becomes active
  // - Implements exponential backoff on errors
  useConditionalPolling(fetchMessages, 30000);
  useConditionalPolling(fetchMeetings, 30000);

  // Initial load
  React.useEffect(() => {
    Promise.all([fetchMessages(), fetchMeetings()])
      .catch(() => {
        // Errors are handled in individual fetch functions
      })
      .finally(() => setLoading(false));
  }, [fetchMessages, fetchMeetings]);

  const handleSendManual = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/send-manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), content: content.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to send message.');
        return;
      }
      toast.success('Message sent.');
      setContent('');
      setSubject('');
      fetchMessages();
    } catch {
      toast.error('Failed to send message.');
    } finally {
      setSending(false);
    }
  }, [content, subject, leadId, fetchMessages]);

  const handleStopAi = useCallback(async () => {
    setTogglingAi(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/stop-ai`, { method: 'POST' });
      if (!res.ok) {
        toast.error('Failed to stop AI.');
        return;
      }
      setLocalAiEnabled(false);
      toast.success('AI stopped for this conversation. You can now send manual messages.');
    } catch {
      toast.error('Failed to stop AI.');
    } finally {
      setTogglingAi(false);
    }
  }, [leadId]);

  const handleResumeAi = useCallback(async () => {
    setTogglingAi(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/resume-ai`, { method: 'POST' });
      if (!res.ok) {
        toast.error('Failed to resume AI.');
        return;
      }
      setLocalAiEnabled(true);
      toast.success('AI resumed. The AI will include your manual messages in its context.');
    } catch {
      toast.error('Failed to resume AI.');
    } finally {
      setTogglingAi(false);
    }
  }, [leadId]);

  const handleConfirmMeeting = useCallback(async (meetingId: string, slot: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, selectedSlot: slot }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to confirm meeting.');
        return;
      }
      toast.success('Meeting confirmed.');
      fetchMeetings();
    } catch {
      toast.error('Failed to confirm meeting.');
    }
  }, [leadId, fetchMeetings]);

  const handleCancelMeeting = useCallback(async (meetingId: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}/meetings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, action: 'cancel' }),
      });
      if (!res.ok) {
        toast.error('Failed to cancel meeting.');
        return;
      }
      toast.success('Meeting cancelled.');
      fetchMeetings();
    } catch {
      toast.error('Failed to cancel meeting.');
    }
  }, [leadId, fetchMeetings]);

  // Memoize role icon and label functions to avoid recreation on every render
  const roleIcon = useMemo(() => (role: string) => {
    if (role === 'ASSISTANT') return <Bot className="h-4 w-4 text-blue-600" />;
    if (role === 'OWNER') return <User className="h-4 w-4 text-gray-600" />;
    return <Mail className="h-4 w-4 text-gray-500" />;
  }, []);

  const roleLabel = useMemo(() => (role: string) => {
    if (role === 'ASSISTANT') return 'AI Assistant';
    if (role === 'OWNER') return 'You (Manual)';
    return 'Customer';
  }, []);

  return (
    <div className="space-y-6">
      {/* AI Control Bar */}
      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-blue-600" />
          <div>
            <p className="text-sm font-medium text-gray-900">
              AI is {localAiEnabled ? 'active' : 'stopped'}
            </p>
            <p className="text-xs text-gray-500">
              {localAiEnabled
                ? 'The AI will automatically generate and send replies.'
                : 'AI is paused. You can send manual messages below.'}
            </p>
          </div>
        </div>
        {localAiEnabled ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleStopAi}
            disabled={togglingAi}
            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            {togglingAi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Stop AI
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleResumeAi}
            disabled={togglingAi}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {togglingAi ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Resume AI
          </Button>
        )}
      </div>

      {/* Meetings */}
      {meetings.length > 0 && (
        <Card className="border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              Meetings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {meetings.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        m.status === 'CONFIRMED'
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : m.status === 'PROPOSED'
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-gray-200 text-gray-600'
                      }
                    >
                      {m.status}
                    </Badge>
                    <span className="text-sm text-gray-900">
                      {format(new Date(m.scheduledTime), 'MMM d, yyyy HH:mm')}
                    </span>
                    <span className="text-xs text-gray-500">{m.duration}min</span>
                  </div>
                  {m.meetingLink && (
                    <a href={m.meetingLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                      {m.meetingLink}
                    </a>
                  )}
                  {m.status === 'PROPOSED' && m.proposedSlots && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {(m.proposedSlots as string[]).map((slot) => (
                        <Button
                          key={slot}
                          size="sm"
                          variant="outline"
                          className="border-gray-200 text-xs"
                          onClick={() => handleConfirmMeeting(m.id, slot)}
                        >
                          {format(new Date(slot), 'MMM d HH:mm')}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                {m.status !== 'CANCELLED' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => handleCancelMeeting(m.id)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Message History */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm">Conversation History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Mail className="h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">No messages yet.</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === 'OWNER' ? 'flex-row-reverse' : ''}`}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
                      {roleIcon(msg.role)}
                    </div>
                    <div className={`max-w-[75%] rounded-lg px-4 py-3 ${
                      msg.role === 'ASSISTANT'
                        ? 'bg-blue-50'
                        : msg.role === 'OWNER'
                          ? 'bg-gray-100'
                          : 'bg-white border border-gray-200'
                    }`}>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-600">{roleLabel(msg.role)}</span>
                        {msg.aiGenerated && (
                          <Badge variant="outline" className="border-blue-200 text-blue-600 text-[10px] py-0">
                            AI
                          </Badge>
                        )}
                        <span className="text-xs text-gray-400">
                          {format(new Date(msg.createdAt), 'MMM d, HH:mm')}
                        </span>
                      </div>
                      {msg.subject && (
                        <p className="mb-1 text-xs font-medium text-gray-500">{msg.subject}</p>
                      )}
                      <p className="whitespace-pre-wrap text-sm text-gray-800">{msg.content}</p>
                      {msg.senderEmail && msg.role === 'CUSTOMER' && (
                        <p className="mt-1 text-xs text-gray-400">From: {msg.senderEmail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Manual Message Composer (always available, but especially useful when AI is stopped) */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm">
            {localAiEnabled ? 'Send a Manual Message' : 'Compose Manual Message'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSendManual} className="space-y-3">
            <Input
              placeholder="Subject (optional)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <textarea
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              placeholder="Type your message..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={sending || !content.trim()} className="bg-blue-600 hover:bg-blue-700">
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
});
