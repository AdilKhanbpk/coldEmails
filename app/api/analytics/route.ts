import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Analytics API — computes metrics from Messages, UserLeads, and Meetings.
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const outreachTypeId = searchParams.get('outreachTypeId');

    const where: Record<string, unknown> = { userId: session.user.id };
    if (outreachTypeId && outreachTypeId !== 'all') {
      where.outreachTypeId = outreachTypeId;
    }
    const dateRange: Record<string, Date> = {};
    if (startDate) dateRange.gte = new Date(startDate);
    if (endDate) {
      const ed = new Date(endDate);
      ed.setHours(23, 59, 59, 999);
      dateRange.lte = ed;
    }

    const messageWhere: Record<string, unknown> = { userId: session.user.id };
    if (Object.keys(dateRange).length > 0) {
      messageWhere.createdAt = dateRange;
    }

    const leadWhere: Record<string, unknown> = { userId: session.user.id };
    if (outreachTypeId && outreachTypeId !== 'all') {
      leadWhere.outreachTypeId = outreachTypeId;
    }

    const [
      totalSent,
      totalOpened,
      totalClicked,
      totalReplied,
      totalBounced,
      totalMeetings,
      totalLeads,
    ] = await Promise.all([
      prisma.message.count({ where: { ...messageWhere, role: 'ASSISTANT' } }),
      prisma.message.count({ where: { ...messageWhere, role: 'ASSISTANT', openedAt: { not: null } } }),
      prisma.message.count({ where: { ...messageWhere, role: 'ASSISTANT', clickedAt: { not: null } } }),
      prisma.userLead.count({ where: { ...leadWhere, status: { in: ['REPLIED', 'MEETING_BOOKED', 'COMPLETED', 'NOT_INTERESTED'] } } }),
      prisma.userLead.count({ where: { ...leadWhere, status: 'BOUNCED' } }),
      prisma.meeting.count({ where: { userId: session.user.id, status: 'CONFIRMED' } }),
      prisma.userLead.count({ where: leadWhere }),
    ]);

    const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
    const clickRate = totalSent > 0 ? (totalClicked / totalSent) * 100 : 0;
    const replyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0;
    const bounceRate = totalLeads > 0 ? (totalBounced / totalLeads) * 100 : 0;

    // Sends over time (last 30 days by default)
    const days = 30;
    const sendsData: { date: string; sends: number; opens: number; replies: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + 1);

      const [sends, opens, replies] = await Promise.all([
        prisma.message.count({
          where: {
            userId: session.user.id,
            role: 'ASSISTANT',
            createdAt: { gte: day, lt: nextDay },
            ...(outreachTypeId && outreachTypeId !== 'all' ? { lead: { outreachTypeId } } : {}),
          },
        }),
        prisma.message.count({
          where: {
            userId: session.user.id,
            role: 'ASSISTANT',
            openedAt: { gte: day, lt: nextDay },
            ...(outreachTypeId && outreachTypeId !== 'all' ? { lead: { outreachTypeId } } : {}),
          },
        }),
        prisma.userLead.count({
          where: {
            userId: session.user.id,
            lastMessageDate: { gte: day, lt: nextDay },
            status: { in: ['REPLIED', 'MEETING_BOOKED', 'COMPLETED', 'NOT_INTERESTED'] },
            ...(outreachTypeId && outreachTypeId !== 'all' ? { outreachTypeId } : {}),
          },
        }),
      ]);

      sendsData.push({
        date: day.toISOString().split('T')[0],
        sends,
        opens,
        replies,
      });
    }

    // Reply rate by Outreach Type
    const outreachTypes = await prisma.outreachType.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true },
    });

    const replyByType: { name: string; replyRate: number; total: number; replied: number }[] = [];
    for (const ot of outreachTypes) {
      const [sent, replied] = await Promise.all([
        prisma.message.count({
          where: { userId: session.user.id, role: 'ASSISTANT', lead: { outreachTypeId: ot.id } },
        }),
        prisma.userLead.count({
          where: {
            userId: session.user.id,
            outreachTypeId: ot.id,
            status: { in: ['REPLIED', 'MEETING_BOOKED', 'COMPLETED', 'NOT_INTERESTED'] },
          },
        }),
      ]);
      replyByType.push({
        name: ot.name,
        replyRate: sent > 0 ? (replied / sent) * 100 : 0,
        total: sent,
        replied,
      });
    }

    // Funnel
    const funnel = {
      sent: totalSent,
      opened: totalOpened,
      replied: totalReplied,
      meetingBooked: totalMeetings,
    };

    return NextResponse.json({
      metrics: {
        totalSent,
        totalOpened,
        totalClicked,
        totalReplied,
        totalBounced,
        totalMeetings,
        totalLeads,
        openRate: Math.round(openRate * 10) / 10,
        clickRate: Math.round(clickRate * 10) / 10,
        replyRate: Math.round(replyRate * 10) / 10,
        bounceRate: Math.round(bounceRate * 10) / 10,
      },
      sendsData,
      replyByType,
      funnel,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch analytics.' }, { status: 500 });
  }
}
