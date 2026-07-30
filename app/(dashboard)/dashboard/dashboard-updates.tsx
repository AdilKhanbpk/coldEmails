'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, X, Clock, Calendar, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

interface Notification {
  id: string;
  type: string;
  message: string;
  leadId: string | null;
  read: boolean;
  createdAt: string;
}

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

export function DashboardUpdates() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch('/api/meetings');
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings || []);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetchMeetings();
    // Poll for live updates every 15 seconds
    const interval = setInterval(() => {
      fetchNotifications();
      fetchMeetings();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications, fetchMeetings]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      fetchNotifications();
    } catch {
      // silent
    }
  };

  const notifIcon = (type: string) => {
    if (type === 'reply') return <Bell className="h-4 w-4 text-blue-600" />;
    if (type === 'bounce') return <X className="h-4 w-4 text-red-500" />;
    if (type === 'meeting') return <Calendar className="h-4 w-4 text-green-600" />;
    if (type === 'inbox_expired') return <X className="h-4 w-4 text-amber-500" />;
    return <Bell className="h-4 w-4 text-gray-500" />;
  };

  return (
    <>
      {/* Notification Bell + Dropdown */}
      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowNotifPanel(!showNotifPanel)}
          className="relative"
        >
          <Bell className="h-5 w-5 text-gray-600" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
              {unreadCount}
            </span>
          )}
        </Button>
        {showNotifPanel && (
          <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-medium text-gray-900">Notifications</span>
              <Button variant="ghost" size="sm" onClick={() => setShowNotifPanel(false)} className="h-6 w-6 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="max-h-80">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">No notifications yet.</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`flex gap-3 px-4 py-3 ${!n.read ? 'bg-blue-50/50' : ''}`}
                    >
                      <div className="mt-0.5 shrink-0">{notifIcon(n.type)}</div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm text-gray-700">{n.message}</p>
                        <p className="text-xs text-gray-400">{format(new Date(n.createdAt), 'MMM d, HH:mm')}</p>
                      </div>
                      {!n.read && (
                        <button onClick={() => markAsRead(n.id)} className="text-xs text-blue-600 hover:underline">
                          Mark read
                        </button>
                      )}
                    </div>
                  ))}
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
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              Upcoming Meetings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {meetings.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                      <Clock className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <Link href={`/leads/${m.lead.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                        {m.lead.companyName}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {format(new Date(m.scheduledTime), 'EEE, MMM d · HH:mm')} · {m.duration}min
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        m.status === 'CONFIRMED'
                          ? 'border-green-200 bg-green-50 text-green-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }
                    >
                      {m.status === 'CONFIRMED' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                      {m.status}
                    </Badge>
                    {m.meetingLink && (
                      <a href={m.meetingLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
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
}
