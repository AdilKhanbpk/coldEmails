import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Get all upcoming meetings for the dashboard
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const meetings = await prisma.meeting.findMany({
      where: {
        userId: session.user.id,
        status: { in: ['PROPOSED', 'CONFIRMED'] },
        scheduledTime: { gte: new Date() },
      },
      orderBy: { scheduledTime: 'asc' },
      take: 10,
      include: {
        lead: {
          select: { id: true, companyName: true, email: true },
        },
      },
    });

    return NextResponse.json({ meetings });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch meetings.' }, { status: 500 });
  }
}
