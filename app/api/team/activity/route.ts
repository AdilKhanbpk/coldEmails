import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, hasPermission, logActivity } from '@/lib/permissions';
import type { Role } from '@prisma/client';

// Get activity log
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Managers and admins can see all activity; members see their own
    const canSeeAll = hasPermission(currentUser.role as Role, 'delete');

    const logs = await prisma.activityLog.findMany({
      where: canSeeAll ? {} : { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch activity log.' }, { status: 500 });
  }
}
