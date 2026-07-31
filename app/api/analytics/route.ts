import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import Message from '@/models/Message';
import UserLead from '@/models/UserLead';
import OutreachType from '@/models/OutreachType';
import Meeting from '@/models/Meeting';
import mongoose from 'mongoose';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const outreachTypeId = searchParams.get('outreachTypeId');

    const userId = new mongoose.Types.ObjectId(session.user.id);

    const leadFilter: Record<string, unknown> = { userId };
    if (outreachTypeId && outreachTypeId !== 'all') {
      leadFilter.outreachTypeId = new mongoose.Types.ObjectId(outreachTypeId);
    }

    const messageFilter: Record<string, unknown> = { userId, role: 'ASSISTANT' };
    if (startDate || endDate) {
      const dateRange: Record<string, Date> = {};
      if (startDate) dateRange.$gte = new Date(startDate);
      if (endDate) {
        const ed = new Date(endDate);
        ed.setHours(23, 59, 59, 999);
        dateRange.$lte = ed;
      }
      messageFilter.createdAt = dateRange;
    }

    const repliedStatuses = ['REPLIED', 'MEETING_BOOKED', 'COMPLETED', 'NOT_INTERESTED'];

    const [
      totalSent,
      totalOpened,
      totalClicked,
      totalReplied,
      totalBounced,
      totalMeetings,
      totalLeads,
    ] = await Promise.all([
      Message.countDocuments(messageFilter),
      Message.countDocuments({ ...messageFilter, openedAt: { $ne: null } }),
      Message.countDocuments({ ...messageFilter, clickedAt: { $ne: null } }),
      UserLead.countDocuments({ ...leadFilter, status: { $in: repliedStatuses } }),
      UserLead.countDocuments({ ...leadFilter, status: 'BOUNCED' }),
      Meeting.countDocuments({ userId, status: 'CONFIRMED' }),
      UserLead.countDocuments(leadFilter),
    ]);

    const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
    const clickRate = totalSent > 0 ? (totalClicked / totalSent) * 100 : 0;
    const replyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0;
    const bounceRate = totalLeads > 0 ? (totalBounced / totalLeads) * 100 : 0;

    const days = 30;
    const sendsData: { date: string; sends: number; opens: number; replies: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + 1);

      const dayMessageFilter: Record<string, unknown> = {
        userId,
        role: 'ASSISTANT',
        createdAt: { $gte: day, $lt: nextDay },
      };
      const dayLeadFilter: Record<string, unknown> = {
        userId,
        lastMessageDate: { $gte: day, $lt: nextDay },
        status: { $in: repliedStatuses },
      };
      if (outreachTypeId && outreachTypeId !== 'all') {
        dayLeadFilter.outreachTypeId = new mongoose.Types.ObjectId(outreachTypeId);
      }

      const [sends, opens, replies] = await Promise.all([
        Message.countDocuments(dayMessageFilter),
        Message.countDocuments({ ...dayMessageFilter, openedAt: { $gte: day, $lt: nextDay } }),
        UserLead.countDocuments(dayLeadFilter),
      ]);

      sendsData.push({
        date: day.toISOString().split('T')[0],
        sends,
        opens,
        replies,
      });
    }

    const outreachTypes = await OutreachType.find({ userId }).select('name').lean();

    const replyByType: { name: string; replyRate: number; total: number; replied: number }[] = [];
    for (const ot of outreachTypes) {
      const otId = ot._id as mongoose.Types.ObjectId;
      const [sent, replied] = await Promise.all([
        Message.countDocuments({ userId, role: 'ASSISTANT', leadId: { $in: await UserLead.find({ outreachTypeId: otId }).distinct('_id') } }),
        UserLead.countDocuments({ userId, outreachTypeId: otId, status: { $in: repliedStatuses } }),
      ]);
      replyByType.push({
        name: ot.name,
        replyRate: sent > 0 ? (replied / sent) * 100 : 0,
        total: sent,
        replied,
      });
    }

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
