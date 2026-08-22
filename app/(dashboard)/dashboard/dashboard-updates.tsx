'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bell,
  BellOff,
  X,
  Clock,
  Calendar,
  CheckCircle2,
  CheckCheck,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/app/(dashboard)/contexts/NotificationsContext';
import { useMeetings } from '@/app/(dashboard)/contexts/MeetingsContext';
import { useConditionalPolling } from '@/lib/hooks/useConditionalPolling';
import React from 'react';

interface Meeting {
  id: string;
  scheduledTime: string;
  duration: number;
  meetingProvider: string;
  meetingLink: string | null;
  status: string;
  lead: {
    id: string;
    companyName: string;
    email: string;
  };
}

type Tab = 'all' | 'unread' | 'read';

// ─── Helpers ────────────────────────────────────────────────────────────────

function notifIcon(type: string) {
  if (type === 'reply') return <MessageSquare className="h-4 w-4 text-blue-600" />;
  if (type === 'bounce') return <X className="h-4 w-4 text-red-500" />;
  if (type === 'meeting') return <Calendar className="h-4 w-4 text-emerald-600" />;
  if (type === 'inbox_expired') return <X className="h-4 w-4 text-amber-500" />;
  return <Bell className="h-4 w-4 text-gray-500" />;
}

function notifIconBg(type: string) {
  if (type === 'reply') return 'bg-blue-50';
  if (type === 'bounce') return 'bg-red-50';
  if (type === 'meeting') return 'bg-emerald-50';
  if (type === 'inbox_expired') return 'bg-amber-50';
  return 'bg-gray-100';
}

function formatNotifTime(iso: string) {
  const date = new Date(iso);
  const daysOld = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  if (daysOld < 7) return formatDistanceToNowStrict(date, { addSuffix: true });
  return format(date, 'MMM d');
}

// ─── Main component ─────────────────────────────────────────────────────────

/**
 * DashboardUpdates - Memoized component for notifications and meetings
 * 
 * Performance optimizations:
 * - Wrapped with React.memo to prevent unnecessary re-renders
 * - Uses NotificationsContext for notification data (with smart polling)
 * - Meetings poll independently with useConditionalPolling (45s interval)
 * - All handlers wrapped with useCallback for stable references
 * - Notification data now comes from context (no local polling needed)
 */
