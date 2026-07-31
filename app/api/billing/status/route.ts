import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import User from '@/models/User';
import UserLead from '@/models/UserLead';
import Message from '@/models/Message';
import { getPlanLimits } from '@/lib/plan-limits';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const user = await User.findById(session.user.id).select('plan status stripeCustomerId stripeSubscriptionId').lean();

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const limits = getPlanLimits(user.plan);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [leadCount, emailCount] = await Promise.all([
      UserLead.countDocuments({ userId: session.user.id }),
      Message.countDocuments({
        userId: session.user.id,
        role: 'ASSISTANT',
        createdAt: { $gte: monthStart },
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
