import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, hasPermission } from '@/lib/permissions';
type Role = string;

// Admin panel — get system logs (job failures, send failures)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentUser = await getCurrentUser();
    if (!currentUser || !hasPermission(currentUser.role as Role, 'manage_team')) {
      return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
    }

    const [failedJobs, users, stats] = await Promise.all([
      prisma.job.findMany({
        where: { status: 'FAILED' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          lead: { select: { companyName: true, email: true } },
        },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          plan: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      Promise.all([
        prisma.job.count({ where: { status: 'SCHEDULED' } }),
        prisma.job.count({ where: { status: 'RUNNING' } }),
        prisma.job.count({ where: { status: 'FAILED' } }),
        prisma.job.count({ where: { status: 'COMPLETED' } }),
      ]).then(([scheduled, running, failed, completed]) => ({
        scheduled, running, failed, completed,
      })),
    ]);

    return NextResponse.json({ failedJobs, users, stats });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch admin data.' }, { status: 500 });
  }
}