export const DashboardUpdates = React.memo(function DashboardUpdates() {
  // Get notifications from context (context handles polling internally)
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead 
  } = useNotifications();
  
  // Get meetings from context (with caching)
  const { meetings: contextMeetings, fetchMeetings: contextFetchMeetings } = useMeetings();
  
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  // Wrap context fetch for polling - it will use cache if available
  const fetchMeetings = useCallback(async () => {
    try {
      await contextFetchMeetings();
    } catch (error) {
      // Throw to trigger exponential backoff
      throw error;
    }
  }, [contextFetchMeetings]);

  // Smart polling for meetings: 45-second interval (increased from 15s)
  // Automatically pauses when tab is inactive
  useConditionalPolling(fetchMeetings, 45000);

  // Initial fetch (will use cache if available)
  React.useEffect(() => {
    fetchMeetings().catch(() => {
      // Error handling is done in fetchMeetings
    });
  }, [fetchMeetings]);
  
  // Use context meetings or empty array
  const meetings = contextMeetings || [];

  // Close on outside click / Escape
  React.useEffect(() => {
    if (!showNotifPanel) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowNotifPanel(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNotifPanel(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showNotifPanel]);

  // Reset to the "All" tab whenever the panel is reopened
  React.useEffect(() => {
    if (showNotifPanel) setTab('all');
  }, [showNotifPanel]);

  const readCount = useMemo(() => notifications.length - unreadCount, [notifications.length, unreadCount]);

  const visibleNotifications = useMemo(() => {
    if (tab === 'unread') return notifications.filter((n) => !n.read);
    if (tab === 'read') return notifications.filter((n) => n.read);
    return notifications;
  }, [notifications, tab]);

  // Wrap markAllAsRead with loading state management
  const handleMarkAllAsRead = useCallback(async () => {
    setMarkingAllRead(true);
    try {
      await markAllAsRead();
    } finally {
      setMarkingAllRead(false);
    }
  }, [markAllAsRead]);

  const tabs: { key: Tab; label: string; count: number }[] = useMemo(() => [
    { key: 'all', label: 'All', count: notifications.length },
    { key: 'unread', label: 'Unread', count: unreadCount },
    { key: 'read', label: 'Read', count: readCount },
  ], [notifications.length, unreadCount, readCount]);

  return (
    <>
      {/* Notification Bell + Dropdown */}
      <div className="relative" ref={panelRef}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowNotifPanel((v) => !v)}
          className="relative"
          aria-label="Notifications"
          aria-expanded={showNotifPanel}
        >
          <Bell className="h-5 w-5 text-gray-600" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>

        {showNotifPanel && (
          <div className="absolute right-0 top-full z-50 mt-2 flex max-h-[28rem] w-[92vw] max-w-sm flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg sm:w-96">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
              <button
                onClick={handleMarkAllAsRead}
                disabled={unreadCount === 0 || markingAllRead}
                className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
              >
                {markingAllRead ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                Mark all as read
              </button>
            </div>

            {/* Tabs */}
            <div className="flex shrink-0 gap-1 border-b border-gray-100 px-3 py-2">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                    tab === t.key
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-[10px] tabular-nums',
                      tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500',
                    )}
                  >
                    {t.count}
                  </span>
                </button>
              ))}
            </div>

            {/* List */}
            <ScrollArea className="h-[22rem]">
              {visibleNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                    {tab === 'unread' ? (
                      <CheckCheck className="h-5 w-5 text-gray-300" />
                    ) : (
                      <BellOff className="h-5 w-5 text-gray-300" />
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-500">
                    {tab === 'unread'
                      ? "You're all caught up"
                      : tab === 'read'
                        ? 'No read notifications'
                        : 'No notifications yet'}
                  </p>
                  {tab === 'unread' && (
                    <p className="text-xs text-gray-400">New activity will show up here.</p>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {visibleNotifications.map((n) => {
                    const content = (
                      <>
                        <div
                          className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                            notifIconBg(n.type),
                          )}
                        >
                          {notifIcon(n.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'text-sm leading-snug',
                              n.read ? 'text-gray-600' : 'font-medium text-gray-900',
                            )}
                          >
                            {n.message}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {formatNotifTime(n.createdAt)}
                          </p>
                        </div>
                        {!n.read && (
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600"
                            aria-hidden="true"
                          />
                        )}
                      </>
                    );

                    const rowClasses = cn(
                      'flex w-full gap-3 px-4 py-3 text-left transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
                      !n.read ? 'bg-blue-50/40 hover:bg-blue-50' : 'hover:bg-gray-50',
                    );

                    if (n.leadId) {
                      return (
                        <Link
                          key={n.id}
                          href={`/leads/${n.leadId}`}
                          onClick={() => {
                            if (!n.read) markAsRead(n.id);
                            setShowNotifPanel(false);
                          }}
                          className={rowClasses}
                        >
                          {content}
                        </Link>
                      );
                    }

                    return (
                      <button
                        key={n.id}
                        onClick={() => !n.read && markAsRead(n.id)}
                        className={rowClasses}
                      >
                        {content}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Upcoming Meetings Card (rendered below the dashboard stats) */}
      {meetings.length > 0 && (
        <Card className="mt-6 border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-blue-600" />
              Upcoming Meetings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {meetings.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col gap-2 rounded-md border border-gray-100 px-3 py-2.5 transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50">
                      <Clock className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/leads/${m.lead.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-blue-600"
                      >
                        {m.lead.companyName}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {format(new Date(m.scheduledTime), 'EEE, MMM d · HH:mm')} · {m.duration}
                        min
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-12 sm:pl-0">
                    <Badge
                      variant="outline"
                      className={
                        m.status === 'CONFIRMED'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }
                    >
                      {m.status === 'CONFIRMED' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                      {m.status}
                    </Badge>
                    {m.meetingLink && (
                      <a
                        href={m.meetingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        Join
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
});