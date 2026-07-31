import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import Inbox from '@/models/Inbox';

interface Params {
  params: { id: string };
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const inbox = await Inbox.findOne({ _id: params.id, userId: session.user.id });
    if (!inbox) {
      return NextResponse.json({ error: 'Inbox not found.' }, { status: 404 });
    }

    await Inbox.findByIdAndDelete(params.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to disconnect inbox.' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { dailySendingCap, warmupThrottle } = body as {
      dailySendingCap?: number;
      warmupThrottle?: boolean;
    };

    await connectDB();
    const inbox = await Inbox.findOne({ _id: params.id, userId: session.user.id });
    if (!inbox) {
      return NextResponse.json({ error: 'Inbox not found.' }, { status: 404 });
    }

    await Inbox.findByIdAndUpdate(params.id, {
      ...(dailySendingCap !== undefined && { dailySendingCap }),
      ...(warmupThrottle !== undefined && { warmupThrottle }),
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update inbox.' }, { status: 500 });
  }
}
