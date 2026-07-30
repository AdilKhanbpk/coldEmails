import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { confirmMeeting, cancelMeeting, rescheduleMeeting } from '@/lib/reply-handler';

interface Params {
  params: { id: string };
}

// Get meetings for a specific lead
export async function GET(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const meetings = await prisma.meeting.findMany({
      where: { leadId: params.id, userId: session.user.id },
      orderBy: { scheduledTime: 'asc' },
      include: { lead: { select: { companyName: true, email: true } } },
    });

    return NextResponse.json({ meetings });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch meetings.' }, { status: 500 });
  }
}

// Confirm a proposed meeting
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

// Cancel or reschedule a meeting
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
