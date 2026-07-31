import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import Notification from '@/models/Notification';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();
    const notifications = await Notification.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('id type message leadId seen createdAt')
      .lean();

    const formatted = notifications.map((n: any) => ({
      ...n,
      id: n._id.toString(),
      read: n.seen,
    }));

    return NextResponse.json({ notifications: formatted });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch notifications.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id } = body as { id?: string };

    if (!id) {
      return NextResponse.json({ error: 'Notification ID required.' }, { status: 400 });
    }

    await connectDB();
    await Notification.updateOne({ _id: id, userId: session.user.id }, { seen: true });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update notification.' }, { status: 500 });
  }
}
