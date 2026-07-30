import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Recent activity feed for the dashboard — last 10 activity log entries
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const logs = await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch activity.' }, { status: 500 });
  }
}
