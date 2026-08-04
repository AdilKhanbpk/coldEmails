import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import Meeting from '@/models/Meeting';
import { confirmMeeting, cancelMeeting, rescheduleMeeting } from '@/lib/reply-handler';

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const meetings = await Meeting.find({ leadId: id, userId: session.user.id })
      .sort({ scheduledTime: 1 })
      .populate({ path: 'leadId', select: 'companyName email' })
      .lean();

    const formatted = meetings.map((m: any) => ({
      ...m,
      id: m._id.toString(),
      lead: m.leadId ? { companyName: m.leadId.companyName, email: m.leadId.email } : null,
    }));

    return NextResponse.json({ meetings: formatted });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch meetings.' }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { meetingId, selectedSlot } = body as { meetingId?: string; selectedSlot?: string };

    if (!meetingId || !selectedSlot) {
      return NextResponse.json({ error: 'meetingId and selectedSlot are required.' }, { status: 400 });
    }

    await confirmMeeting(meetingId, session.user.id, selectedSlot);
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to confirm meeting.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { meetingId, action, newSlot } = body as {
      meetingId?: string;
      action?: 'cancel' | 'reschedule';
      newSlot?: string;
    };

    if (!meetingId || !action) {
      return NextResponse.json({ error: 'meetingId and action are required.' }, { status: 400 });
    }

    if (action === 'cancel') {
      await cancelMeeting(meetingId, session.user.id);
    } else if (action === 'reschedule' && newSlot) {
      await rescheduleMeeting(meetingId, session.user.id, newSlot);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update meeting.' }, { status: 500 });
  }
}
