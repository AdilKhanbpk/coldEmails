import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Get notifications for the current user (for dashboard live updates via polling)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const notifications = await prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        type: true,
        message: true,
        leadId: true,
        read: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch notifications.' }, { status: 500 });
  }
}

// Mark a notification as read
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

    await prisma.notification.updateMany({
      where: { id, userId: session.user.id },
      data: { read: true },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update notification.' }, { status: 500 });
  }
}
