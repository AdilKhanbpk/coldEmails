import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users, MessageSquare, Calendar, Send, Plus, ArrowRight,
  Clock, CheckCircle2, AlertTriangle, XCircle, Mail, Activity,
  TrendingUp, Eye, MousePointerClick, Reply,
} from 'lucide-react';
import { DashboardUpdates } from './dashboard-updates';
import { OnboardingChecklist } from '@/components/onboarding-checklist';
import { SkeletonCard } from '@/components/skeletons';
import { format } from 'date-fns';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalLeads, activeConversations, meetingsBooked, emailsSentThisMonth,
    emailsSentTotal, openedCount, repliedCount,
    scheduledJobs, runningJobs, failedJobs,
    connectedInboxes, expiredInboxes,
    recentActivity,
    outreachTypeCount,
  ] = await Promise.all([
    prisma.userLead.count({ where: { userId } }),
    prisma.conversation.count({ where: { userId, status: 'ACTIVE' } }),
    prisma.meeting.count({ where: { userId, status: 'CONFIRMED' } }),
    prisma.message.count({ where: { userId, role: 'ASSISTANT', createdAt: { gte: monthStart } } }),
    prisma.message.count({ where: { userId, role: 'ASSISTANT' } }),
    prisma.message.count({ where: { userId, role: 'ASSISTANT', openedAt: { not: null } } }),
    prisma.userLead.count({ where: { userId, status: { in: ['REPLIED', 'MEETING_BOOKED', 'COMPLETED', 'NOT_INTERESTED'] } } }),
    prisma.job.count({ where: { userId, status: 'SCHEDULED' } }),
    prisma.job.count({ where: { userId, status: 'RUNNING' } }),
    prisma.job.count({ where: { userId, status: 'FAILED' } }),
    prisma.inbox.count({ where: { userId, status: 'CONNECTED' } }),
    prisma.inbox.count({ where: { userId, status: 'EXPIRED' } }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { user: { select: { name: true } } },
    }),
    prisma.outreachType.count({ where: { userId } }),
  ]);

  const openRate = emailsSentTotal > 0 ? Math.round((openedCount / emailsSentTotal) * 1000) / 10 : 0;
  const replyRate = emailsSentTotal > 0 ? Math.round((repliedCount / emailsSentTotal) * 1000) / 10 : 0;

  const cards = [
    { label: 'Total Leads', value: totalLeads, icon: Users },
    { label: 'Active Conversations', value: activeConversations, icon: MessageSquare },
    { label: 'Meetings Booked', value: meetingsBooked, icon: Calendar },
    { label: 'Emails Sent (This Month)', value: emailsSentThisMonth, icon: Send },
  ];

  const engagementCards = [
    { label: 'Open Rate', value: `${openRate}%`, icon: Eye },
    { label: 'Reply Rate', value: `${replyRate}%`, icon: Reply },
    { label: 'Total Opens', value: openedCount, icon: TrendingUp },
    { label: 'Total Clicks', value: 0, icon: MousePointerClick },
  ];

  const isEmpty = totalLeads === 0 && scheduledJobs === 0;

  const inboxes = await prisma.inbox.findMany({
    where: { userId, status: 'CONNECTED' },
    select: { emailAddress: true, dailySendingCap: true, warmupThrottle: true, sentToday: true, sentDate: true },
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const inboxUsage = inboxes.map((inbox) => {
    const sentDate = inbox.sentDate ? new Date(inbox.sentDate) : null;
    const isSameDay = sentDate && sentDate.getTime() === today.getTime();
    const sent = isSameDay ? inbox.sentToday : 0;
    const cap = inbox.warmupThrottle ? Math.min(inbox.dailySendingCap, 20) : inbox.dailySendingCap;
    return { emailAddress: inbox.emailAddress, sent, cap };
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Overview of your outreach activities and performance.</p>
        </div>
        <DashboardUpdates />
      </div>

      {/* Onboarding Checklist */}
      <OnboardingChecklist steps={[
        { id: 'inbox', label: 'Connect an inbox', href: '/settings/inboxes', cta: 'Connect', done: connectedInboxes > 0 },
        { id: 'outreach', label: 'Create your first Outreach Type', href: '/outreach-types', cta: 'Create', done: outreachTypeCount > 0 },
        { id: 'leads', label: 'Add your first leads', href: '/leads', cta: 'Add leads', done: totalLeads > 0 },
        { id: 'campaign', label: 'Launch your first campaign', href: '/leads', cta: 'Launch', done: scheduledJobs > 0 || emailsSentThisMonth > 0 },
      ]} />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="border-gray-200 shadow-sm">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm font-medium text-gray-500">{card.label}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">{card.value}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50"><Icon className="h-5 w-5 text-blue-600" /></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Engagement Cards */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {engagementCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="border-gray-200 shadow-sm">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm font-medium text-gray-500">{card.label}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{card.value}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50"><Icon className="h-4 w-4 text-gray-500" /></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Queue + Inbox Health */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-2"><Activity className="h-5 w-5 text-blue-600" /><h3 className="text-sm font-medium text-gray-900">Queue / Scheduler</h3></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-blue-500" /><div><p className="text-xs text-gray-500">Scheduled</p><p className="text-lg font-semibold text-gray-900">{scheduledJobs}</p></div></div>
              <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-blue-500" /><div><p className="text-xs text-gray-500">Running</p><p className="text-lg font-semibold text-gray-900">{runningJobs}</p></div></div>
              <div className="flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" /><div><p className="text-xs text-gray-500">Failed</p><p className="text-lg font-semibold text-gray-900">{failedJobs}</p></div></div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2"><Mail className="h-5 w-5 text-blue-600" /><h3 className="text-sm font-medium text-gray-900">Inbox Health</h3></div>
              <Link href="/settings/inboxes"><Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-900">Manage</Button></Link>
            </div>
            {connectedInboxes === 0 && expiredInboxes === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-500"><AlertTriangle className="h-4 w-4 text-amber-500" />No inboxes connected. Connect one to start sending.</div>
            ) : (
              <div className="space-y-2">
                {expiredInboxes > 0 && (
                  <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0" />{expiredInboxes} inbox{expiredInboxes !== 1 ? 's' : ''} expired — reconnect to resume sending.</div>
                )}
                {inboxUsage.map((inbox) => (
                  <div key={inbox.emailAddress} className="flex items-center justify-between text-sm"><span className="text-gray-600">{inbox.emailAddress}</span><span className="text-gray-500">{inbox.sent} / {inbox.cap} today</span></div>
                ))}
                {connectedInboxes > 0 && (
                  <div className="flex items-center gap-2 pt-1 text-sm text-gray-500"><CheckCircle2 className="h-4 w-4 text-blue-500" />{connectedInboxes} inbox{connectedInboxes !== 1 ? 's' : ''} connected</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Feed */}
      {recentActivity.length > 0 && (
        <Card className="mt-6 border-gray-200 shadow-sm">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-blue-600" /><h3 className="text-sm font-medium text-gray-900">Recent Activity</h3></div>
              <Link href="/team"><Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-900">View All</Button></Link>
            </div>
            <div className="space-y-2">
              {recentActivity.map((log) => (
                <div key={log.id} className="flex items-start gap-3 rounded-md px-2 py-1.5 text-sm">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100">
                    <Activity className="h-3 w-3 text-gray-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-gray-700">
                      <span className="font-medium text-gray-900">{log.user.name}</span> {log.details || log.action}
                    </p>
                    <p className="text-xs text-gray-400">{format(new Date(log.createdAt), 'MMM d, HH:mm')}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {isEmpty && (
        <Card className="mt-8 border-gray-200 border-dashed bg-white shadow-sm">
          <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50"><Users className="h-7 w-7 text-blue-600" /></div>
            <h3 className="mt-5 text-lg font-semibold text-gray-900">No leads yet</h3>
            <p className="mt-2 max-w-md text-sm text-gray-500">You haven&apos;t added any leads or created any outreach campaigns yet. Start by creating your first outreach type to begin reaching prospects.</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link href="/outreach-types"><Button className="bg-blue-600 hover:bg-blue-700"><Plus className="mr-2 h-4 w-4" />Create your first Outreach Type</Button></Link>
              <Link href="/leads"><Button variant="outline" className="border-gray-200">Explore Leads<ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
