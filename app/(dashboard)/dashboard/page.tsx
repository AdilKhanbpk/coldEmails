import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import UserLead from '@/models/UserLead';
import Conversation from '@/models/Conversation';
import Meeting from '@/models/Meeting';
import Message from '@/models/Message';
import Job from '@/models/Job';
import Inbox from '@/models/Inbox';
import ActivityLog from '@/models/ActivityLog';
import OutreachType from '@/models/OutreachType';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users, MessageSquare, Calendar, Send, Plus, ArrowRight,
  Clock, CheckCircle2, AlertTriangle, XCircle, Mail, Activity,
  TrendingUp, Eye, MousePointerClick, Reply,
} from 'lucide-react';
import { DashboardUpdates } from './dashboard-updates';
import { OnboardingChecklist } from '@/components/onboarding-checklist';
import { format } from 'date-fns';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = session!.user.id;

  await connectDB();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const repliedStatuses = ['REPLIED', 'MEETING_BOOKED', 'COMPLETED', 'NOT_INTERESTED'];

  const [
    totalLeads, activeConversations, meetingsBooked, emailsSentThisMonth,
    emailsSentTotal, openedCount, repliedCount,
    scheduledJobs, runningJobs, failedJobs,
    connectedInboxes, expiredInboxes,
    recentActivity,
    outreachTypeCount,
  ] = await Promise.all([
    UserLead.countDocuments({ userId }),
    Conversation.countDocuments({ userId, status: 'ACTIVE' }),
    Meeting.countDocuments({ userId, status: 'CONFIRMED' }),
    Message.countDocuments({ userId, role: 'ASSISTANT', createdAt: { $gte: monthStart } }),
    Message.countDocuments({ userId, role: 'ASSISTANT' }),
    Message.countDocuments({ userId, role: 'ASSISTANT', openedAt: { $ne: null } }),
    UserLead.countDocuments({ userId, status: { $in: repliedStatuses } }),
    Job.countDocuments({ userId, status: 'SCHEDULED' }),
    Job.countDocuments({ userId, status: 'RUNNING' }),
    Job.countDocuments({ userId, status: 'FAILED' }),
    Inbox.countDocuments({ userId, status: 'CONNECTED' }),
    Inbox.countDocuments({ userId, status: 'EXPIRED' }),
    ActivityLog.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .populate({ path: 'userId', select: 'name' })
      .lean(),
    OutreachType.countDocuments({ userId }),
  ]);

  const openRate = emailsSentTotal > 0 ? Math.round((openedCount / emailsSentTotal) * 1000) / 10 : 0;
  const replyRate = emailsSentTotal > 0 ? Math.round((repliedCount / emailsSentTotal) * 1000) / 10 : 0;

  const cards = [
    { label: 'Total leads', value: totalLeads, icon: Users },
    { label: 'Active conversations', value: activeConversations, icon: MessageSquare },
    { label: 'Meetings booked', value: meetingsBooked, icon: Calendar },
    { label: 'Emails sent this month', value: emailsSentThisMonth, icon: Send },
  ];

  const engagementCards = [
    { label: 'Open rate', value: `${openRate}%`, icon: Eye },
    { label: 'Reply rate', value: `${replyRate}%`, icon: Reply },
    { label: 'Total opens', value: openedCount, icon: TrendingUp },
    { label: 'Total clicks', value: 0, icon: MousePointerClick },
  ];

  const isEmpty = totalLeads === 0 && scheduledJobs === 0;

  const inboxes = await Inbox.find({ userId, status: 'CONNECTED' })
    .select('emailAddress dailySendingCap warmupThrottle sentToday sentDate')
    .lean();

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const inboxUsage = inboxes.map((inbox: any) => {
    const sentDate = inbox.sentDate ? new Date(inbox.sentDate) : null;
    const isSameDay = sentDate && sentDate.getTime() === today.getTime();
    const sent = isSameDay ? inbox.sentToday : 0;
    const cap = inbox.warmupThrottle ? Math.min(inbox.dailySendingCap, 20) : inbox.dailySendingCap;
    return { emailAddress: inbox.emailAddress, sent, cap };
  });

  const formattedActivity = recentActivity.map((log: any) => ({
    ...log,
    id: log._id.toString(),
    user: log.userId ? { name: log.userId.name } : { name: 'Unknown' },
    createdAt: log.createdAt,
  }));

  return (
    <div className="min-h-screen bg-[#FAF8F4]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">

        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 border-b border-stone-200 pb-6 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-serif text-[28px] font-medium tracking-tight text-stone-900 sm:text-3xl">
              Dashboard
            </h1>
            <p className="mt-1.5 text-sm text-stone-500">
              Overview of your outreach activity and performance.
            </p>
          </div>
          <div className="shrink-0">
            <DashboardUpdates />
          </div>
        </div>

        <div className="mb-8 sm:mb-10">
          <OnboardingChecklist steps={[
            { id: 'inbox', label: 'Connect an inbox', href: '/settings/inboxes', cta: 'Connect', done: connectedInboxes > 0 },
            { id: 'outreach', label: 'Create your first Outreach Type', href: '/outreach-types', cta: 'Create', done: outreachTypeCount > 0 },
            { id: 'leads', label: 'Add your first leads', href: '/leads', cta: 'Add leads', done: totalLeads > 0 },
            { id: 'campaign', label: 'Launch your first campaign', href: '/leads', cta: 'Launch', done: scheduledJobs > 0 || emailsSentThisMonth > 0 },
          ]} />
        </div>

        {/* Primary stats */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Card
                key={card.label}
                className="rounded-2xl border-stone-200 bg-white shadow-none transition-colors hover:border-stone-300"
              >
                <CardContent className="flex items-start justify-between p-5">
                  <div>
                    <p className="text-[13px] font-medium text-stone-500">{card.label}</p>
                    <p className="mt-2.5 font-serif text-[32px] font-medium leading-none tracking-tight text-stone-900">
                      {card.value}
                    </p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3E7DE]">
                    <Icon className="h-4.5 w-4.5 text-[#C1613F]" strokeWidth={1.75} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Engagement strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-4">
          {engagementCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3.5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100">
                  <Icon className="h-3.5 w-3.5 text-stone-500" strokeWidth={1.75} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium uppercase tracking-wide text-stone-400">
                    {card.label}
                  </p>
                  <p className="text-base font-semibold text-stone-900">{card.value}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Queue + Inbox health */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="rounded-2xl border-stone-200 bg-white shadow-none">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-5 flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#C1613F]" strokeWidth={1.75} />
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-stone-500">
                  Queue &amp; scheduler
                </h3>
              </div>
              <div className="grid grid-cols-3 divide-x divide-stone-200">
                <div className="flex flex-col gap-1 pr-3">
                  <div className="flex items-center gap-1.5 text-stone-400">
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span className="text-[11px] font-medium uppercase tracking-wide">Scheduled</span>
                  </div>
                  <p className="text-2xl font-semibold text-stone-900">{scheduledJobs}</p>
                </div>
                <div className="flex flex-col gap-1 px-3">
                  <div className="flex items-center gap-1.5 text-stone-400">
                    <Activity className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span className="text-[11px] font-medium uppercase tracking-wide">Running</span>
                  </div>
                  <p className="text-2xl font-semibold text-stone-900">{runningJobs}</p>
                </div>
                <div className="flex flex-col gap-1 pl-3">
                  <div className="flex items-center gap-1.5 text-stone-400">
                    <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                    <span className="text-[11px] font-medium uppercase tracking-wide">Failed</span>
                  </div>
                  <p className={`text-2xl font-semibold ${failedJobs > 0 ? 'text-red-600' : 'text-stone-900'}`}>
                    {failedJobs}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-stone-200 bg-white shadow-none">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[#C1613F]" strokeWidth={1.75} />
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-stone-500">
                    Inbox health
                  </h3>
                </div>
                <Link href="/settings/inboxes">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-900">
                    Manage
                  </Button>
                </Link>
              </div>

              {connectedInboxes === 0 && expiredInboxes === 0 ? (
                <div className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-3 text-sm text-stone-500">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" strokeWidth={1.75} />
                  No inboxes connected. Connect one to start sending.
                </div>
              ) : (
                <div className="space-y-3">
                  {expiredInboxes > 0 && (
                    <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                      {expiredInboxes} inbox{expiredInboxes !== 1 ? 's' : ''} expired — reconnect to resume sending.
                    </div>
                  )}

                  {inboxUsage.map((inbox) => {
                    const pct = inbox.cap > 0 ? Math.min(100, Math.round((inbox.sent / inbox.cap) * 100)) : 0;
                    return (
                      <div key={inbox.emailAddress}>
                        <div className="mb-1.5 flex items-center justify-between text-sm">
                          <span className="truncate pr-2 text-stone-700">{inbox.emailAddress}</span>
                          <span className="shrink-0 text-stone-400">{inbox.sent} / {inbox.cap}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                          <div
                            className="h-full rounded-full bg-[#C1613F]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {connectedInboxes > 0 && (
                    <div className="flex items-center gap-2 pt-1 text-sm text-stone-500">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
                      {connectedInboxes} inbox{connectedInboxes !== 1 ? 's' : ''} connected
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent activity */}
        {formattedActivity.length > 0 && (
          <Card className="mt-6 rounded-2xl border-stone-200 bg-white shadow-none">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[#C1613F]" strokeWidth={1.75} />
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-stone-500">
                    Recent activity
                  </h3>
                </div>
                <Link href="/team">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-900">
                    View all
                  </Button>
                </Link>
              </div>

              <div className="relative">
                <div className="absolute bottom-1 left-[11px] top-1 w-px bg-stone-200" aria-hidden="true" />
                <div className="space-y-4">
                  {formattedActivity.map((log) => (
                    <div key={log.id} className="relative flex items-start gap-3 pl-0">
                      <div className="relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-white bg-stone-100">
                        <div className="h-1.5 w-1.5 rounded-full bg-stone-400" />
                      </div>
                      <div className="min-w-0 flex-1 pb-0.5">
                        <p className="text-sm leading-relaxed text-stone-700">
                          <span className="font-medium text-stone-900">{log.user.name}</span>{' '}
                          {log.details || log.action}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-400">
                          {format(new Date(log.createdAt), 'MMM d, HH:mm')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {isEmpty && (
          <Card className="mt-8 rounded-2xl border-stone-200 border-dashed bg-white shadow-none">
            <CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F3E7DE]">
                <Users className="h-6 w-6 text-[#C1613F]" strokeWidth={1.75} />
              </div>
              <h3 className="mt-5 font-serif text-lg font-medium text-stone-900">No leads yet</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-stone-500">
                Add leads and set up an outreach type to start reaching prospects — this is where
                your campaigns and results will show up.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/outreach-types">
                  <Button className="bg-[#C1613F] text-white hover:bg-[#A94F31]">
                    <Plus className="mr-2 h-4 w-4" />
                    Create your first Outreach Type
                  </Button>
                </Link>
                <Link href="/leads">
                  <Button variant="outline" className="border-stone-300 text-stone-700 hover:bg-stone-50">
                    Explore leads
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}