import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPlanLimits } from '@/lib/plan-limits';

// Get current billing status — plan, limits, usage
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, status: true, stripeCustomerId: true, stripeSubscriptionId: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const limits = getPlanLimits(user.plan);

    // Current usage
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [leadCount, emailCount] = await Promise.all([
      prisma.userLead.count({ where: { userId: session.user.id } }),
      prisma.message.count({
        where: {
          userId: session.user.id,
          role: 'ASSISTANT',
          createdAt: { gte: monthStart },
        },
      }),
    ]);

    return NextResponse.json({
      plan: user.plan,
      status: user.status,
      hasSubscription: !!user.stripeSubscriptionId,
      limits,
      usage: {
        leads: leadCount,
        emailsThisMonth: emailCount,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch billing status.' }, { status: 500 });
  }
}
